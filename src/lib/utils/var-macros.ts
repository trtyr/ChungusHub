import { expandMacros, type MacroContext, type VarEnv } from '$lib/macros';

/**
 * SillyTavern variable, randomization and conditional macros, evaluated as a pass
 * BEFORE the engine's name-based substitution (see the design note in engram:
 * the name map model can't carry `::` arguments or side effects).
 *
 * Semantics per https://docs.sillytavern.app/usage/macros.md:
 * - values are always strings; numeric operators parse on use
 * - falsy = '' / 'false' / '0' / 'off' / 'no' (case-insensitive); ?? checks existence
 * - order of evaluation is the order of expansion, so assembly's item order IS the
 *   variable timeline: a setvar in an earlier item is visible to later items that
 *   share the same VarEnv instance
 * - the env MUTATES in place: the generation path persists the deltas, the meter
 *   paths pass a throwaway clone, and a context with no env renders every variable
 *   macro empty so existing call sites and tests keep their behavior
 */

/** Chat-scoped (`locals`) and app-scoped (`globals`) variable tables. */
export type { VarEnv } from '$lib/macros';

const ARG = '(?:[^{}]|\\{\\{[^{}]*\\}\\})*';

export function emptyVarEnv(): VarEnv {
	return { locals: {}, globals: {} };
}

export function cloneVarEnv(env: VarEnv): VarEnv {
	return { locals: { ...env.locals }, globals: { ...env.globals } };
}

const FALSY = new Set(['', 'false', '0', 'off', 'no']);

/** ST's truthiness: only these five spell out false. */
export function isFalsy(value: string): boolean {
	return FALSY.has(value.trim().toLowerCase());
}

function toNumber(value: string): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function pickTable(env: VarEnv, global: boolean): Record<string, string> {
	return global ? env.globals : env.locals;
}

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/** Split a macro's raw argument text on the `::` separator. Whitespace around the
 *  whole argument survives INSIDE values (ST trims only names/separators), but a
 *  single-argument form written with a space (`{{getvar name}}`) trims. */
function argsOf(raw: string): string[] {
	return raw.split('::').map((part) => part.trim());
}

// ---------------------------------------------------------------------------
// Individual macro families
// ---------------------------------------------------------------------------

interface ReadResult {
	/** Replacement text (empty for pure side effects). */
	out: string;
	/** True when the name was recognized, so the pass consumes it. */
	known: boolean;
}

const VAR_MACRO_NAMES = new Set([
	'getvar',
	'setvar',
	'addvar',
	'incvar',
	'decvar',
	'hasvar',
	'deletevar',
	'getglobalvar',
	'setglobalvar',
	'addglobalvar',
	'incglobalvar',
	'decglobalvar',
	'hasglobalvar',
	'deleteglobalvar'
]);

function evalVarMacro(
	name: string,
	rawArgs: string,
	env: VarEnv | undefined,
	expandValue: (text: string) => string
): ReadResult {
	const global = name.endsWith('globalvar');
	const base = global ? name.slice(0, -'globalvar'.length) : name.slice(0, -'var'.length);
	const args = argsOf(rawArgs);
	const key = (args[0] ?? '').trim();
	const table = env ? pickTable(env, global) : undefined;

	switch (base) {
		case 'get':
			return { out: table?.[key] ?? '', known: true };
		case 'set': {
			if (table) table[key] = expandValue(args[1] ?? '');
			return { out: '', known: true };
		}
		case 'add': {
			if (table) {
				const current = table[key] ?? '';
				const value = expandValue(args[1] ?? '');
				const a = Number(current);
				const b = Number(value);
				table[key] =
					current !== '' && value !== '' && Number.isFinite(a) && Number.isFinite(b)
						? String(a + b)
						: current + value;
			}
			return { out: '', known: true };
		}
		case 'inc':
		case 'dec': {
			if (table) {
				const delta = base === 'inc' ? 1 : -1;
				table[key] = String(toNumber(table[key] ?? '') + delta);
				return { out: table[key], known: true };
			}
			return { out: '', known: true };
		}
		case 'has':
			return { out: table && key in table ? 'true' : 'false', known: true };
		case 'delete':
			if (table) delete table[key];
			return { out: '', known: true };
	}
	return { out: '', known: false };
}

