import { describe, expect, test } from 'bun:test';
import { expandMacros } from '$lib/macros';
import {
	cloneVarEnv,
	emptyVarEnv,
	expandVarMacros,
	isFalsy
} from './var-macros';
import type { MacroContext } from '$lib/macros';

function ctxWith(env = emptyVarEnv(), extra: Partial<MacroContext> = {}): MacroContext {
	return { vars: env, ...extra };
}

const user: MacroContext = { resolvedPersona: { name: '月见', } as never };

describe('falsy table (ST semantics)', () => {
	test("falsy = '' / false / 0 / off / no, case-insensitive", () => {
		for (const value of ['', 'false', '0', 'off', 'no', 'FALSE', 'Off', 'NO', ' 0 ']) {
			expect(isFalsy(value)).toBe(true);
		}
		for (const value of ['true', '1', 'yes', '0.0', 'on', 'anything']) {
			expect(isFalsy(value)).toBe(false);
		}
	});
});

describe('the 14 variable macros', () => {
	test('set renders empty, get reads back, undefined reads empty', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{setvar::文风::仙侠}}', ctx)).toBe('');
		expect(env.locals['文风']).toBe('仙侠');
		expect(expandVarMacros('{{getvar::文风}}', ctx)).toBe('仙侠');
		expect(expandVarMacros('{{getvar::没有的}}', ctx)).toBe('');
	});

	test('global set/get travel the global table', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expandVarMacros('{{setglobalvar::style::dark}}', ctx);
		expect(env.globals['style']).toBe('dark');
		expect(env.locals['style']).toBeUndefined();
		expect(expandVarMacros('{{getglobalvar::style}}', ctx)).toBe('dark');
	});

	test('add: numeric addition, else string append', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expandVarMacros('{{setvar::n::10}}', ctx);
		expandVarMacros('{{addvar::n::5}}', ctx);
		expect(env.locals['n']).toBe('15');
		expandVarMacros('{{setvar::s::hello}}', ctx);
		expandVarMacros('{{addvar::s::world}}', ctx);
		expect(env.locals['s']).toBe('helloworld');
	});

	test('inc/dec return the new value', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expandVarMacros('{{setvar::hp::20}}', ctx);
		expect(expandVarMacros('{{incvar::hp}}', ctx)).toBe('21');
		expect(expandVarMacros('{{decvar::hp}}', ctx)).toBe('20');
		expect(expandVarMacros('{{incglobalvar::visits}}', ctx)).toBe('1');
	});

	test('has reports existence, empty string included; delete removes', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expandVarMacros('{{setvar::blank::}}', ctx);
		expect(expandVarMacros('{{hasvar::blank}}', ctx)).toBe('true');
		expect(expandVarMacros('{{hasvar::ghost}}', ctx)).toBe('false');
		expandVarMacros('{{deletevar::blank}}', ctx);
		expect(expandVarMacros('{{hasvar::blank}}', ctx)).toBe('false');
	});

	test('macro names are case-insensitive and tolerate spacing', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{ SetVar :: k :: v }}', ctx)).toBe('');
		expect(expandVarMacros('{{GETVAR::k}}', ctx)).toBe('v');
	});

	test('space-separated single-argument form works', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{getvar k2}}', ctx)).toBe('');
	});

	test('a context with no env discards writes and reads empty, but random still rolls', () => {
		const ctx: MacroContext = {};
		expect(expandVarMacros('{{setvar::x::1}}{{getvar::x}}', ctx)).toBe('');
		const roll = expandVarMacros('{{random::a::b::c}}', ctx);
		expect(['a', 'b', 'c']).toContain(roll);
	});
});

