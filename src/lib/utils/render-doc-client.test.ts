/**
 * render-doc-client contracts: the fingerprint that guards reconcile-stability, and the
 * hydrate upgrade path (pending srcdoc frame → live token-URL frame), including its
 * degradation when the channel is unavailable. DOM through happy-dom, fetch mocked.
 *
 * The URL cache is module-level by design (streaming must not re-upload), so the tests
 * lean into that: the cache test asserts the reuse explicitly, and the failure test
 * drives a DISTINCT document so it exercises the network path, not the cache.
 * `bun test`.
 */
import { describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';

import { docFingerprint, hydrateHtmlDocs } from './render-doc-client';

const DOC_A =
	'<!DOCTYPE html><html><head><title>a</title></head><body><p>alpha</p></body></html>';
const DOC_B =
	'<!DOCTYPE html><html><head><title>b</title></head><body><p>bravo</p></body></html>';

function frameWith(srcdoc: string): HTMLIFrameElement {
	const win = new Window();
	const frame = win.document.createElement('iframe');
	frame.className = 'html-doc';
	frame.setAttribute('sandbox', '');
	frame.setAttribute('srcdoc', srcdoc);
	return frame;
}

function rootWith(frame: HTMLIFrameElement): HTMLElement {
	const win = frame.ownerDocument as unknown as Document;
	const root = win.createElement('div');
	root.appendChild(frame);
	// Attach to the document: the hydrate guard refuses to take over a frame that is
	// not connected, and an orphaned root would leave every frame disconnected.
	win.body.appendChild(root);
	return root as unknown as HTMLElement;
}

/** Flush the hydrate promise chain (upload → parse → apply). */
async function settle(): Promise<void> {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('docFingerprint', () => {
	test('deterministic for identical content, distinct for changed content', () => {
		expect(docFingerprint(DOC_A)).toBe(docFingerprint(DOC_A));
		expect(docFingerprint(DOC_A)).not.toBe(docFingerprint(`${DOC_A} `));
		expect(docFingerprint('')).not.toBe(docFingerprint('x'));
	});
});

describe('hydrateHtmlDocs', () => {
	test('a pending frame upgrades to live: src set, srcdoc gone, scripts allowed', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ url: '/render-doc/' + 'a'.repeat(32) }), {
				status: 200
			})) as typeof fetch;

		try {
			const frame = frameWith(DOC_A);
			const root = rootWith(frame);
			hydrateHtmlDocs(root as HTMLElement);
			await settle();

			expect(frame.getAttribute('srcdoc')).toBeNull();
			expect(frame.getAttribute('src')).toBe('/render-doc/' + 'a'.repeat(32));
			const sandbox = frame.getAttribute('sandbox') ?? '';
			expect(sandbox).toContain('allow-scripts');
			// The opaque-origin guarantee: same-origin rights must NOT come along.
			expect(sandbox).not.toContain('allow-same-origin');
			expect(frame.getAttribute('data-doc-fp')).toBe(docFingerprint(DOC_A));
		} finally {
			globalThis.fetch = original;
		}
	});

	test('a failed upload leaves the frame in its frozen-but-safe srcdoc form', async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;
		try {
			const frame = frameWith(DOC_B); // distinct from DOC_A: dodge the URL cache
			const root = rootWith(frame);
			hydrateHtmlDocs(root as HTMLElement);
			await settle();
			expect(frame.getAttribute('srcdoc')).toBe(DOC_B);
			expect(frame.getAttribute('src')).toBeNull();
			expect(frame.getAttribute('sandbox')).toBe('');
		} finally {
			globalThis.fetch = original;
		}
	});

	test('identical content across frames reuses the upload (no second POST)', async () => {
		let calls = 0;
		const original = globalThis.fetch;
		globalThis.fetch = (async () => {
			calls++;
			return new Response(JSON.stringify({ url: '/render-doc/' + 'c'.repeat(32) }), {
				status: 200
			});
		}) as typeof fetch;
		try {
			// DOC_A was uploaded by the first test; two fresh pending frames with the same
			// content must BOTH come from the cache - a streaming rebuild draws its frames
			// fresh every patch, and the cache is exactly what keeps that cheap.
			const first = frameWith(DOC_A);
			const root = rootWith(first);
			const twin = frameWith(DOC_A);
			root.appendChild(twin);
			hydrateHtmlDocs(root as HTMLElement);
			await settle();
			expect(calls).toBe(0);
			// The cache serves whichever URL the earlier upload stored (test 1's mock
			// returned the a… token); the contract is "no new POST, a valid token URL",
			// not which token.
			expect(first.getAttribute('src')).toMatch(/^\/render-doc\/[0-9a-f]{32}$/);
			expect(twin.getAttribute('src')).toMatch(/^\/render-doc\/[0-9a-f]{32}$/);
			expect(first.getAttribute('src')).toBe(twin.getAttribute('src'));
		} finally {
			globalThis.fetch = original;
		}
	});
});