// Randomization. `pick` pins its roll under __pick::<hash> in the LOCAL table so the
// choice is stable per chat and per macro text (ST's contract); with no env it degrades
// to a plain re-roll.

function fnv1a(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

function optionsOf(rawArgs: string): string[] {
	const byDoubleColon = argsOf(rawArgs);
	if (byDoubleColon.length > 1) return byDoubleColon;
	// Legacy single-colon ST syntax splits on commas instead.
	return rawArgs.includes(',') ? rawArgs.split(',') : [rawArgs];
}

function evalRandom(rawArgs: string): string {
	const options = optionsOf(rawArgs).map((option) => option.trim());
	if (options.length === 0) return '';
	return options[Math.floor(Math.random() * options.length)] ?? '';
}

function evalPick(text: string, rawArgs: string, env: VarEnv | undefined): string {
	const pin = `__pick::${fnv1a(text)}`;
	if (env && pin in env.locals) return env.locals[pin];
	const chosen = evalRandom(rawArgs);
	if (env) env.locals[pin] = chosen;
	return chosen;
}

/** {{roll::2d6+3}} / legacy {{roll:1d20}}: N dice (default 1) of M sides, ±K modifier. */
function evalRoll(rawArgs: string): string {
	const spec = rawArgs.trim();
	const match = /^(\d*)\s*d\s*(\d+)\s*(?:([+-])\s*(\d+))?$/i.exec(spec);
	if (!match) return '';
	const count = match[1] ? Number(match[1]) : 1;
	const sides = Number(match[2]);
	if (count < 1 || count > 100 || sides < 1) return '';
	let total = 0;
	for (let i = 0; i < count; i++) total += 1 + Math.floor(Math.random() * sides);
	if (match[3]) total += match[3] === '+' ? Number(match[4]) : -Number(match[4]);
	return String(total);
}

function evalUtility(name: string, rawArgs: string): ReadResult {
	const args = argsOf(rawArgs);
	switch (name) {
		case 'noop':
			return { out: '', known: true };
		case 'trim':
			return { out: '', known: true };
		case 'newline': {
			const count = Math.min(Math.max(Number(args[0] ?? '1') || 1, 1), 20);
			return { out: '\n'.repeat(count), known: true };
		}
		case 'space': {
			const count = Math.min(Math.max(Number(args[0] ?? '1') || 1, 1), 100);
			return { out: ' '.repeat(count), known: true };
		}
	}
	return { out: '', known: false };
}

// ---------------------------------------------------------------------------
// Shorthand {{.var}} / {{$var}} with operators
// ---------------------------------------------------------------------------

const SHORTHAND_RE_SRC =
	'\\{\\{\\s*([.$])([A-Za-z](?:[A-Za-z0-9_-]*[A-Za-z0-9_])?)\\s*(?:(\\+\\+|--|\\+=|-=|\\|\\|=|\\?\\?=|==|!=|>=|<=|\\|\\||\\?\\??|>|<|=)\\s*(' + ARG + '))?\\s*\\}\\}';
const SHORTHAND_RE = () => new RegExp(SHORTHAND_RE_SRC, 'g');

/** Lazy right-hand side: `||`/`??` only evaluate the fallback when taken. */
function shorthandOp(
	env: VarEnv,
	global: boolean,
	key: string,
	op: string | undefined,
	rhs: string | undefined,
	expandRhs: (text: string) => string
): string {
	const table = pickTable(env, global);
	const exists = key in table;
	const current = table[key] ?? '';
	switch (op ?? '') {
		case '':
			return current;
		case '++':
		case '--': {
			const next = String(toNumber(current) + (op === '++' ? 1 : -1));
			table[key] = next;
			return next;
		}
		case '+=':
		case '-=': {
			const value = expandRhs(rhs ?? '');
			const a = Number(current);
			const b = Number(value);
			table[key] =
				current !== '' && value !== '' && Number.isFinite(a) && Number.isFinite(b)
					? String(op === '+=' ? a + b : a - b)
					: op === '+='
						? current + value
						: String(toNumber(current) - toNumber(value));
			return '';
		}
		case '=':
			table[key] = expandRhs(rhs ?? '');
			return '';
		case '||':
			return !isFalsy(current) ? current : expandRhs(rhs ?? '');
		case '??':
			return exists ? current : expandRhs(rhs ?? '');
		case '||=': {
			const next = !isFalsy(current) ? current : expandRhs(rhs ?? '');
			table[key] = next;
			return next;
		}
		case '??=': {
			const next = exists ? current : expandRhs(rhs ?? '');
			table[key] = next;
			return next;
		}
		case '==':
		case '!=': {
			const same = current === expandRhs(rhs ?? '');
			return op === '==' ? String(same) : String(!same);
		}
		case '>':
		case '>=':
		case '<':
		case '<=': {
			const a = toNumber(current);
			const b = toNumber(expandRhs(rhs ?? ''));
			const result =
				op === '>' ? a > b : op === '>=' ? a >= b : op === '<' ? a < b : a <= b;
			return String(result);
		}
	}
	return '';
}

// ---------------------------------------------------------------------------
// Conditional blocks {{if cond}}...{{else}}...{{/if}}
// ---------------------------------------------------------------------------

const BLOCK_TOKEN_RE_SRC = '\\{\\{\\s*(\\/?)(if|else)\\b\\s*(' + ARG + ')\\}\\}';

interface IfFrame {
	start: number;
	/** Index just after the {{if}} token. */
	contentStart: number;
	elseIndex: number;
	/** Index where the else token ends; -1 while no else seen. */
	contentElseStart: number;
	condition: string;
}

/** Expand conditional blocks: innermost pairing via a token scan with a stack. The chosen
 *  branch's text replaces the whole block BEFORE further expansion, so branches nest. */
function expandIfBlocks(text: string, ctx: MacroContext, env: VarEnv | undefined): string {
	// Iterate to a fixed point so nested ifs (an {{if}} inside a chosen branch) resolve
	// outward-in across passes; unpaired {{/if}} stays literal and terminates the loop.
	// LOCAL regex instance: expandCondition recurses into this function mid-scan, and a
	// shared global's lastIndex would be reset under the running loop (infinite rescan).
	for (let pass = 0; pass < 16; pass++) {
		const tokenRe = new RegExp(BLOCK_TOKEN_RE_SRC, 'g');
		let out = '';
		let pos = 0;
		let replaced = false;
		const stack: IfFrame[] = [];
		let match: RegExpExecArray | null;
		while ((match = tokenRe.exec(text)) !== null) {
			const [token, closing, keyword, condition] = match;
			if (!closing && keyword === 'if') {
				stack.push({
					start: match.index,
					contentStart: match.index + token.length,
					elseIndex: -1,
					contentElseStart: -1,
					condition
				});
				continue;
			}
			if (!closing && keyword === 'else') {
				const frame = stack[stack.length - 1];
				if (frame && frame.elseIndex === -1) {
					frame.elseIndex = match.index;
					frame.contentElseStart = match.index + token.length;
				}
				continue;
			}
			// {{/if}}: pop the frame it closes.
			const frame = stack.pop();
			if (!frame) continue; // unpaired closer stays literal
			const thenText = text.slice(
				frame.contentStart,
				frame.elseIndex === -1 ? match.index : frame.elseIndex
			);
			const elseText =
				frame.elseIndex === -1 ? '' : text.slice(frame.contentElseStart, match.index);
			const conditionValue = expandCondition(frame.condition, ctx, env);
			const taken = conditionValue === 'true' ? thenText : elseText;
			out += text.slice(pos, frame.start);
			out += taken;
			pos = match.index + token.length;
			replaced = true;
		}
		if (!replaced) return text;
		out += text.slice(pos);
		text = out;
	}
	return text;
}

/** A condition expands (variables then engine macros) and is judged with ST falsiness;
 *  a leading `!` inverts. The returned string is the final 'true'/'false' verdict so the
 *  caller never re-parses the negation. */
function expandCondition(condition: string, ctx: MacroContext, env: VarEnv | undefined): string {
	let inverted = false;
	let body = condition.trim();
	if (body.startsWith('!')) {
		inverted = true;
		body = body.slice(1).trim();
	}
	// A bare shorthand condition ({{if .flag}}) never enters the {{...}} pass, so a
	// leading . / $ resolves straight against the tables; everything else expands.
	let expanded: string;
	if ((body.startsWith('.') || body.startsWith('$')) && !body.includes('{{')) {
		const table = env ? pickTable(env, body.startsWith('$')) : undefined;
		expanded = table?.[body.slice(1)] ?? '';
	} else {
		expanded = expandMacros(expandVarMacros(body, ctx, env), ctx);
	}
	const verdict = !isFalsy(expanded);
	return String(inverted ? !verdict : verdict);
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

const PARAM_MACROS_RE_SRC =
	'\\{\\{\\s*(getvar|setvar|addvar|incvar|decvar|hasvar|deletevar|getglobalvar|setglobalvar|addglobalvar|incglobalvar|decglobalvar|hasglobalvar|deleteglobalvar|random|pick|roll|noop|trim|newline|space)\\s*(?:::|\\s+|:)?\\s*(' + ARG + ')\\}\\}';
const PARAM_MACROS_RE = () => new RegExp(PARAM_MACROS_RE_SRC, 'gi');

/** One sweep of the variable/random/utility pass. Order inside a sweep: conditional
 *  blocks first (their branches change what macros are even present), then parameterized
 *  macros left-to-right (side effects land in reading order), then shorthands. */
function sweep(text: string, ctx: MacroContext, env: VarEnv | undefined): string {
	text = expandIfBlocks(text, ctx, env);
	// Local instance per sweep: value expansion recurses into sweep, and a shared global
	// regex's lastIndex is corrupted under the running replace.
	text = text.replace(PARAM_MACROS_RE(), (match, rawName: string, rawArgs: string) => {
		const name = rawName.toLowerCase();
		if (name === 'random') return evalRandom(rawArgs);
		if (name === 'pick') return evalPick(match, rawArgs, env);
		if (name === 'roll') return evalRoll(rawArgs);
		if (name === 'noop' || name === 'trim' || name === 'newline' || name === 'space') {
			return evalUtility(name, rawArgs).out;
		}
		return evalVarMacro(name, rawArgs, env, (inner) => expandMacros(expandVarMacros(inner, ctx, env), ctx)).out;
	});
	return text.replace(SHORTHAND_RE(), (match, prefix: string, key: string, op?: string, rhs?: string) => {
		if (!env) return '';
		return shorthandOp(env, prefix === '$', key, op, rhs, (inner) =>
			expandMacros(expandVarMacros(inner, ctx, env), ctx)
		);
	});
}

/** Expand every variable, randomization, utility and conditional macro in `text` against
 *  `ctx.vars` (mutating it in place). With no env on the context, variable reads render
 *  empty and writes are discarded, but randomization still rolls. Runs to a fixed point
 *  (bounded) so nested values ({{setvar::x::{{getvar::y}}}}) resolve innermost-first. */
export function expandVarMacros(text: string, ctx: MacroContext, env?: VarEnv): string {
	const table = env ?? ctx.vars;
	if (!text.includes('{{')) return text;
	let current = text;
	for (let pass = 0; pass < 16; pass++) {
		const next = sweep(current, ctx, table);
		if (next === current) return next;
		current = next;
	}
	return current;
}
