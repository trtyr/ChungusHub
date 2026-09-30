import { describe, expect, test } from 'bun:test';
import type { MacroContext } from '$lib/macros';
import type { VarEnv } from '$lib/macros';
import { emptyVarEnv } from './var-macros';
import { createEmptyLorebook, createEmptyLorebookEntry, type LorebookEntry } from '$lib/lorebook/types';
import { resolveLorebooks } from '$lib/lorebook/engine';
import {
	applyStCardCompat,
	evaluateStIfCondition,
	makeStIfEntryFilter
} from './st-if-condition';

function ctxWith(env: VarEnv): MacroContext {
	return { vars: env, resolvedCharacters: [], resolvedPersona: null };
}

function entry(over: Partial<LorebookEntry> = {}): LorebookEntry {
	return {
		...createEmptyLorebookEntry(),
		id: 'e1',
		comment: 'Cond',
		content: 'lore',
		...over
	} as LorebookEntry;
}

describe('evaluateStIfCondition: existence', () => {
	const env = emptyVarEnv();
	env.locals['affection'] = '0';
	env.globals['theme'] = 'dark';

	test('bare variables reads locals, and existence is not truthiness', () => {
		expect(evaluateStIfCondition('variables.affection', ctxWith(env), env)).toBe(true);
	});

	test('missing keys are false; ! inverts', () => {
		expect(evaluateStIfCondition('variables.missing', ctxWith(env), env)).toBe(false);
		expect(evaluateStIfCondition('!variables.missing', ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition('!variables.affection', ctxWith(env), env)).toBe(false);
	});

	test('scope selectors pin the table', () => {
		expect(evaluateStIfCondition('variables.global.theme', ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition('variables.local.theme', ctxWith(env), env)).toBe(false);
		expect(evaluateStIfCondition('variables.global.affection', ctxWith(env), env)).toBe(false);
	});

	test('bare variables falls through to globals when locals lacks the key', () => {
		const r = evaluateStIfCondition('variables.theme == dark', ctxWith(env), env);
		expect(r).toBe(true);
	});

	test('no env means nothing exists', () => {
		expect(evaluateStIfCondition('variables.affection', ctxWith(emptyVarEnv()), undefined)).toBe(false);
	});
});

describe('evaluateStIfCondition: comparisons', () => {
	const env = emptyVarEnv();
	env.locals['affection'] = '50';
	env.locals['stage'] = '2';
	env.locals['mood'] = 'warm';

	test('numeric comparisons coerce through the shared toNumber', () => {
		expect(evaluateStIfCondition('variables.affection > 49', ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition('variables.affection >= 50', ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition('variables.affection < 50', ctxWith(env), env)).toBe(false);
		expect(evaluateStIfCondition('variables.affection <= 50', ctxWith(env), env)).toBe(true);
	});

	test('string equality in all four spellings', () => {
		expect(evaluateStIfCondition(`variables.mood == 'warm'`, ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition(`variables.mood === "warm"`, ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition(`variables.mood != 'cold'`, ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition(`variables.mood !== 'warm'`, ctxWith(env), env)).toBe(false);
	});

	test('bareword literals and boolean words compare as strings', () => {
		expect(evaluateStIfCondition('variables.mood == warm', ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition('variables.stage == 2', ctxWith(env), env)).toBe(true);
	});

	test('negated comparisons invert the verdict', () => {
		expect(evaluateStIfCondition('!variables.affection > 49', ctxWith(env), env)).toBe(false);
	});

	test('missing keys compare as empty, like upstream undefined comparisons fall false', () => {
		expect(evaluateStIfCondition('variables.missing > 5', ctxWith(env), env)).toBe(false);
		expect(evaluateStIfCondition('variables.missing == 5', ctxWith(env), env)).toBe(false);
	});
});

describe('evaluateStIfCondition: unsupported JavaScript', () => {
	const env = emptyVarEnv();
	env.locals['a'] = '1';

	test('unstructured expressions are null, never guessed', () => {
		for (const cond of [
			'variables.a + 1 > 1',
			'getvar("a") > 0',
			'variables',
			'a > 0',
			'',
			// P018: && / || are supported, but a null leaf poisons the composition.
			'variables.a > 0 && getvar("a") > 0',
			'variables.a > 0 || variables.a + 1 > 1'
		]) {
			expect(evaluateStIfCondition(cond, ctxWith(env), env)).toBeNull();
		}
	});
});

describe('the engine hook drops false entries and keeps everything else', () => {
	function bookWith(content: string) {
		const b = createEmptyLorebook('b');
		b.entries = [entry({ id: 'e1', content, constant: true })];
		return b;
	}

	const env = emptyVarEnv();
	env.locals['stage'] = '2';

	test('a false condition excludes the entry from the block entirely', () => {
		const out = resolveLorebooks({
			books: applyStCardCompat([bookWith('@@if variables.stage > 5\nhidden lore')], ctxWith(env), env),
			messages: []
		});
		expect(out.text).toBe('');
		expect(out.trace.records).toHaveLength(0);
	});

	test('a true condition keeps the entry with decorator lines stripped', () => {
		const out = resolveLorebooks({
			books: applyStCardCompat([bookWith('@@if variables.stage > 1\nshown lore')], ctxWith(env), env),
			messages: []
		});
		expect(out.text).toBe('shown lore');
	});

	test('an unsupported condition keeps the entry, decorator lines still stripped', () => {
		const out = resolveLorebooks({
			books: applyStCardCompat(
				[bookWith('@@if variables.stage > 1 && variables.other < 2\nkept lore')],
				ctxWith(env),
				env
			),
			messages: []
		});
		expect(out.text).toBe('kept lore');
	});

	test('without any @@ nothing is touched (books pass through by reference)', () => {
		const books = [bookWith('plain lore')];
		expect(applyStCardCompat(books, ctxWith(env), env)).toBe(books);
		const out = resolveLorebooks({ books: applyStCardCompat(books, ctxWith(env), env), messages: [] });
		expect(out.text).toBe('plain lore');
	});
});

describe('composed conditions (P018: && / ||, JS precedence)', () => {
	const env = emptyVarEnv();
	env.locals['a'] = '1';
	env.locals['mood'] = 'warm';

	test('an && interval over one variable, true and false sides', () => {
		expect(evaluateStIfCondition('variables.a > 0 && variables.a < 9', ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition('variables.a > 5 && variables.a < 9', ctxWith(env), env)).toBe(false);
	});

	test('an || composition, true and false sides', () => {
		expect(evaluateStIfCondition('variables.a === 2 || variables.a === 1', ctxWith(env), env)).toBe(true);
		expect(evaluateStIfCondition('variables.a === 2 || variables.a === 3', ctxWith(env), env)).toBe(false);
	});

	test('&& binds tighter than ||, so a || b && c is a || (b && c)', () => {
		// Left-to-right would give ((true || false) && false) = false; JS gives true.
		expect(
			evaluateStIfCondition(
				"variables.mood == 'warm' || variables.a === 9 && variables.mood == 'x'",
				ctxWith(env),
				env
			)
		).toBe(true);
	});

	test('quoted literals survive the split: && inside quotes is not an operator', () => {
		expect(evaluateStIfCondition("variables.mood == 'a && b'", ctxWith(env), env)).toBe(false);
		expect(evaluateStIfCondition("variables.mood == 'warm'", ctxWith(env), env)).toBe(true);
	});

	test('three leaves fold into ||-groups of &&-runs', () => {
		expect(
			evaluateStIfCondition('variables.a > 0 && variables.a < 9 || variables.mood == "x"', ctxWith(env), env)
		).toBe(true);
		expect(
			evaluateStIfCondition('variables.a > 9 && variables.a < 20 || variables.mood == "x"', ctxWith(env), env)
		).toBe(false);
	});

	test('a dangling operator is null, never guessed', () => {
		expect(evaluateStIfCondition('variables.a > 0 &&', ctxWith(env), env)).toBeNull();
		expect(evaluateStIfCondition('&& variables.a > 0', ctxWith(env), env)).toBeNull();
	});
});
