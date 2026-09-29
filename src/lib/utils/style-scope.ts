/**
 * Preset-beautify stylesheet rewriting (P003). Pure string work: scope every selector to
 * the message container, demote layout red lines, gate imports. No DOM here, so bun can
 * test it directly; markdown.ts wires it into the DOMPurify hook.
 */

export const STYLE_SCOPE_CLASS = 'msg-style-scope';

/** @import survives only for https font hosts preset beautify CSS actually uses. */
const FONT_IMPORT_HOSTS =
	/https?:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.loli\.net|fonts\.font\.im|fonts\.googleapis\.cn)/i;

/**
 * Foreign absolute url(...) targets are stripped the way foreign @imports are: a font
 * host on the same whitelist may pass (a preset shipping its own font files), data:/blob:
 * and origin-relative references are inert here, and every other absolute target becomes
 * `none`: a valid value where backgrounds use it, an invalid one where @font-face needs
 * a source; both land as "the declaration does nothing" instead of a request the reader
 * never asked for. Without this, beautify CSS could phone home (or trace) from a message.
 */
function stripForeignUrls(css: string): string {
	return css.replace(/url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (m, _quote, target: string) => {
		const t = target.trim();
		if (t === '' || /^(data:|blob:|\/|#|\.)/i.test(t)) return m;
		if (FONT_IMPORT_HOSTS.test(t)) return m;
		if (/^https?:\/\//i.test(t) || t.startsWith('//')) return 'none';
		return m;
	});
}

/** Blacklist inside declaration bodies: a fixed panel can cover the whole app. Demote, don't
 *  delete, so the surrounding declaration list stays syntactically whole. When a set of the
 *  block's own @keyframes names is handed in, animation references to them are renamed to
 *  their scoped spellings: an unprefixed preset keyframes name can collide with (and
 *  silently override) one the app itself defines. */
function scopeDeclarations(body: string, kfNames?: ReadonlySet<string>): string {
	let out = body.replace(/position\s*:\s*fixed/gi, 'position:static');
	if (kfNames && kfNames.size > 0) {
		for (const name of kfNames) {
			const re = new RegExp(`(animation(?:-name)?\\s*:\\s*[^;}]*?)(?<![\\w-])${name}(?![\\w-])`, 'gi');
			out = out.replace(re, `$1msg-kf-${name}`);
		}
	}
	return out;
}

/** Prefix every selector with the message scope, drop app-root selectors, keep @-blocks
 *  coherent. One recursive level covers @media/@supports; @font-face/@counter-style/
 *  @property bodies are not selector lists, so they pass through unscooped. @keyframes
 *  bodies pass through too, but the keyframes NAME is prefixed and every animation
 *  reference to it is renamed to match, namespaced, so a preset cannot shadow the
 *  app's own keyframes (or another preset's). */
function scopeBlock(css: string, kfNames: Set<string>): string {
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
			out += prelude + '{' + scopeBlock(body, kfNames) + '}';
		} else if (/^@(keyframes|-webkit-keyframes)\b/i.test(head)) {
			// The name is the prelude's last word. Renaming here and renaming every
			// animation reference below keeps the pairing intact inside this sheet.
			const nameMatch = head.match(/([\w-]+)\s*$/);
			if (nameMatch) {
				kfNames.add(nameMatch[1]);
				// Rebuild from `head` (trimmed): nameMatch.index is an index into it, and CSS
				// whitespace between the at-keyword and the name carries no meaning.
				out += head.slice(0, nameMatch.index) + `msg-kf-${nameMatch[1]} {` + body + '}';
			} else {
				out += prelude + '{' + body + '}';
			}
		} else if (/^@(font-face|counter-style|property)\b/i.test(head)) {
			out += prelude + '{' + body + '}';
		} else if (/^@/.test(head)) {
			out += prelude + '{' + scopeDeclarations(body, kfNames) + '}';
		} else {
			const scoped = head
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s && !/^(html|body|:root)\b/i.test(s))
				.map((s) => `.${STYLE_SCOPE_CLASS} ${s}`)
				.join(', ');
			out += scoped ? scoped + ' {' + scopeDeclarations(body, kfNames) + '}' : '';
		}
		i = j;
	}
	return out;
}

/** A `<style>` block a preset shipped: gate its imports, strip foreign url() targets,
 *  then scope what is left. */
export function scopeStylesheet(css: string): string {
	const gated = css.replace(/@import[^;]+;/gi, (m) => (FONT_IMPORT_HOSTS.test(m) ? m : ''));
	return scopeBlock(stripForeignUrls(gated), new Set());
}
