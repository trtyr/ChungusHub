/**
 * The P003 phase 2 fence through the REAL pipeline pieces (audit gap closed): the
 * ```html document fence goes through real marked parsing, real DOMPurify with the
 * app's own hooks + config, then the real htmlDocumentIframes pass. markdown.ts's
 * module-level DOMPurify binds to a stub when other tests load it first, so this test
 * rebuilds the exact pipeline with a fresh window-bound DOMPurify (same doctrine as
 * scripts/p003-sanitize-verify.ts, in-suite).
 */
import { describe, test, expect } from 'bun:test';
import { Window } from 'happy-dom';
import { marked } from 'marked';
import createDOMPurify from 'dompurify';

import { registerMarkdownHooks, sanitizeConfig, htmlDocumentIframes } from './markdown';

function pipeline(raw: string): string {
	const win = new Window();
	const purify = createDOMPurify(win as unknown as Window);
	registerMarkdownHooks(purify);
	const parsed = marked.parse(raw, { async: false }) as string;
	const sanitized = purify.sanitize(parsed, sanitizeConfig());
	return htmlDocumentIframes(sanitized);
}

describe('document fences through the real render pipeline', () => {
	test('a complete-HTML fence becomes a sandbox="" iframe', () => {
		const doc = [
			'```html',
			'<!DOCTYPE html>',
			'<html><head><style>p{color:red}</style></head>',
			'<body><p>hi</p><script>alert(1)</script></body></html>',
			'```'
		].join('\n');
		const out = pipeline(doc);
		expect(out).toContain('<iframe');
		expect(out).toContain('sandbox=""');
		expect(out).not.toContain('allow-scripts');
	});

	test('an ordinary fence (not a complete document) stays a code block', () => {
		const out = pipeline(['```html', '<p>fragment</p>', '```'].join('\n'));
		expect(out).not.toContain('<iframe');
	});
});