describe('shorthand operators', () => {
	test('{{.v}} get and {{$v}} global get', () => {
		const env = emptyVarEnv();
		env.locals['name'] = '阿月';
		env.globals['theme'] = 'dark';
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{.name}}', ctx)).toBe('阿月');
		expect(expandVarMacros('{{$theme}}', ctx)).toBe('dark');
	});

	test('= sets, ++/-- return the new value', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{.counter++}}', ctx)).toBe('1');
		expect(expandVarMacros('{{.counter++}}', ctx)).toBe('2');
		expect(expandVarMacros('{{.counter--}}', ctx)).toBe('1');
		expandVarMacros('{{.greeting = Hello, {{user}}!}}', ctx);
		expect(env.locals['greeting']).toBe('Hello, !');
	});

	test('+= numeric and string, -= numeric only', () => {
		const env = emptyVarEnv();
		env.locals['score'] = '10';
		env.locals['story'] = 'once';
		const ctx = ctxWith(env);
		expandVarMacros('{{.score += 5}}', ctx);
		expect(env.locals['score']).toBe('15');
		expandVarMacros('{{.story += upon}}', ctx);
		expect(env.locals['story']).toBe('onceupon');
		expandVarMacros('{{.score -= 20}}', ctx);
		expect(env.locals['score']).toBe('-5');
	});

	test('|| fallback only when falsy; ?? only when missing', () => {
		const env = emptyVarEnv();
		env.locals['zero'] = '0';
		env.locals['blank'] = '';
		env.locals['text'] = 'here';
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{.zero || Guest}}', ctx)).toBe('Guest');
		expect(expandVarMacros('{{.text || Guest}}', ctx)).toBe('here');
		expect(expandVarMacros('{{.zero ?? Guest}}', ctx)).toBe('0');
		expect(expandVarMacros('{{.missing ?? Guest}}', ctx)).toBe('Guest');
		expect(expandVarMacros('{{.blank ?? Guest}}', ctx)).toBe('');
	});

	test('||= and ??= assign-on-demand and return the final value', () => {
		const env = emptyVarEnv();
		env.locals['taken'] = 'yes';
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{.taken ||= new}}', ctx)).toBe('yes');
		expect(expandVarMacros('{{.open ??= default}}', ctx)).toBe('default');
		expect(expandVarMacros('{{.open ??= again}}', ctx)).toBe('default');
	});

	test('comparisons return literal true/false strings', () => {
		const env = emptyVarEnv();
		env.locals['status'] = 'active';
		env.locals['level'] = '10';
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{.status == active}}', ctx)).toBe('true');
		expect(expandVarMacros('{{.status != active}}', ctx)).toBe('false');
		expect(expandVarMacros('{{.level > 5}}', ctx)).toBe('true');
		expect(expandVarMacros('{{.level >= 10}}', ctx)).toBe('true');
		expect(expandVarMacros('{{.level < 10}}', ctx)).toBe('false');
		expect(expandVarMacros('{{.level <= 9}}', ctx)).toBe('false');
	});
});

describe('randomization family', () => {
	test('random stays inside the option set and can re-roll', () => {
		const ctx = ctxWith();
		for (let i = 0; i < 20; i++) {
			expect(['red', 'green', 'blue']).toContain(expandVarMacros('{{random::red::green::blue}}', ctx));
		}
	});

	test('pick is stable per text and pinned in the env', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		const text = '开场: {{pick::东::西::南::北}}';
		const first = expandVarMacros(text, ctx);
		const pin = Object.keys(env.locals).find((k) => k.startsWith('__pick::'));
		expect(pin).toBeTruthy();
		expect(env.locals[pin!]).toBe(first.split(': ')[1]);
		expect(expandVarMacros(text, ctx)).toBe(first);
	});

	test('roll evaluates dice with modifier; bad syntax renders empty', () => {
		const ctx = ctxWith();
		for (let i = 0; i < 20; i++) {
			const total = Number(expandVarMacros('{{roll::2d6+3}}', ctx));
			expect(total).toBeGreaterThanOrEqual(5);
			expect(total).toBeLessThanOrEqual(15);
		}
		expect(expandVarMacros('{{roll::banana}}', ctx)).toBe('');
	});
});

describe('utility macros', () => {
	test('noop vanishes, trim removes its surrounding newlines, newline/space repeat', () => {
		const ctx = ctxWith();
		expect(expandVarMacros('a{{noop}}b', ctx)).toBe('ab');
		expect(expandVarMacros('x{{trim}}y', ctx)).toBe('xy');
		expect(expandVarMacros('x\n{{trim}}\ny', ctx)).toBe('xy');
		expect(expandVarMacros('  {{trim}}  ', ctx)).toBe('');
		expect(expandVarMacros('a{{newline::3}}b', ctx)).toBe('a\n\n\nb');
		expect(expandVarMacros('a{{space::4}}b', ctx)).toBe('a    b');
	});

	test('scoped set form: content becomes the value, trimmed and de-dented', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expandVarMacros('{{setvar backstory}}\n\t\tBorn in a village.\n\t\tRaised a scholar.\n{{/setvar}}', ctx);
		expect(env.locals['backstory']).toBe('Born in a village.\nRaised a scholar.');
		expandVarMacros('{{#setvar raw}}\n  keep  this\n{{/setvar}}', ctx);
		expect(env.locals['raw']).toBe('\n  keep  this\n');
		expandVarMacros('{{setglobalvar::g::x}}{{setglobalvar gstyle}}dark{{/setglobalvar}}', ctx);
		expect(env.globals['gstyle']).toBe('dark');
	});

	test('-= leaves a non-numeric variable unchanged (ST: warning, no change)', () => {
		const env = emptyVarEnv();
		env.locals['txt'] = 'abc';
		const ctx = ctxWith(env);
		expandVarMacros('{{.txt -= 5}}', ctx);
		expect(env.locals['txt']).toBe('abc');
	});
});

