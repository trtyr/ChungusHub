import { describe, expect, test } from 'bun:test';
import { createEmptyLorebook, createEmptyLorebookEntry, type Lorebook } from '$lib/lorebook/types';
import { parseGenerateRegexTitle, resolveLorebooks } from '$lib/lorebook/engine';
import { assemblePrompt } from './prompt-assembly';

function bookWith(title: string, content: string, over: Record<string, unknown> = {}): Lorebook {
	const b = createEmptyLorebook('b');
	b.entries = [{ ...createEmptyLorebookEntry(), id: 'e1', comment: title, content, ...over }] as never;
	return b;
}

describe('parseGenerateRegexTitle', () => {
	test('matches the exact title shape and captures the pattern', () => {
		expect(parseGenerateRegexTitle('[GENERATE:REGEX:wolf]')).toEqual({ pattern: 'wolf' });
		expect(parseGenerateRegexTitle('  [GENERATE:REGEX:\\b(help|帮助)\\b]  ')).toEqual({
			pattern: '\\b(help|帮助)\\b'
		});
	});

	test('other title syntaxes are not regex placements', () => {
		expect(parseGenerateRegexTitle('[GENERATE:BEFORE]')).toBeNull();
		expect(parseGenerateRegexTitle('[RENDER:REGEX:x]')).toBeNull();
		expect(parseGenerateRegexTitle('see [GENERATE:REGEX:x] docs')).toBeNull();
		expect(parseGenerateRegexTitle('@INJECT regex=wolf')).toBeNull();
		expect(parseGenerateRegexTitle('')).toBeNull();
	});
});

describe('resolveLorebooks: [GENERATE:REGEX] placement', () => {
	test('lands before the first matching message, case-insensitively', () => {
		const out = resolveLorebooks({
			books: [bookWith('[GENERATE:REGEX:wolf]', 'wolves are near')],
			messages: ['the town sleeps', 'a Wolf howls', 'morning']
		});
		expect(out.text).toBe('');
		expect(out.placed).toEqual([{ role: 'system', depth: 0, text: 'wolves are near', at: 1 }]);
	});

	test('constant is not required: the title alone keeps it always in play', () => {
		const out = resolveLorebooks({
			books: [bookWith('[GENERATE:REGEX:dragon]', 'dragon lore', { constant: false })],
			messages: ['a dragon sleeps']
		});
		expect(out.placed).toHaveLength(1);
	});

	test('no match injects nothing', () => {
		const out = resolveLorebooks({
			books: [bookWith('[GENERATE:REGEX:dragon]', 'x')],
			messages: ['only wolves here']
		});
		expect(out.text).toBe('');
		expect(out.placed).toHaveLength(0);
	});

	test('an invalid pattern injects nothing instead of throwing', () => {
		const out = resolveLorebooks({
			books: [bookWith('[GENERATE:REGEX:[broken', 'x')],
			messages: ['anything']
		});
		expect(out.placed).toHaveLength(0);
	});

	test('entry content goes through the same expand as other lore', () => {
		const out = resolveLorebooks({
			books: [bookWith('[GENERATE:REGEX:wolf]', 'keeper of the {{place}}')],
			messages: ['a wolf howls'],
			expand: (t) => t.replace('{{place}}', 'citadel')
		});
		expect(out.placed[0].text).toBe('keeper of the citadel');
	});

	test('regular entries still scan alongside a regex-placement entry', () => {
		const b = createEmptyLorebook('b');
		b.entries = [
			{
				...createEmptyLorebookEntry(),
				id: 'e-regex',
				comment: '[GENERATE:REGEX:wolf]',
				content: 'wolf warning'
			},
			{
				...createEmptyLorebookEntry(),
				id: 'e-key',
				comment: 'Town',
				content: 'town lore',
				key: ['town']
			}
		] as never;
		const out = resolveLorebooks({ books: [b], messages: ['the town heard a wolf howl'] });
		expect(out.text).toBe('town lore');
		expect(out.placed.map((p) => p.text)).toEqual(['wolf warning']);
	});
});

describe('full assembly: the regex placement lands before the matched turn', () => {
	test('assemblePrompt splices at the matched message index', () => {
		const b = bookWith('[GENERATE:REGEX:wolf]', '[The wolves stir.]');
		const a = assemblePrompt({
			preset: { id: 'p', name: 'p', items: [{ id: 'i1', role: 'system', content: '{{chatHistory}}', enabled: true }], controls: [] },
			resolvedCharacters: [],
			resolvedPersona: null,
			lorebooks: [b],
			controls: [],
			customFields: {},
			chatMessages: [
				{ id: 'm1', role: 'user', content: 'the town sleeps', parentId: null },
				{ id: 'm2', role: 'assistant', content: 'a wolf howls', parentId: null },
				{ id: 'm3', role: 'user', content: 'morning comes', parentId: null }
			],
			recall: { text: null, archivedIds: new Set() },
			postProcessing: { mode: 'none' }
		} as never);
		const texts = a.messages.map((m) => m.content);
		const wolves = texts.indexOf('[The wolves stir.]');
		expect(wolves).toBeGreaterThan(-1);
		// It sits directly before the FIRST message matching the pattern.
		expect(texts[wolves + 1]).toBe('a wolf howls');
	});
});
