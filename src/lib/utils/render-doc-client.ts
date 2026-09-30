/**
 * Client half of the render-doc channel (see server/render-doc.ts for the server half).
 *
 * `htmlDocumentIframes` (utils/markdown.ts) emits every complete-document ```html block
 * as a `sandbox=""` srcdoc iframe - the safe-by-default form. This module upgrades those
 * frames to live ones: it uploads the document to /api/render-doc, points the iframe at
 * the returned token URL (whose response CSP allows scripts and cross-origin loads),
 * and swaps the sandbox to `allow-scripts` WITHOUT `allow-same-origin`, so card scripts
 * run at an opaque origin and can touch nothing of the app's.
 *
 * Degradation is deliberate: an upload that fails (server too old, offline, 4xx) leaves
 * the frame exactly as markdown.ts made it - the frozen-but-safe srcdoc form.
 *
 * The height half of this file listens for the reporter the server injects into every
 * served document and stretches the matching frame. Until a frame reports, it keeps the
 * CSS clamp fallback, so nothing depends on the script inside.
 */

const SANDBOX_LIVE = 'allow-scripts allow-popups allow-forms allow-modals';
const URL_CACHE_MAX = 64;
const HEIGHT_MIN = 80;
const HEIGHT_MAX = 4000;

/** content fingerprint → upload URL. Streaming reconciles re-patch the same frame many
 *  times a second; identical content must not re-upload. */
const urlCache = new Map<string, string>();

/**
 * Synchronous 64-bit fingerprint (two FNV-1a rounds, different offsets) as hex. Not
 * cryptographic - its one job is telling "same document as the one already uploaded"
 * apart from "changed document" across stream patches, and 64 honest bits are plenty
 * for that. Synchronous because patchAttributes below must decide per frame mid-patch.
 */
export function docFingerprint(text: string): string {
	let a = 0x811c9dc5;
	let b = 0x01000193;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		a = Math.imul(a ^ c, 0x01000193);
		b = Math.imul(b ^ (c + i), 0x85ebca6b);
	}
	return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** The frame attributes that mean "this frame is live": src points at the render-doc
 *  channel, srcdoc is gone, and the sandbox runs scripts. The source-of-truth hash rides
 *  along in data-doc-fp so a reconcile can tell an unchanged frame from a rewritten one. */
function applyLive(frame: HTMLIFrameElement, srcdoc: string, url: string): void {
	const fp = docFingerprint(srcdoc);
	if (frame.dataset.docFp === fp && frame.getAttribute('src') === url) return;
	frame.dataset.docFp = fp;
	frame.setAttribute('sandbox', SANDBOX_LIVE);
	frame.removeAttribute('srcdoc');
	// Chrome quirk, observed live (EN-17 acceptance): a sandbox change made in the SAME
	// task that starts the navigation can apply the OLD sandbox to the new document —
	// scripts stay inert, the reporter never speaks, and the frame looks loaded but is
	// frozen. Splitting the src assignment across a task boundary lets the new sandbox
	// set become authoritative before the frame navigates. The self-heal in hydrate()
	// below catches any residual timing path.
	setTimeout(() => {
		if (frame.getAttribute('src') === url) return;
		frame.setAttribute('src', url);
	}, 0);
}

async function hydrate(frame: HTMLIFrameElement): Promise<void> {
	const srcdoc = frame.getAttribute('srcdoc');
	if (srcdoc === null || srcdoc.trim() === '') return;
	const fp = docFingerprint(srcdoc);

	const cached = urlCache.get(fp);
	if (cached) {
		applyLive(frame, srcdoc, cached);
		armSelfHeal(frame, cached);
		return;
	}

	try {
		const res = await fetch('/api/render-doc', {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: srcdoc
		});
		if (!res.ok) return; // keep the frozen-but-safe srcdoc form
		const data = (await res.json()) as { url?: string };
		if (typeof data.url !== 'string' || !data.url.startsWith('/render-doc/')) return;
		if (urlCache.size >= URL_CACHE_MAX) {
			const oldest = urlCache.keys().next().value;
			if (oldest !== undefined) urlCache.delete(oldest);
		}
		urlCache.set(fp, data.url);
		// The frame may have been re-patched while the upload was in flight; only take
		// over a frame that still shows the exact content we uploaded.
		if (frame.isConnected && frame.getAttribute('srcdoc') === srcdoc) {
			applyLive(frame, srcdoc, data.url);
			armSelfHeal(frame, data.url);
		}
	} catch {
		// Offline or server without the channel: leave the srcdoc sandbox as is.
	}
}

/** One-shot self-heal: a live frame that never reported a height within 3s has either
 *  failed to load its document or is running it under a dead sandbox (the Chrome quirk
 *  applyLive works around). Re-issue the navigation once — the sandbox attribute is by
 *  then long-settled, and the reload lands live. Frames that DID report carry an inline
 *  height and are left alone. */
function armSelfHeal(frame: HTMLIFrameElement, url: string): void {
	setTimeout(() => {
		if (!frame.isConnected) return;
		if (frame.getAttribute('src') !== url) return; // re-patched to other content
		if (frame.style.height) return; // reporter spoke; the frame is alive
		frame.removeAttribute('src');
		void frame.offsetWidth;
		frame.setAttribute('src', url);
	}, 3000);
}

/** Upgrade every pending html-doc frame under `root`. Called after each reconcile patch
 *  (renderedHtml) - cheap when everything is already live (one fingerprint per frame). */
export function hydrateHtmlDocs(root: HTMLElement): void {
	const frames = root.querySelectorAll<HTMLIFrameElement>('iframe.html-doc[srcdoc]');
	if (frames.length === 0) return;
	for (const frame of frames) void hydrate(frame);
}

/** One listener for the whole app: stretch whichever live frame sent the report. The
 *  reporter is injected server-side (server/render-doc.ts), so only documents that went
 *  through the channel can ever send these messages. */
if (typeof window !== 'undefined') {
	window.addEventListener('message', (event: MessageEvent) => {
		const data = event.data as { t?: string; h?: number; vw?: number; msg?: string } | null;
		if (!data || typeof data.t !== 'string') return;
		if (data.t === 'chungushub-html-doc-error') {
			// A card script crashed inside its frame. Console, not a toast: the document
			// still renders (its static half does, anyway) and this is diagnostic output.
			console.warn('[html-doc] script error inside rendered document:', data.msg);
			return;
		}
		if (data.t !== 'chungushub-html-doc-height') return;
		if (typeof data.h !== 'number' || !Number.isFinite(data.h)) return;
		const h = Math.round(Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, data.h)));
		for (const frame of document.querySelectorAll<HTMLIFrameElement>('iframe.html-doc')) {
			if (frame.contentWindow === event.source) {
				frame.style.height = `${h}px`;
			}
		}
	});
}