describe('conditional blocks', () => {
	test('truthy takes then, falsy takes else, missing else renders empty', () => {
		const env = emptyVarEnv();
		env.locals['flag'] = 'on';
		env.locals['off'] = 'off';
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{if .flag}}显示{{else}}隐藏{{/if}}', ctx)).toBe('显示');
		// Branch content is trimmed and de-dented per ST's scoped rule; {{#if keeps it.
		expect(expandVarMacros('{{if .flag}}\n\t行一\n\t行二\n{{/if}}', ctx)).toBe('行一\n行二');
		expect(expandVarMacros('{{#if .flag}}\n  keep\n{{/if}}', ctx)).toBe('\n  keep\n');
		expect(expandVarMacros('{{if .off}}显示{{else}}隐藏{{/if}}', ctx)).toBe('隐藏');
		expect(expandVarMacros('{{if .flag}}only then{{/if}}', ctx)).toBe('only then');
		expect(expandVarMacros('{{if .off}}only then{{/if}}', ctx)).toBe('');
	});

	test('inverted conditions and getvar conditions work', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expect(expandVarMacros('{{if !.ghost}}没有{{/if}}', ctx)).toBe('没有');
		expandVarMacros('{{setvar::思维链::开}}', ctx);
		expect(expandVarMacros('{{if {{getvar::思维链}}}}发思维链{{else}}不发{{/if}}', ctx)).toBe('发思维链');
	});

	test('engine macros can serve as the condition', () => {
		const ctx = ctxWith(emptyVarEnv(), user);
		expect(expandVarMacros('{{if {{user}}}}有主角{{/if}}', ctx)).toBe('有主角');
	});

	test('unpaired closers stay literal', () => {
		const ctx = ctxWith();
		expect(expandVarMacros('a {{/if}} b', ctx)).toBe('a {{/if}} b');
	});
});

describe('ordering and nesting', () => {
	test('a setvar in one expansion is visible to the next sharing the env (item order = timeline)', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env);
		expandVarMacros('{{setvar::场景::酒馆}}', ctx);
		expect(expandVarMacros('此刻在{{getvar::场景}}里', ctx)).toBe('此刻在酒馆里');
	});

	test('values resolve nested macros before assignment', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env, user);
		expandVarMacros('{{setvar::who::{{user}}}}', ctx);
		expect(env.locals['who']).toBe('月见');
	});

	test('engine macros resolve after the variable pass inside one text', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith(env, user);
		expandVarMacros('{{setvar::角色::{{user}}}}', ctx);
		expect(expandMacros(expandVarMacros('你好，{{getvar::角色}}', ctx), ctx)).toBe('你好，月见');
	});

	test('cloneVarEnv isolates the meter path from the real tables', () => {
		const env = emptyVarEnv();
		env.locals['n'] = '1';
		const clone = cloneVarEnv(env);
		const ctx = ctxWith(clone);
		expandVarMacros('{{setvar::n::999}}', ctx);
		expect(env.locals['n']).toBe('1');
		expect(clone.locals['n']).toBe('999');
	});
});

describe('dotted-path keys (P016 1b: 档1a seeds flat keys verbatim)', () => {
	const seeded = (): VarEnv => {
		const env = emptyVarEnv();
		env.locals['hakimi.affection'] = '50';
		env.globals['app.theme.mode'] = 'dark';
		return env;
	};

	test('shorthand reads dotted keys from the flat table', () => {
		const ctx = ctxWith(seeded());
		expect(expandVarMacros('{{.hakimi.affection}}', ctx)).toBe('50');
		expect(expandVarMacros('{{$app.theme.mode}}', ctx)).toBe('dark');
	});

	test('shorthand writes dotted keys', () => {
		const ctx = ctxWith(seeded());
		expandVarMacros('{{.hakimi.affection = 60}}', ctx);
		expect(ctx.vars?.locals['hakimi.affection']).toBe('60');
		expandVarMacros('{{$app.theme.mode = light}}', ctx);
		expect(ctx.vars?.globals['app.theme.mode']).toBe('light');
	});

	test('operators work on dotted keys', () => {
		const ctx = ctxWith(seeded());
		expect(expandVarMacros('{{.hakimi.affection += 5}}', ctx)).toBe('');
		expect(ctx.vars?.locals['hakimi.affection']).toBe('55');
		expect(expandVarMacros('{{.hakimi.affection > 54}}', ctx)).toBe('true');
		expect(expandVarMacros('{{if .hakimi.affection > 49}}high{{/if}}', ctx)).toBe('high');
	});

	test('getvar/setvar take dotted keys as plain literal key names', () => {
		const ctx = ctxWith(seeded());
		expect(expandMacros(expandVarMacros('{{getvar::hakimi.affection}}', ctx), ctx)).toBe('50');
		expandVarMacros('{{setvar::hakimi.mood::warm}}', ctx);
		expect(ctx.vars?.locals['hakimi.mood']).toBe('warm');
	});

	test('non-dotted behavior is unchanged: bare keys and literals stay literal', () => {
		const ctx = ctxWith(seeded());
		expect(expandVarMacros('{{.missing}}', ctx)).toBe('');
		// A key that is not in the table renders empty on read; the raw text of an
		// unknown {{name}} macro is untouched by the shorthand pass.
		expect(expandVarMacros('{{notAVar}}', ctx)).toBe('{{notAVar}}');
	});
});
