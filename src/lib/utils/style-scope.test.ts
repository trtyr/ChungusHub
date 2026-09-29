/**
 * P003 stylesheet-scoping contracts, pure-string level (the DOMPurify wiring itself needs a
 * browser and is verified in the E2E pass). Also pins the marked side of R1: a multi-line
 * style sheet with blank lines must stay ONE html block. Run with `bun test`.
 */
import { describe, expect, test } from 'bun:test';
import { marked } from 'marked';

import { STYLE_SCOPE_CLASS, scopeStylesheet } from './style-scope';

describe('scopeStylesheet', () => {
	test('selectors are scoped to the message container', () => {
		const out = scopeStylesheet('.card { color: red; }');
		expect(out).toContain(`.${STYLE_SCOPE_CLASS} .card`);
	});

	test('html/body/:root selectors are dropped, siblings kept', () => {
		const out = scopeStylesheet('body { margin: 0; } .ok { color: blue; }');
		expect(out).not.toMatch(/body\s*\{/);
		expect(out).toContain(`.${STYLE_SCOPE_CLASS} .ok`);
	});

	test('position:fixed is demoted to static (red line)', () => {
		const out = scopeStylesheet('.bar { position: fixed; top: 0; }');
		expect(out.toLowerCase()).not.toContain('position:fixed');
		expect(out.toLowerCase()).not.toContain('position: fixed');
		expect(out.toLowerCase()).toContain('position:static');
	});

	test('keyframes names are prefixed and animation references follow (no app shadowing)', () => {
		const css = '@keyframes float { from { top: 0; } } .card { animation: float 2s ease; }';
		const out = scopeStylesheet(css);
		expect(out).toContain('@keyframes msg-kf-float');
		expect(out).not.toMatch(/@keyframes\s+float\b/);
		expect(out).toContain('animation: msg-kf-float 2s ease');
		// The animation-name longhand is renamed too.
		const out2 = scopeStylesheet(
			'@keyframes drift { to { left: 4px; } } .x { animation-name: drift; }'
		);
		expect(out2).toContain('animation-name: msg-kf-drift');
	});

	test('keyframes inside @media are renamed and referenced from a later rule', () => {
		const css = '@media (min-width: 30rem) { @keyframes pulse { from { opacity: 1; } } } ' +
			'.card { animation: pulse 1s infinite; }';
		const out = scopeStylesheet(css);
		expect(out).toContain('@keyframes msg-kf-pulse');
		expect(out).toContain('animation: msg-kf-pulse 1s infinite');
		// Unrelated identifier-looking words stay untouched.
		expect(out).not.toContain('msg-kf-media');
	});

	test('foreign url() targets are stripped; font hosts, data: and relative survive', () => {
		const css =
			'.card { background: url(https://evil.example/pixel.gif); }' +
			' @font-face { font-family: X; src: url(https://cdn.tracker.example/f.woff2); }' +
			' .b { background-image: url("https://fonts.gstatic.com/s/x.woff2"); }' +
			' .c { background: url(data:image/png;base64,AAA); }' +
			' .d { mask-image: url(/files/images/local.png); }';
		const out = scopeStylesheet(css);
		// Absolute foreign targets become `none` (background) or an invalid src (dropped).
		expect(out).not.toContain('evil.example');
		expect(out).not.toContain('cdn.tracker.example');
		expect(out).toContain('background: none');
		expect(out).toContain('src: none');
		// Whitelisted font hosts, data: URLs and origin-relative paths stay.
		expect(out).toContain('fonts.gstatic.com/s/x.woff2');
		expect(out).toContain('data:image/png;base64,AAA');
		expect(out).toContain('/files/images/local.png');
	});

	test('@import survives only for https font hosts', () => {
		const ok = scopeStylesheet('@import url(https://fonts.googleapis.com/css2?family=X);');
		expect(ok).toContain('fonts.googleapis.com');
		const evil = scopeStylesheet('@import url(https://evil.example/x.css);');
		expect(evil).not.toContain('evil.example');
	});

	test('@media scopes inner rules; @keyframes percentages stay unscooped', () => {
		const out = scopeStylesheet('@media (max-width: 600px) { .m { color: red; } } @keyframes spin { 0% { opacity: 0; } }');
		expect(out).toContain(`.${STYLE_SCOPE_CLASS} .m`);
		expect(out).toContain('0%');
		expect(out).not.toContain(`${STYLE_SCOPE_CLASS} 0%`);
	});

	test('selector lists scope each member; an all-dropped rule disappears', () => {
		const out = scopeStylesheet('html, .panel { color: red; }');
		expect(out).toContain(`.${STYLE_SCOPE_CLASS} .panel`);
		expect(out).not.toContain('html');
		const gone = scopeStylesheet('html, body { margin: 0; }');
		expect(gone.trim()).toBe('');
	});
});

describe('marked keeps a multi-line style sheet as one block (R1)', () => {
	test('blank lines inside <style> do not truncate the html block', () => {
		const md = '<style>\n.card {\n  color: red;\n\n  border: 1px solid;\n}\n</style>\n\ntext';
		const html = marked.parse(md, { async: false }) as string;
		expect((html.match(/<style>/g) ?? []).length).toBe(1);
		expect(html).toContain('border: 1px solid');
	});
});
