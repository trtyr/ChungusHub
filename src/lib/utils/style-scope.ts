/**
 * Preset-beautify stylesheet rewriting (P003). Pure string work: scope every selector to
 * the message container, demote layout red lines, gate imports. No DOM here, so bun can
 * test it directly; markdown.ts wires it into the DOMPurify hook.
 */

export const STYLE_SCOPE_CLASS = 'msg-style-scope';

/** @import survives only for https font hosts preset beautify CSS actually uses. */
const FONT_IMPORT_HOSTS =
	/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.loli\.net|fonts\.font\.im|fonts\.googleapis\.cn)/i;

/** Blacklist inside declaration bodies: a fixed panel can cover the whole app. Demote, don't
 *  delete, so the surrounding declaration list stays syntactically whole. */
function scopeDeclarations(body: string): string {
	return body.replace(/position\s*:\s*fixed/gi, 'position:static');
}

/** Prefix every selector with the message scope, drop app-root selectors, keep @-blocks
 *  coherent. One recursive level covers @media/@supports; @keyframes/@font-face bodies are
 *  not selector lists, so they pass through unscooped. */
function scopeBlock(css: string): string {
	let i = 0;
	let out = '';
	while (i < css.length) {
		const brace = css.indexOf('{', i);
		if (brace === -1) {
			out += css.slice(i);
			break;
		}
		const prelude = css.slice(i, brace);
		let depth = 1;
		let j = brace + 1;
		while (j < css.length && depth > 0) {
			if (css[j] === '{') depth++;
			else if (css[j] === '}') depth--;
			j++;
		}
		const body = css.slice(brace + 1, j - 1);
		const head = prelude.trim();
		if (/^@(media|supports)\b/i.test(head)) {
			out += prelude + '{' + scopeBlock(body) + '}';
		} else if (/^@(keyframes|-webkit-keyframes|font-face|counter-style|property)\b/i.test(head)) {
			out += prelude + '{' + body + '}';
		} else if (/^@/.test(head)) {
			out += prelude + '{' + scopeDeclarations(body) + '}';
		} else {
			const scoped = head
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s && !/^(html|body|:root)\b/i.test(s))
				.map((s) => `.${STYLE_SCOPE_CLASS} ${s}`)
				.join(', ');
			out += scoped ? scoped + ' {' + scopeDeclarations(body) + '}' : '';
		}
		i = j;
	}
	return out;
}

/** A `<style>` block a preset shipped: gate its imports, then scope what is left. */
export function scopeStylesheet(css: string): string {
	const gated = css.replace(/@import[^;]+;/gi, (m) => (FONT_IMPORT_HOSTS.test(m) ? m : ''));
	return scopeBlock(gated);
}
