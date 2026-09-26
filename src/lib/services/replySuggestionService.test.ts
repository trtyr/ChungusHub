/**
 * P007 reply-suggestion contracts, pure level: the prompt rides the history tail as a
 * plain final user turn (cache-friendly append), and the parser takes JSON first with a
 * line-split fallback. The live call is browser-verified in the E2E pass. `bun test`.
 */
import { describe, expect, test } from 'bun:test';

import { buildReplySuggestionPrompt, parseCandidates } from './replySuggestionService';
import type { Message } from '$lib/types/chat';

function msg(role: Message['role'], content: string): Message {
	return {
		id: content,
		chatId: 'c',
		parentId: null,
		role,
		content,
		personaId: null
	} as Message;
}

describe('buildReplySuggestionPrompt', () => {
	test('history tail is verbatim user/assistant turns, instruction rides last', () => {
		const history = [
			msg('system', 'sys'),
			msg('assistant', 'hello'),
			msg('user', 'hi there')
		];
		const messages = buildReplySuggestionPrompt(history);
		expect(messages.length).toBe(3);
		expect(messages[0]).toEqual({ role: 'assistant', content: 'hello' });
		expect(messages[1]).toEqual({ role: 'user', content: 'hi there' });
		expect(messages[2].role).toBe('user');
		expect(messages[2].content).toContain('JSON array of 4');
	});

	test('caps the tail at twelve turns', () => {
		const history = Array.from({ length: 30 }, (_, i) => msg('user', `m${i}`));
		const messages = buildReplySuggestionPrompt(history);
		expect(messages.length).toBe(13);
		expect(messages[0].content).toBe('m18');
	});

	test('empty history refuses loud', () => {
		expect(() => buildReplySuggestionPrompt([msg('system', 'sys')])).toThrow();
	});
});

describe('parseCandidates', () => {
	test('JSON array wins', () => {
		expect(parseCandidates('["a","b","c","d"]')).toEqual(['a', 'b', 'c', 'd']);
		expect(parseCandidates('sure!\n["a", "b"]')).toEqual(['a', 'b']);
	});

	test('line fallback strips bullets and numbering', () => {
		expect(parseCandidates('- one\n2. two\n* three')).toEqual(['one', 'two', 'three']);
	});

	test('caps at four and drops blanks', () => {
		expect(parseCandidates('["a","","b","c","d","e"]')).toEqual(['a', 'b', 'c', 'd']);
	});
});
