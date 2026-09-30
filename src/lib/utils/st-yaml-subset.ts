/**
 * A deliberately small YAML subset for card-shipped `[InitialVariables]` seeds
 * (P015 档1a's YAML fallback, landed in P018-goal as a zero-dependency parser).
 * Supports exactly what card authors actually write for a variable seed:
 *
 *   key: value            scalars (string / number / true / false / null)
 *   "key": value          quoted keys and quoted strings (quotes stripped)
 *   nested:               indentation-nested mappings -> dotted paths via flatten
 *   list:                 block lists (`- item` lines) -> arrays
 *   trailing comments     `# ...` outside quotes
 *
 * Everything else (tabs in indentation, block scalars `|` `>`, anchors/aliases,
 * flow collections, multi-document streams) is rejected with a named error rather
 * than half-parsed: a seed we cannot read confidently must not become variables.
 */

export type YamlSubsetResult =
	| { ok: true; data: Record<string, unknown> }
	| { ok: false; error: 'yaml-invalid' | 'yaml-empty' };

interface Line {
	indent: number;
	text: string;
	item: boolean;
}

export function parseYamlSubset(text: string): YamlSubsetResult {
	// Flow collections belong to JSON, which already had its chance to claim this
	// body; the subset parses block-style YAML only.
	const trimmed = (text ?? '').trim();
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) return { ok: false, error: 'yaml-invalid' };
	const lines: Line[] = [];
	for (const raw of (text ?? '').split('\n')) {
		if (/^[ ]*\t/.test(raw)) return { ok: false, error: 'yaml-invalid' };
		const body = stripComment(raw);
		if (!body.trim()) continue;
		const m = /^([ ]*)(.*)$/.exec(body)!;
		const content = m[2];
		const item = content.startsWith('- ') || content === '-';
		lines.push({ indent: m[1].length, text: item ? content.slice(2) : content, item });
	}
	if (lines.length === 0) return { ok: false, error: 'yaml-empty' };
	if (/^---/.test(lines[0].text)) return { ok: false, error: 'yaml-invalid' };

	const top = parseBlock(lines, 0, lines[0].indent);
	if (top === null || top.next !== lines.length) return { ok: false, error: 'yaml-invalid' };
	if (typeof top.value !== 'object' || top.value === null || Array.isArray(top.value)) {
		return { ok: false, error: 'yaml-invalid' };
	}
	return { ok: true, data: top.value as Record<string, unknown> };
}

/** Parse one mapping or list block at `indent`. Returns the value and the index of the
 *  first line NOT consumed; null when the shape is outside the subset. */
function parseBlock(
	lines: Line[],
	start: number,
	indent: number
): { value: Record<string, unknown> | unknown[]; next: number } | null {
	if (start >= lines.length) return null;
	if (lines[start].indent !== indent) return null;

	if (lines[start].item) {
		const items: unknown[] = [];
		let i = start;
		while (i < lines.length && lines[i].indent === indent && lines[i].item) {
			const t = lines[i].text;
			if (t.startsWith('{') || t.startsWith('[') || t.startsWith('|') || t.startsWith('>')) return null;
			items.push(parseScalar(t));
			i++;
		}
		return { value: items, next: i };
	}

	const map: Record<string, unknown> = {};
	let i = start;
	while (i < lines.length && lines[i].indent >= indent) {
		if (lines[i].item) return null; // a list item inside a mapping block at the same indent
		const line = lines[i];
		const kv = splitKey(line.text);
		if (!kv) return null;
		const key = unquote(kv.key);
		if (!key) return null;
		if (kv.value !== undefined) {
			const v = kv.value;
			// Flow collections and block scalars are outside the subset: refuse the
			// line (the block returns null) rather than storing a mangled string.
			if (v.startsWith('{') || v.startsWith('[') || v.startsWith('|') || v.startsWith('>')) return null;
			map[key] = parseScalar(v);
			i++;
			continue;
		}
		// `key:` with no value: nested block (deeper indent), or an empty mapping.
		const nested = lines[i + 1];
		if (nested && nested.indent > indent) {
			const child = parseBlock(lines, i + 1, nested.indent);
			if (child === null) return null;
			map[key] = child.value;
			i = child.next;
		} else {
			map[key] = null;
			i++;
		}
	}
	return { value: map, next: i };
}

/** Split `key: value` on the first `: ` (or a trailing `:`); null when the line is
 *  not a mapping entry. */
function splitKey(text: string): { key: string; value?: string } | null {
	const at = text.indexOf(':');
	if (at <= 0) return null;
	const key = text.slice(0, at);
	const rest = text.slice(at + 1);
	// `key:` with nothing after it is a nesting marker (value undefined), NOT a
	// value of empty string; the nested-block branch depends on that distinction.
	if (rest === '') return { key };
	if (rest.startsWith(' ')) return { key, value: rest.trim() };
	return null;
}

function parseScalar(t: string): unknown {
	const v = t.trim();
	if (v === '' || v === 'null' || v === '~') return null;
	if (v === 'true') return true;
	if (v === 'false') return false;
	if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		return v.slice(1, -1);
	}
	return v;
}

function unquote(key: string): string {
	if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
		return key.slice(1, -1);
	}
	return key;
}

/** Remove a trailing `# comment`, respecting quotes. `a#b` is not a comment. */
function stripComment(line: string): string {
	let quote: string | null = null;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === '#' && (i === 0 || line[i - 1] === ' ')) return line.slice(0, i);
	}
	return line;
}
