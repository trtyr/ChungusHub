/**
 * P017 1c: message-scoped macro behavior. The write area accumulates during assembly,
 * reads prefer it over history, and inheritance walks the chat tail (each row being its
 * own swipe, a flat table per row is the whole shape).
 */
import { describe, test, expect } from 'bun:test';

import { expandVarMacros, emptyVarEnv, parseMessageVars } from './var-macros';
import type { MacroContext } from '$lib/macros';
import type { Message } from '$lib/types/chat';

function ctxWith(overrides: Partial<MacroContext> = {}): MacroContext {
	return { msgVarWrites: {}, ...overrides } as MacroContext;
}

/** Only the fields the variable pass reads are real; the rest is type filler. */
function msg(msgVars: string | null, id = 'm'): Message {
	return { id, msgVars } as unknown as Message;
}

describe('message-scoped macros (P017 1c)', () => {
	test('setmsgvar accumulates onto the assembly write area and renders empty', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith();
		const out = expandVarMacros('A{{setmsgvar::mood::warm}}B', ctx, env);
		expect(out).toBe('AB');
		expect(ctx.msgVarWrites).toEqual({ mood: 'warm' });
	});

	test('setmsgvar stores the literal value, empty keys are ignored', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith();
		expandVarMacros('{{setmsgvar::mood::warm}}', ctx, env);
		// Macro args cannot carry braces (the ARG class), so nested macros in a value
		// parse as truncated literals, the same limitation setvar's value has.
		expandVarMacros('{{setmsgvar::::value}}', ctx, env);
		expect(ctx.msgVarWrites).toEqual({ mood: 'warm' });
	});

	test('setmsgvar without a write area is a silent no-op (old callers)', () => {
		const env = emptyVarEnv();
		const ctx = {} as MacroContext;
		const out = expandVarMacros('{{setmsgvar::k::v}}', ctx, env);
		expect(out).toBe('');
		expect(ctx.msgVarWrites).toBeUndefined();
	});

	test('getmsgvar prefers this assembly over history', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith({
			msgVarWrites: { mood: 'assembly' },
			chatMessages: [msg(JSON.stringify({ mood: 'history' }))]
		});
		expect(expandVarMacros('{{getmsgvar::mood}}', ctx, env)).toBe('assembly');
	});

	test('getmsgvar walks the chat tail for the newest carrier (inheritance)', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith({
			chatMessages: [
				msg(JSON.stringify({ mood: 'old' }), 'a'),
				msg(null, 'b'),
				msg(JSON.stringify({ mood: 'new' }), 'c')
			]
		});
		expect(expandVarMacros('{{getmsgvar::mood}}', ctx, env)).toBe('new');
	});

	test('a different branch, a different messages array, a different answer', () => {
		const env = emptyVarEnv();
		const branchA = ctxWith({ chatMessages: [msg(JSON.stringify({ mood: 'A' }))] });
		const branchB = ctxWith({ chatMessages: [msg(JSON.stringify({ mood: 'B' }))] });
		expect(expandVarMacros('{{getmsgvar::mood}}', branchA, env)).toBe('A');
		expect(expandVarMacros('{{getmsgvar::mood}}', branchB, env)).toBe('B');
	});

	test('a torn blob skips instead of failing the walk', () => {
		const env = emptyVarEnv();
		const ctx = ctxWith({
			chatMessages: [msg('{torn', 'a'), msg(JSON.stringify({ mood: 'ok' }), 'b')]
		});
		expect(expandVarMacros('{{getmsgvar::mood}}', ctx, env)).toBe('ok');
	});

	test('no history and no writes reads empty', () => {
		const env = emptyVarEnv();
		expect(expandVarMacros('{{getmsgvar::mood}}', ctxWith(), env)).toBe('');
	});

	test('parseMessageVars tolerates null, torn, and non-string payloads', () => {
		expect(parseMessageVars(null)).toEqual({});
		expect(parseMessageVars('{torn')).toEqual({});
		expect(parseMessageVars('[1,2]')).toEqual({});
		expect(parseMessageVars('{"a":"x","b":3}')).toEqual({ a: 'x' });
	});
});
