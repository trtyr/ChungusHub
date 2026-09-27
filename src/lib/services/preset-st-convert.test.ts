import { beforeAll, describe, expect, test } from 'bun:test';
import { convertSillyTavernPreset, looksLikeSillyTavernPreset } from './preset-st-convert';
import { parsePresetJson } from './preset-io';

/** A minimal but faithful ST Chat Completion preset: the marker set, one variable-macro
 *  item, one absolute injection, an entry the checklist never mentions, and one regex. */
const stPreset = {
	temperature: 0.7,
	top_p: 0.95,
	seed: 42,
	impersonation_prompt: 'Write {{char}} next reply',
	prompts: [
		{ identifier: 'main', name: 'Main Prompt', role: 'system', content: '', marker: true, enabled: true },
		{
			identifier: 'charDescription',
			name: 'Char Description',
			role: 'system',
			content: '',
			marker: true,
			enabled: true
		},
		{
			identifier: 'chatHistory',
			name: 'Chat History',
			role: 'system',
			content: '',
			marker: true,
			enabled: true
		},
		{
			identifier: 'worldInfoAfter',
			name: 'World Info (after)',
			role: 'system',
			content: '',
			marker: true,
			enabled: true
		},
		{
			identifier: 'style-a',
			name: '文风指令',
			role: 'system',
			content: '保持{{lastusermessage}}的语气。{{setvar::format::小说}}{{getvar::format}}{{trim}}{{//作者备注：不要动}}',
			enabled: true,
			injection_position: 0,
			injection_depth: 4
		},
		{
			identifier: 'abs-inject',
			name: '绝对注入',
			role: 'system',
			content: '插在历史中间的条目',
			enabled: true,
			injection_position: 1,
			injection_depth: 2
		},
		{
			identifier: 'orphan',
			name: '没进清单的条目',
			role: 'user',
			content: '备用内容 {{random:a,b,c}}',
			enabled: true
		}
	],
	prompt_order: [
		{
			character_id: 100001,
			order: [
				{ identifier: 'main', enabled: true },
				{ identifier: 'charDescription', enabled: true },
				{ identifier: 'style-a', enabled: true },
				{ identifier: 'worldInfoAfter', enabled: true },
				{ identifier: 'abs-inject', enabled: false },
				{ identifier: 'chatHistory', enabled: true }
			]
		}
	],
	extensions: {
		regex_scripts: [
			{
				id: '11111111-1111-1111-1111-111111111111',
				scriptName: '去思维链',
				findRegex: '/<think>[\\s\\S]*?<\\/think>/gi',
				replaceString: '',
				disabled: false,
				placement: [2],
				markdownOnly: false,
				promptOnly: true,
				minDepth: null,
				maxDepth: null
			}
		],
		tavern_helper: { scripts: [{ name: 'ui panel', code: 'setvar("x", 1);' }], variables: {} }
	}
};

describe('looksLikeSillyTavernPreset', () => {
	test('claims a prompt pool', async () => {
		expect(looksLikeSillyTavernPreset(stPreset)).toBe(true);
	});
	test('does not claim our own documents', async () => {
		expect(looksLikeSillyTavernPreset({ items: [] })).toBe(false);
	});
});

