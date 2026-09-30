/**
 * server/render-doc.ts contracts: the upload/serve channel for document-type beautify
 * (goal munw6bi7 / ticket EN-17). Pure module tests over the store, the serve headers,
 * and the reporter injection. `bun test`.
 */
import { describe, expect, test } from 'bun:test';

import {
	handleRenderDocPost,
	injectHeightReporter,
	getRenderDoc,
	isRenderableDocument,
	serveRenderDocGet,
	storeRenderDoc
} from './render-doc';

const DOC = '<!DOCTYPE html><html><head><title>t</title></head><body><p>hi</p></body></html>';
const DOC_NO_HEAD = '<html><body><p>hi</p></body></html>';
const DOC_BARE = '<p>bare</p>';

describe('storeRenderDoc / getRenderDoc', () => {
	test('a complete document gets a token URL and reads back', () => {
		const url = storeRenderDoc(DOC);
		expect(url).toMatch(/^\/render-doc\/[0-9a-f]{32}$/);
		expect(getRenderDoc(url!.slice('/render-doc/'.length))).toBe(DOC);
	});

	test('reading does not consume: a second read returns the same bytes', () => {
		const url = storeRenderDoc(DOC)!;
		const token = url.slice('/render-doc/'.length);
		expect(getRenderDoc(token)).toBe(DOC);
		expect(getRenderDoc(token)).toBe(DOC);
	});

	test('a snippet is refused, on both sides', () => {
		expect(isRenderableDocument(DOC_BARE)).toBe(false);
		expect(storeRenderDoc(DOC_BARE)).toBeNull();
	});

	test('empty and oversized documents are refused', () => {
		expect(storeRenderDoc('   ')).toBeNull();
		expect(storeRenderDoc('<!DOCTYPE html>' + 'x'.repeat(2_000_001))).toBeNull();
	});

	test('unknown and malformed tokens read as null', () => {
		expect(getRenderDoc('0'.repeat(32))).toBeNull();
		expect(getRenderDoc('../etc/passwd')).toBeNull();
		expect(getRenderDoc('')).toBeNull();
	});

	test('the store prunes to its cap: the oldest entry dies first', () => {
		// The cap is a module constant (64); 70 uploads must evict the earliest.
		const urls: string[] = [];
		for (let i = 0; i < 70; i++) {
			urls.push(storeRenderDoc(`<!DOCTYPE html><html><body>${i}</body></html>`)!);
		}
		const firstToken = urls[0].slice('/render-doc/'.length);
		const lastToken = urls[69].slice('/render-doc/'.length);
		expect(getRenderDoc(firstToken)).toBeNull();
		expect(getRenderDoc(lastToken)).not.toBeNull();
	});
});

describe('serveRenderDocGet', () => {
	test('served bytes carry the execution CSP and no-store', () => {
		const url = storeRenderDoc(DOC)!;
		const res = serveRenderDocGet(url);
		expect(res.status).toBe(200);
		expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
		expect(res.headers.get('cache-control')).toBe('no-store');
		expect(res.headers.get('x-content-type-options')).toBe('nosniff');
		const csp = res.headers.get('content-security-policy') ?? '';
		expect(csp).toContain("default-src *");
		expect(csp).toContain("'unsafe-inline'");
		expect(csp).toContain("frame-ancestors 'self'");
	});

	test('an unknown token is a bare 404', () => {
		const res = serveRenderDocGet('/render-doc/ffffffffffffffffffffffffffffffff');
		expect(res.status).toBe(404);
	});
});

describe('injectHeightReporter', () => {
	test('a document with </head> gets the reporter right after it', () => {
		const out = injectHeightReporter(DOC);
		const headEnd = out.indexOf('</head>');
		expect(headEnd).toBeGreaterThan(0);
		expect(out.slice(headEnd, headEnd + '</head><script>'.length)).toBe('</head><script>');
		expect(out).toContain('chungushub-html-doc-height');
		// The original document survives intact below the injection.
		expect(out.endsWith('</body></html>')).toBe(true);
	});

	test('a document without </head> but with <body> gets it after <body>', () => {
		const out = injectHeightReporter(DOC_NO_HEAD);
		expect(out).toContain('<body><script>');
	});

	test('a bare fragment gets the reporter prepended', () => {
		const out = injectHeightReporter(DOC_BARE);
		expect(out.startsWith('<script>')).toBe(true);
		expect(out.endsWith(DOC_BARE)).toBe(true);
	});
});

describe('handleRenderDocPost', () => {
	test('a text/plain upload returns a URL', async () => {
		const req = new Request('http://x/api/render-doc', {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: DOC
		});
		const res = await handleRenderDocPost(req);
		expect(res.status).toBe(200);
		const data = (await res.json()) as { url: string };
		expect(data.url).toMatch(/^\/render-doc\/[0-9a-f]{32}$/);
	});

	test('a non-text content type is 415', async () => {
		const req = new Request('http://x/api/render-doc', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}'
		});
		expect((await handleRenderDocPost(req)).status).toBe(415);
	});

	test('a snippet upload is 422', async () => {
		const req = new Request('http://x/api/render-doc', {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: DOC_BARE
		});
		expect((await handleRenderDocPost(req)).status).toBe(422);
	});
});
