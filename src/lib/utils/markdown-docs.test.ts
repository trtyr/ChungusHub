/**
 * P003 phase 2: complete-HTML ```html blocks become sandboxed iframes; snippets stay
 * code blocks. Pure string contracts over the sanitized-HTML transform. `bun test`.
 */
import { describe, expect, test } from 'bun:test';

import { htmlDocumentIframes } from './markdown';

function codeBlock(html: string): string {
	return `<pre><code class="language-html">${html}</code></pre>`;
}

describe('htmlDocumentIframes', () => {
	test('a doctype document becomes a sandboxed iframe with escaped srcdoc', () => {
		const doc = codeBlock('&lt;!DOCTYPE html&gt;\n&lt;html&gt;&lt;body&gt;&lt;h1&gt;标题&lt;/h1&gt;&lt;/body&gt;&lt;/html&gt;');
		const out = htmlDocumentIframes(doc);
		expect(out).toContain('<iframe class="html-doc"');
		expect(out).toContain('sandbox=""');
		expect(out).toContain('srcdoc=');
		expect(out).not.toContain('<pre><code');
		// the decoded document is INSIDE srcdoc, attribute-escaped
		expect(out).toContain('&lt;h1&gt;');
	});

	test('an <html> root without doctype also counts as a document', () => {
		const out = htmlDocumentIframes(codeBlock('&lt;html&gt;&lt;body&gt;x&lt;/body&gt;&lt;/html&gt;'));
		expect(out).toContain('<iframe');
	});

	test('a plain snippet stays a code block', () => {
		const snippet = codeBlock('&lt;div class="card"&gt;片段&lt;/div&gt;');
		expect(htmlDocumentIframes(snippet)).toBe(snippet);
	});

	test('non-html code blocks are untouched', () => {
		const js = '<pre><code class="language-js">const x = 1;</code></pre>';
		expect(htmlDocumentIframes(js)).toBe(js);
	});

	test('mixed content: only the document block converts', () => {
		const mixed = codeBlock('&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;/html&gt;') + '\n' + codeBlock('&lt;span&gt;片段&lt;/span&gt;');
		const out = htmlDocumentIframes(mixed);
		expect(out).toContain('<iframe');
		expect(out).toContain('<pre><code class="language-html">&lt;span&gt;');
	});
});
