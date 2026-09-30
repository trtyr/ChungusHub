/**
 * ST-card `@@if` conditional entry exclusion (P015 档1e): the SillyTavern
 * Prompt-Template extension lets a world-info entry start with `@@if <js>` and skips the
 * entry entirely when the condition is false. Running card JavaScript is 档2 and stays
 * unmade, so this module evaluates the SUPPORTED SUBSET only, translated onto the
 * shorthand-condition semantics this app already has (var-macros' `expandCondition`):
 *
 *   [!] variables[.local|.global].path            existence in the variable table
 *   [!] variables[.local|.global].path OP literal  comparison (numbers via the same
 *                                                  toNumber coercion, strings equal)
 *   OP: === !== == != >= <= > <
 *
 * Leaves may be joined by `&&` / `||` (P018): JS precedence (&& before ||), no
 * parentheses, and a null leaf poisons the whole composition. Anything else
 * (arithmetic, function calls, unknown identifiers) evaluates to `null`: the caller
 * leaves the entry untouched, warns once per entry, and the entry carries the marker
 * badge in the UI. That keeps the degrade honest instead of guessing at JavaScript.
 *
 * `variables.hakimi.affection` reads our flat table at the dotted-path key (the same
 * key 档1a's InitialVariables seeding writes); bare `variables` reads locals first,
 * then globals, which is the merged view upstream's tree presents.
 */
import type { MacroContext, VarEnv } from '$lib/macros';
import { expandCondition } from '$lib/utils/var-macros';
import type { Lorebook, LorebookEntry } from '$lib/lorebook/types';

const EXISTENCE_RE = /^(!?)\s*variables(?:\.(local|global))?\.([A-Za-z0-9_.]+?)\s*$/;
const COMPARE_RE =
	/^(!?)\s*variables(?:\.(local|global))?\.([A-Za-z0-9_.]+?)\s*(===|!==|==|!=|>=|<=|>|<)\s*("([^"]*)"|'([^']*)'|[^\s]+)$/;
const IF_LINE_RE = /^[ \t]*@@if[ \t]+(.+)$/m;

type Scope = 'local' | 'global' | undefined;

function table(scope: Scope, env: VarEnv | undefined): Record<string, string> | undefined {
	if (!env) return undefined;
	if (scope === 'local') return env.locals;
	if (scope === 'global') return env.globals;
	return undefined;
}

function hasKey(scope: Scope, path: string, env: VarEnv | undefined): boolean {
	if (!env) return false;
	if (scope === 'local') return path in env.locals;
	if (scope === 'global') return path in env.globals;
	return path in env.locals || path in env.globals;
}

/** Evaluate one `@@if` argument. `null` = outside the supported subset. */
export function evaluateStIfCondition(
	raw: string,
	ctx: MacroContext,
	env: VarEnv | undefined
): boolean | null {
	const body = raw.trim();
	// Composed conditions: leaves joined by && / ||. A null leaf poisons the whole
	// composition (conservative: an unguessable part means we keep the entry).
	const compose = splitCompose(body);
	if (compose) {
		const leaves = compose.parts.map((p) => evalSingle(p, ctx, env));
		if (leaves.some((v) => v === null)) return null;
		// JS precedence: && binds tighter than ||. Fold into ||-groups of &&-runs.
		const groups: boolean[] = [];
		let curAnd = leaves[0] as boolean;
		for (let i = 0; i < compose.ops.length; i++) {
			const v = leaves[i + 1] as boolean;
			if (compose.ops[i] === '&&') curAnd = curAnd && v;
			else {
				groups.push(curAnd);
				curAnd = v;
			}
		}
		groups.push(curAnd);
		return groups.some((g) => g);
	}
	return evalSingle(body, ctx, env);
}

