/**
 * Render-doc: the execution channel for document-type beautify (P003 phase 2, opened up
 * 2026-09-30 by user decision - see goal munw6bi7 / ticket EN-17).
 *
 * A ```html block carrying a complete document used to render as a `sandbox=""` srcdoc
 * iframe: script inert by construction, and - the part that mattered more than scripts -
 * a srcdoc document INHERITS the app's CSP, which pins img/font/connect to the origin,
 * so a card shipping its cover art from a file host and its type from Google Fonts could
 * never load either. There is no per-iframe CSP override for srcdoc; the escape hatch is
 * serving the same bytes from a same-origin URL whose RESPONSE HEADERS carry their own
 * policy. So: the client uploads the document here, gets a random-token URL back, and
 * points the iframe at it. The response CSP is the wide one (user decision: ST-faithful
 * rendering, scripts and cross-origin loads alike), the sandbox attribute stays the
 * other half of the boundary - `allow-scripts` WITHOUT `allow-same-origin` keeps the
 * frame at an opaque origin, so card scripts can run and reach the network but can
 * touch none of the app's DOM, storage, or cookies.
 *
 * The store is in-memory on purpose: the source of truth is the message text itself, and
 * every device re-uploads on render. Entries expire and the store prunes to a cap, so a
 * token is a short-lived capability (knowing one lets you fetch that one document - the
 * same bytes the message already shows - and nothing else).
 */

const MAX_BYTES = 2_000_000;
const MAX_ENTRIES = 64;
const TTL_MS = 30 * 60 * 1000;

const DOC_MARKER_RE = /<!doctype html|<html[\s>]/i;
const TOKEN_RE = /^[0-9a-f]{32}$/;

const store = new Map<string, { html: string; at: number }>();

export const RENDER_DOC_URL_PREFIX = '/render-doc/';

/** Same judgment the client made before uploading: this route exists to serve complete
 *  documents, not to be a general paste bin. Keeping the marker check on both sides
 *  means the endpoint refuses by itself whatever it was never meant to hold. */
export function isRenderableDocument(html: string): boolean {
	return DOC_MARKER_RE.test(html);
}

function prune(now = Date.now()): void {
	for (const [token, entry] of store) {
		if (now - entry.at > TTL_MS) store.delete(token);
	}
	while (store.size > MAX_ENTRIES) {
		const oldest = store.keys().next().value;
		if (oldest === undefined) break;
		store.delete(oldest);
	}
}

/** Store a document and return its capability URL, or null when it is not the kind of
 *  thing this channel accepts (too big, not a document). */
export function storeRenderDoc(html: string): string | null {
	if (!html.trim() || html.length > MAX_BYTES || !isRenderableDocument(html)) return null;
	const token = crypto.randomUUID().replace(/-/g, '');
	store.set(token, { html, at: Date.now() });
	prune();
	return `${RENDER_DOC_URL_PREFIX}${token}`;
}

/** The document behind a token, if it is still alive. Reading does not consume it: the
 *  iframe reloads (device rotation, theme reflow) and must get the same bytes again. */
export function getRenderDoc(token: string): string | null {
	if (!TOKEN_RE.test(token)) return null;
	const entry = store.get(token);
	if (!entry) return null;
	if (Date.now() - entry.at > TTL_MS) {
		store.delete(token);
		return null;
	}
	return entry.html;
}

/**
 * The height reporter injected into every served document. It must live inside the
 * frame: an opaque-origin frame hides its contentDocument from the parent, so the only
 * way the host learns the real height is a postMessage from in here. Three triggers -
 * DOMContentLoaded, load, and a poll - because late web fonts and slow cover images
 * both change the height after the observers have already fired. Every Nth poll sends
 * unconditionally with the viewport size, so a frame that seems stuck reports its
 * living conditions instead of staying silent while its host guesses.
 */
const HEIGHT_REPORTER = `<script>(function(){
var last=-1,n=0;
function send(h,force){if(force||h>0&&h!==last){last=h;try{parent.postMessage({t:"chungushub-html-doc-height",h:h,vw:innerWidth,vh:innerHeight},"*")}catch(e){}}}
function measure(){var d=document.documentElement,b=document.body;send(Math.ceil(Math.max(d?d.scrollHeight:0,b?b.scrollHeight:0)),false)}
try{window.onerror=function(m){try{parent.postMessage({t:"chungushub-html-doc-error",msg:String(m).slice(0,200)},"*")}catch(e){}}}catch(e){}
function arm(){
measure();
if(typeof ResizeObserver!=="undefined"){
try{new ResizeObserver(function(){measure()}).observe(document.documentElement)}catch(e){}
if(document.body)try{new ResizeObserver(function(){measure()}).observe(document.body)}catch(e){}
}
window.addEventListener("load",measure);
setInterval(function(){n++;measure();if(n%5===0)send(last<0?0:last,true)},2000);
}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",arm)}else{arm()}
})();<\/script>`;

/** Serve the document bytes with the execution policy as response headers. The host page
 *  keeps its own tight CSP untouched - this policy applies to the frame's document
 *  alone, which is the whole point of routing through a URL instead of srcdoc. */
export function serveRenderDocGet(pathname: string): Response {
	const token = pathname.slice(RENDER_DOC_URL_PREFIX.length);
	const html = getRenderDoc(token);
	if (html === null) return new Response('Not found', { status: 404 });
	const withReporter = injectHeightReporter(html);
	return new Response(withReporter, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store',
			'x-content-type-options': 'nosniff',
			'content-security-policy':
				"default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; frame-ancestors 'self'"
		}
	});
}

/** Inject the reporter after </head> (the honest spot for a complete document), falling
 *  back to after <body…>, then to the very top. Injecting BEFORE the doctype would flip
 *  the document into quirks mode, so the top fallback is the last resort it looks like. */
export function injectHeightReporter(html: string): string {
	if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, (m) => m + HEIGHT_REPORTER);
	if (/<body[^>]*>/i.test(html)) return html.replace(/<body[^>]*>/i, (m) => m + HEIGHT_REPORTER);
	return HEIGHT_REPORTER + html;
}

/** Upload side. Text body, not JSON: the payload IS a text document. */
export async function handleRenderDocPost(req: Request): Promise<Response> {
	const type = (req.headers.get('content-type') ?? '').split(';')[0].trim();
	if (type !== 'text/plain' && type !== 'text/html') {
		return Response.json({ error: 'Expected a text/plain document body.' }, { status: 415 });
	}
	const html = await req.text();
	const url = storeRenderDoc(html);
	if (url === null) {
		return Response.json(
			{ error: 'Not a complete HTML document, empty, or over the size limit.' },
			{ status: 422 }
		);
	}
	return Response.json({ url });
}
