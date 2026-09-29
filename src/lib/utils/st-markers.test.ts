import { describe, expect, test } from 'bun:test';
import { detectStMarkers, hasStMarkers, stripEjsBlocks } from './st-markers';
import { assemblePrompt } from './prompt-assembly';
import type { PromptItem } from '$lib/types/database';

function item(content: string): PromptItem {
	return { id: 'i1', name: 'n', role: 'system', content, enabled: true } as never;
}

function preset(items: PromptItem[]) {
	return {
		id: 'p1',
		name: 'p',
		items,
		postProcessing: { mode: 'none' }
	} as never;
}

describe('detectStMarkers', () => {
	test('EJS scriptlet and expression blocks', () => {
		expect(detectStMarkers('<% if (x) { %>hi<% } %>').ejs).toBe(true);
		expect(detectStMarkers('affinity: <%= v %>').ejs).toBe(true);
		expect(detectStMarkers('plain text').ejs).toBe(false);
		expect(detectStMarkers('').ejs).toBe(false);
	});

	test('SPT entry-title syntax matches at line start', () => {
		expect(detectStMarkers('@INJECT pos=1,role=system').inject).toBe(true);
		expect(detectStMarkers('[GENERATE:BEFORE]').inject).toBe(true);
		expect(detectStMarkers('[GENERATE:3:AFTER]').inject).toBe(true);
		expect(detectStMarkers('[RENDER:REGEX:hello]').inject).toBe(true);
		expect(detectStMarkers('[InitialVariables]').inject).toBe(true);
		expect(detectStMarkers('[Preprocessing] activator').inject).toBe(true);
		// Mid-text mentions are not entry titles.
		expect(detectStMarkers('see [GENERATE:BEFORE] docs').inject).toBe(false);
	});

	test('TavernHelper references flag script cards', () => {
		expect(detectStMarkers('const v = TavernHelper.getVariables()').tavernHelper).toBe(true);
		expect(detectStMarkers('await getVariables({ type: "message" })').tavernHelper).toBe(true);
		expect(detectStMarkers('triggerSlash("/flushvar")').tavernHelper).toBe(true);
		expect(detectStMarkers('no helpers here').tavernHelper).toBe(false);
	});

	test('hasStMarkers aggregates; <%% escape alone is not a block', () => {
		expect(hasStMarkers('<%% literal %%> only')).toBe(false);
		expect(hasStMarkers('<%%')).toBe(false);
		expect(hasStMarkers('x')).toBe(false);
	});
});

describe('stripEjsBlocks (send-side degrade, P015 档0)', () => {
	test('removes blocks, keeps surrounding text; originals are caller-owned', () => {
		expect(stripEjsBlocks('a<% hidden %>b')).toBe('ab');
		expect(stripEjsBlocks('<% setvar("k", 1) -%>\nvisible')).toBe('\nvisible');
	});

	test('fast path: no marker, same string back', () => {
		const s = 'nothing here';
		expect(stripEjsBlocks(s)).toBe(s);
		expect(stripEjsBlocks('')).toBe('');
	});

	test('<%% escapes are literal text, never stripped', () => {
		expect(stripEjsBlocks('<%% not a block %%> stays')).toBe('<%% not a block %%> stays');
		expect(stripEjsBlocks('<%%')).toBe('<%%');
	});

	test('multi-line blocks strip whole', () => {
		expect(stripEjsBlocks('keep\n<% one\ntwo\nthree %>end')).toBe('keep\nend');
	});
});

describe('assembly degrade (prompt-assembly exit)', () => {
	function fullInput(items: PromptItem[]): Record<string, unknown> {
		return {
			preset: preset(items),
			resolvedCharacters: [],
			resolvedPersona: null,
			lorebooks: [],
			controls: [],
			customFields: {},
			chatMessages: [],
			recall: { text: null, archivedIds: new Set<string>() },
			postProcessing: { mode: 'none' }
		};
	}

	test('preset items carrying EJS blocks reach the model stripped', () => {
		const a = assemblePrompt(fullInput([item('Rules. <% secret_logic() %> Visible rule.')]) as never);
		expect(a.messages).toHaveLength(1);
		expect(a.messages[0].content).toBe('Rules.  Visible rule.');
		expect(a.messages[0].content).not.toContain('<%');
	});

	test('clean items pass through byte-identical', () => {
		const a = assemblePrompt(fullInput([item('Plain rule.')]) as never);
		expect(a.messages[0].content).toBe('Plain rule.');
	});
});