/** One supported leaf: existence or comparison, exactly as before P018. */
function evalSingle(raw: string, ctx: MacroContext, env: VarEnv | undefined): boolean | null {
	const body = raw.trim();

	const existence = EXISTENCE_RE.exec(body);
	if (existence) {
		const [, bang, scope, path] = existence;
		const exists = hasKey((scope as Scope) ?? undefined, path, env);
		return bang === '!' ? !exists : exists;
	}

	const compare = COMPARE_RE.exec(body);
	if (compare) {
		const [, bang, scope, path, op, literal] = compare;
		// The shorthand table choice is single-sided: bare `variables` prefers locals
		// (the chat-scoped table upstream merges over) and falls back to globals only
		// when locals has no such key at all.
		let prefix = '.';
		if (scope === 'global') prefix = '$';
		else if (!scope && env && !(path in env.locals) && path in env.globals) prefix = '$';
		// `===`/`!==` on strings are `==`/`!=` here; the shorthand's comparisons already
		// coerce through the same toNumber both sides of this port share. Quoted
		// literals lose their quotes: the comparison is against the VALUE, and the
		// shorthand's right side would otherwise compare against the quoted text.
		const bare = compare[6] ?? compare[7] ?? literal;
		const shorthandOp = op === '===' ? '==' : op === '!==' ? '!=' : op;
		const verdict = expandCondition(`{{${prefix}${path} ${shorthandOp} ${bare}}}`, ctx, env);
		const value = verdict === 'true';
		return bang === '!' ? !value : value;
	}

	return null;
}

/** Split a composed condition on top-level && / ||, ignoring & and | inside quoted
 *  literals. null when there is no composition or the split is not clean: a dangling
 *  operator is upstream's bug to expose, not ours to guess around. */
function splitCompose(raw: string): { parts: string[]; ops: ('&&' | '||')[] } | null {
	const parts: string[] = [];
	const ops: ('&&' | '||')[] = [];
	let cur = '';
	let quote: string | null = null;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (quote) {
			cur += ch;
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			cur += ch;
			continue;
		}
		if ((ch === '&' || ch === '|') && raw[i + 1] === ch) {
			parts.push(cur);
			ops.push((ch + ch) as '&&' | '||');
			cur = '';
			i++;
			continue;
		}
		cur += ch;
	}
	parts.push(cur);
	if (ops.length === 0) return null;
	if (parts.some((p) => !p.trim())) return null;
	return { parts: parts.map((p) => p.trim()), ops };
}

export interface StIfFilterResult {
	/** false: the entry must not reach the scan at all (upstream drops it pre-scan too). */
	verdict: boolean | undefined;
}

/** Build the per-entry `@@if` filter for one generation: verdict true = keep, false =
 *  exclude, undefined = unsupported condition (entry untouched). Unsupported conditions
 *  warn once per entry per filter, so a chatty meter cannot spam the console. */
export function makeStIfEntryFilter(
	ctx: MacroContext,
	env: VarEnv | undefined
): (entry: LorebookEntry) => boolean | undefined {
	const warned = new Set<string>();
	return (entry: LorebookEntry): boolean | undefined => {
		const content = entry.content ?? '';
		if (!content.includes('@@if')) return undefined;
		const match = IF_LINE_RE.exec(content);
		if (!match) return undefined;
		const verdict = evaluateStIfCondition(match[1], ctx, env);
		if (verdict === null) {
			if (!warned.has(entry.id)) {
				warned.add(entry.id);
				console.warn(
					`[st-card-compat] @@if condition outside the supported subset on "${entry.comment}", entry kept as-is: ${match[1].trim()}`
				);
			}
			return undefined;
		}
		return verdict;
	};
}

/** Decorator lines are upstream METADATA (`@@if`, `@@activate`, ...): control syntax
 *  with zero information for the model, so they never travel into a prompt. `@@@` is
 *  upstream's escape for a literal leading `@@` and stays. */
const DECORATOR_LINE_STRIP_RE = /^[ \t]*@@(?!@)[^\n]*\n?/gm;

export function stripStDecoratorLines(content: string): string {
	if (!content.includes('@@')) return content;
	return content.replace(DECORATOR_LINE_STRIP_RE, '');
}

/** One call per generation from each resolver caller: drop entries whose `@@if` is
 *  supportably false, strip decorator lines from the survivors, and leave unsupported
 *  conditions untouched (kept + warned + badged). Books are passed through unchanged
 *  when nothing carries a `@@`. */
export function applyStCardCompat(
	books: Lorebook[],
	ctx: MacroContext,
	env: VarEnv | undefined
): Lorebook[] {
	if (!books.some((b) => b.entries.some((e) => e.content?.includes('@@')))) return books;
	const filter = makeStIfEntryFilter(ctx, env);
	return books.map((b) => {
		if (!b.entries.some((e) => e.content?.includes('@@'))) return b;
		const entries = b.entries
			.filter((e) => filter(e) !== false)
			.map((e) =>
				e.content?.includes('@@') ? { ...e, content: stripStDecoratorLines(e.content) } : e
			);
		return { ...b, entries };
	});
}
