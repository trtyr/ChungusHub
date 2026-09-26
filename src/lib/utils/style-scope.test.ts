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