describe('convertSillyTavernPreset', () => {
	let converted: Awaited<ReturnType<typeof convertSillyTavernPreset>>;
	let names: string[];
	let byName: Map<string, Awaited<ReturnType<typeof convertSillyTavernPreset>>['items'][number]>;
	beforeAll(async () => {
		converted = await convertSillyTavernPreset(stPreset, 'test preset.json');
		names = converted.items.map((item) => item.name);
		byName = new Map(converted.items.map((item) => [item.name, item]));
	});

	test('orders items by the checklist, with unlisted prompts disabled at the end', async () => {
		expect(names).toEqual([
			'Char Description',
			'文风指令',
			'World Info (after)',
			'绝对注入',
			'记忆',
			'Chat History',
			'没进清单的条目'
		]);
		expect(byName.get('绝对注入')?.enabled).toBe(false);
		expect(byName.get('没进清单的条目')?.enabled).toBe(false);
	});

	test('markers become items holding the matching macro', async () => {
		expect(byName.get('Char Description')?.content).toBe('{{description}}');
		expect(byName.get('Chat History')?.content).toBe('{{chatHistory}}');
	});

	test('worldInfoAfter is a disabled placeholder with a pointer note', async () => {
		const item = byName.get('World Info (after)');
		expect(item?.enabled).toBe(false);
		expect(item?.content).toBe('');
		expect(item?.note).toContain('{{lorebook}}');
	});

	test('variables travel verbatim; comments render away; ST spelling normalized', async () => {
		expect(byName.get('文风指令')?.content).toBe(
			'保持{{lastUserMessage}}的语气。{{setvar::format::小说}}{{getvar::format}}{{trim}}'
		);
	});

	test('absolute injection is kept in place with an explanatory note', async () => {
		const item = byName.get('绝对注入');
		expect(item?.note).toContain('depth=2');
	});

	test('roles carry across', async () => {
		expect(byName.get('没进清单的条目')?.role).toBe('user');
	});

	test('ST regex scripts become carried rules through the shared parser', async () => {
		expect(converted.regexRules).toHaveLength(1);
		expect(converted.regexRules?.[0].name).toBe('去思维链');
		expect(converted.regexRules?.[0].id).toBe('11111111-1111-1111-1111-111111111111');
	});

	test('conversion notes name what was stripped and where samplers went', async () => {
		const notes = converted.conversionNotes ?? [];
		expect(notes.some((n) => n.includes('comment×1'))).toBe(true);
		expect(notes.some((n) => n.includes('temperature=0.7'))).toBe(true);
		expect(notes.some((n) => n.includes('tavern_helper'))).toBe(true);
		expect(notes.some((n) => n.includes('1 条 ST 正则脚本'))).toBe(true);
	});

	test('the file name becomes the preset name and the byline marks the conversion', async () => {
		expect(converted.name).toBe('test preset');
		expect(converted.meta?.writtenFor).toBe('SillyTavern（已转换）');
	});

	test('parsePresetJson routes a SillyTavern document to the converter', async () => {
		const parsed = await parsePresetJson(JSON.stringify(stPreset));
		expect(parsed.items.length).toBe(converted.items.length);
	});
});

describe('P008 memory item auto-append', () => {
	const baseDoc = (prompts: unknown[], order: unknown[]) => ({
		name: 'T',
		prompts,
		prompt_order: [{ character_id: 100001, order }]
	});

	test('appends one enabled memory item before chatHistory, with a note', async () => {
		const out = await convertSillyTavernPreset(
			baseDoc(
				[
					{ identifier: 'worldInfoBefore', name: 'World Info', marker: true, content: '' },
					{ identifier: 'chatHistory', name: 'Chat History', marker: true, content: '' }
				],
				[
					{ identifier: 'worldInfoBefore', enabled: true },
					{ identifier: 'chatHistory', enabled: true }
				]
			),
			't.json'
		);
		const mem = out.items.filter((i) => /\{\{\s*memory\s*\}\}/i.test(i.content));
		expect(mem.length).toBe(1);
		expect(mem[0].enabled).toBe(true);
		expect(mem[0].role).toBe('system');
		const histIdx = out.items.findIndex((i) => i.content.trim().toLowerCase() === '{{chathistory}}');
		const memIdx = out.items.indexOf(mem[0]);
		expect(memIdx).toBe(histIdx - 1);
		expect((out.conversionNotes ?? []).some((n) => n.includes('记忆'))).toBe(true);
	});

	test('a preset already carrying {{memory}} is untouched', async () => {
		const out = await convertSillyTavernPreset(
			baseDoc(
				[
					{ identifier: 'memo', name: 'Memo', role: 'system', content: '前言 {{memory}}' },
					{ identifier: 'chatHistory', name: 'Chat History', marker: true, content: '' }
				],
				[
					{ identifier: 'memo', enabled: true },
					{ identifier: 'chatHistory', enabled: true }
				]
			),
			't2.json'
		);
		const mem = out.items.filter((i) => /\{\{\s*memory\s*\}\}/i.test(i.content));
		expect(mem.length).toBe(1);
		expect(mem[0].name).toBe('Memo');
		expect((out.conversionNotes ?? []).some((n) => n.includes('自动补'))).toBe(false);
	});

	test('without a chatHistory marker the memory item goes to the end', async () => {
		const out = await convertSillyTavernPreset(
			baseDoc(
				[{ identifier: 'worldInfoBefore', name: 'World Info', marker: true, content: '' }],
				[{ identifier: 'worldInfoBefore', enabled: true }]
			),
			't3.json'
		);
		const mem = out.items.filter((i) => i.content === '{{memory}}');
		expect(mem.length).toBe(1);
		expect(out.items.indexOf(mem[0])).toBe(out.items.length - 1);
	});
});
