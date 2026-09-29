/**
 * `[InitialVariables]` / `@@initial_variables` support for SillyTavern cards that use
 * the Prompt-Template extension's variable seeding (P015 档1a). A card ships a
 * world-info entry whose content is a JSON (or, upstream, YAML) object; when a chat
 * with that card starts, the object becomes the chat's starting variable table.
 *
 * Scope decisions (P015 README): JSON only this round, because YAML needs a real parser
 * dependency this app does not carry, so YAML content is detected and refused with a
 * named error instead of half-parsed. Values are literals: no macro expansion, no
 * template execution. The upstream variable model is a nested tree while ours is a
 * flat string table, so the tree is flattened to dotted-path keys and non-scalar
 * subtrees travel as JSON strings, so nothing is dropped, and a flat
 * `{{getvar::hakimi.affection}}` reads the same value upstream's
 * `variables.hakimi.affection` would.
 */

/** Entry-title tag upstream matches with startsWith; the decorator form is content-led. */
const TITLE_TAG = '[InitialVariables]';
const DECORATOR_RE = /^\s*@@initial_variables\b[^\n]*\n?/;

export function isInitialVariablesEntry(title: string, content: string): boolean {
	if (title.trimStart().startsWith(TITLE_TAG)) return true;
	return /^\s*@@initial_variables\b/.test(content ?? '');
}

export type InitialVariablesResult =
	| { ok: true; vars: Record<string, string> }
	| { ok: false; error: 'invalid-json' | 'yaml-unsupported' | 'not-an-object' | 'empty' };

/** Parse one entry's content into flat chat-variable rows. */
export function parseInitialVariables(content: string): InitialVariablesResult {
	const body = (content ?? '').replace(DECORATOR_RE, '').trim();
	if (!body) return { ok: false, error: 'empty' };

	let data: unknown;
	try {
		data = JSON.parse(body);
	} catch {
		// A body that doesn't even look like JSON is YAML upstream's other documented
		// format; report it by name instead of failing as broken JSON.
		return { ok: false, error: /^\s*[[{]/.test(body) ? 'invalid-json' : 'yaml-unsupported' };
	}

	if (data === null || typeof data !== 'object' || Array.isArray(data)) {
		return { ok: false, error: 'not-an-object' };
	}

	const vars: Record<string, string> = {};
	flatten('', data, vars);
	return { ok: true, vars };
}

/** Depth-first flatten: scalars become their string form, objects/arrays freeze to a
 *  JSON string at their dotted path. First writer wins is the caller's merge rule. */
function flatten(prefix: string, value: unknown, out: Record<string, string>): void {
	const key = prefix;
	if (value === null || value === undefined) return;
	if (Array.isArray(value)) {
		out[key] = JSON.stringify(value);
		return;
	}
	if (typeof value === 'object') {
		for (const [child, childValue] of Object.entries(value as Record<string, unknown>)) {
			flatten(key ? `${key}.${child}` : child, childValue, out);
		}
		return;
	}
	out[key] = String(value);
}
