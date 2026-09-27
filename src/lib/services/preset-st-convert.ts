import type { ImportedPreset } from '$lib/services/preset-io';
import { MACROS } from '$lib/macros';
import type { PromptControl, PromptControlOption, PromptItem, PromptPresetMeta, PromptRole } from '$lib/types/database';
import { normalizeCarriedRules } from '$lib/utils/regex-rules';

/**
 * SillyTavern Chat Completion preset → ChungusHub preset converter.
 *
 * The two formats are genuinely different shapes (ST: a `prompts` pool plus a
 * `prompt_order` checklist; here: one ordered `items` array), so this converts
 * rather than refuses. What carries across faithfully:
 *
 * - items in the order `prompt_order` lists them, with that checklist's enabled
 *   flags; prompts the checklist never mentions are imported disabled at the end
 * - the eight system markers become items holding the matching ChungusHub macro
 *   (`{{chatHistory}}`, `{{description}}`, …) at the same position
 * - each prompt's role, name and content, with ST's comment macros stripped the way
 *   ST itself renders them (to nothing); variables and randomization travel live
 * - `extensions.regex_scripts` become the preset's carried rules through the
 *   same parser the Regex page uses
 *
 * What cannot carry: tavern_helper scripts (no runtime here) and the sampler settings
 * (a connection-level concern, not a preset's). ST's variable and randomization macros
 * now run natively (utils/var-macros.ts), so they travel verbatim; only comment macros
 * are stripped, because they render to nothing in ST and the engine has no comment form.
 * Both of the real gaps are counted in `conversionNotes` instead of failing the import.
 */

/** The markers with a direct macro equivalent. Keyed by ST identifier. */
const MARKER_MACROS: Record<string, string> = {
	chatHistory: 'chatHistory',
	charDescription: 'description',
	charPersonality: 'personality',
	scenario: 'scenario',
	personaDescription: 'persona',
	dialogueExamples: 'mesExamples',
	worldInfoBefore: 'lorebook'
};

/** Markers that exist in ST with no content of their own and no macro here.
 *  Dropped silently when empty; counted when the author put content in them. */
const DROPPED_MARKERS = new Set(['main', 'nsfw', 'jailbreak', 'enhanceDefinitions']);

/** The one macro family still stripped at import: comments render to nothing in ST and
 *  the engine has no comment macro. Variables, randomization and utilities all run live
 *  now (utils/var-macros.ts), so they travel verbatim. */
const VOID_MACROS: RegExp[] = [/\{\{\s*\/\/[\s\S]*?\}\}/gi];

/** ST macro spellings with a different case here (macro names match verbatim). */
const MACRO_RESPELL: [RegExp, string][] = [
	[/\{\{\s*lastusermessage\s*\}\}/gi, '{{lastUserMessage}}'],
	[/\{\{\s*lastcharmessage\s*\}\}/gi, '{{lastCharMessage}}'],
	[/\{\{\s*charFirstMessage\s*\}\}/gi, '{{charFirstMessage}}']
];

/** Values of the sampler block worth surfacing, since a connection owns them here. */
const SAMPLER_KEYS = [
	'temperature',
	'top_p',
	'top_k',
	'min_p',
	'top_a',
	'frequency_penalty',
	'presence_penalty',
	'repetition_penalty',
	'openai_max_tokens',
	'openai_max_context',
	'seed'
] as const;

interface StPrompt {
	identifier: string;
	name: string;
	role: PromptRole;
	content: string;
	marker: boolean;
	injectionPosition: number | null;
	injectionDepth: number | null;
}

interface StOrderEntry {
	identifier: string;
	enabled: boolean;
}

function asString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function readPrompts(raw: unknown): Map<string, StPrompt> {
	const map = new Map<string, StPrompt>();
	if (!Array.isArray(raw)) return map;
	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue;
		const p = entry as Record<string, unknown>;
		if (typeof p.identifier !== 'string' || !p.identifier) continue;
		const role = p.role === 'user' || p.role === 'assistant' ? p.role : 'system';
		map.set(p.identifier, {
			identifier: p.identifier,
			name: asString(p.name) || p.identifier,
			role,
			content: asString(p.content),
			marker: p.marker === true,
			injectionPosition: typeof p.injection_position === 'number' ? p.injection_position : null,
			injectionDepth: typeof p.injection_depth === 'number' ? p.injection_depth : null
		});
	}
	return map;
}

/** The checklist for the default character (100001) wins; ST never ships others
 *  in a preset, but the shape allows it and the first is a fine fallback. */
function readOrder(raw: unknown): StOrderEntry[] {
	if (!Array.isArray(raw)) return [];
	const list = raw.find(
		(entry) => entry && typeof entry === 'object' && (entry as { character_id?: unknown }).character_id === 100001
	);
	const chosen = (list ?? raw[0]) as Record<string, unknown> | undefined;
	const order = chosen?.order;
	if (!Array.isArray(order)) return [];
	return order
		.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
		.map((entry) => ({
			identifier: typeof entry.identifier === 'string' ? entry.identifier : '',
			enabled: entry.enabled !== false
		}))
		.filter((entry) => entry.identifier);
}

function stripStMacros(content: string, counts: Map<string, number>): string {
	let out = content;
	for (const pattern of VOID_MACROS) {
		out = out.replace(pattern, (matched) => {
			const inner = matched
				.replace(/\{\{|\}\}/g, '')
				.trim()
				.toLowerCase();
			const key = inner.startsWith('//') ? 'comment' : inner.split(':')[0].split('::')[0];
			counts.set(key, (counts.get(key) ?? 0) + 1);
			return '';
		});
	}
	for (const [pattern, spelling] of MACRO_RESPELL) out = out.replace(pattern, spelling);
	return out;
}

function noteFor(counts: Map<string, number>): string[] {
	if (counts.size === 0) return [];
	const parts = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`);
	return [`已剥除注释宏（渲染为空，无语义损失）：${parts.join('、')}`];
}

export function looksLikeSillyTavernPreset(raw: Record<string, unknown>): boolean {
	return Array.isArray(raw.prompts) || Array.isArray(raw.prompt_order);
}

/** Names a control macro may not take: every built-in macro, engine-resolved or
 *  flow-supplied. Mirrors the guard PromptBuilderView applies to hand-authored controls. */
const RESERVED_MACROS = new Set<string>(MACROS.map((m) => m.name));

/** P002 phase 2: the collapsed group every entry toggle lands in. */
const ENTRY_GROUP_ID = 'entry-toggles';

/** P002 phase 2: one entry toggle per imported-disabled item that carries content. This
 *  is ST's own checklist affordance: anything the author shipped switched off, the
 *  reader can switch on. Empty-content rows (stripped pure-switch writers, marker
 *  placeholders) have nothing to offer when enabled, so they get no toggle. */
function entryTogglesFor(items: PromptItem[]): PromptControl[] {
	return items
		.filter((item) => !item.enabled && item.content.trim().length > 0)
		.map((item) => ({
			id: crypto.randomUUID(),
			macro: `entry:${item.id}`,
			label: item.name || '未命名条目',
			type: 'entryToggle' as const,
			itemId: item.id,
			defaultOn: false,
			group: ENTRY_GROUP_ID
		}));
}

const VAR_ARG = '(?:[^{}]|\\{\\{[^{}]*\\}\\})*';
const SETVAR_RE_SRC = `\\{\\{setvar::([^:{}]+)::(${VAR_ARG})\\}\\}`;
const GETVAR_RE_SRC = '\\{\\{getvar::([^:{}]+)\\}\\}';

function fnv1a36(text: string): string {
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
}

/** A readable macro for a variable name: ASCII names pass through, CJK names go through
 *  pinyin (lazy import, it is import-time only), everything else falls back to a stable
 *  hash. Collisions and reserved names get numbered suffixes. */
async function slugFor(name: string, used: Set<string>): Promise<string> {
	let base = name.trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(base)) {
		try {
			const { pinyin } = await import('pinyin-pro');
			base = pinyin(base, { toneType: 'none', separator: '' });
		} catch {
			base = '';
		}
		base = base.replace(/[^A-Za-z0-9_]/g, '');
		if (!base) base = `v${fnv1a36(name)}`;
		if (/^[0-9]/.test(base)) base = `v${base}`;
	}
	let slug = base;
	let n = 2;
	while (used.has(slug) || RESERVED_MACROS.has(slug)) slug = `${base}_${n++}`;
	used.add(slug);
	return slug;
}

interface VarAutoControls {
	controls: PromptControl[];
	rewrittenItems: number;
	strippedCalls: number;
	skipped: number;
}

/** P002 phase 1: turn ST's setvar/getvar switch idiom into native controls. A variable
 *  becomes a select control when it has TWO OR MORE literal setvar values somewhere in
 *  the preset AND is read by getvar at least once; the control's options are those
 *  values (default = the first written, i.e. the init item's). Every `{{getvar::X}}` on
 *  a grouped variable is rewritten to `{{macro}}`, and the grouped `{{setvar}}` calls
 *  are stripped out so the control bucket, not the chat var table, owns the value.
 *  Anything else (single-value vars, macro-computed values, vars only scripts write)
 *  stays a live runtime variable untouched. */
async function autoControlsFromVars(items: PromptItem[]): Promise<VarAutoControls> {
	const setValues = new Map<string, string[]>();
	const readNames = new Set<string>();

	for (const item of items) {
		const getRe = new RegExp(GETVAR_RE_SRC, 'gi');
		let getMatch: RegExpExecArray | null;
		while ((getMatch = getRe.exec(item.content)) !== null) readNames.add(getMatch[1].trim());

		const setRe = new RegExp(SETVAR_RE_SRC, 'gi');
		let setMatch: RegExpExecArray | null;
		while ((setMatch = setRe.exec(item.content)) !== null) {
			const name = setMatch[1].trim();
			const value = setMatch[2].trim();
			if (value.includes('{{')) continue;
			const list = setValues.get(name) ?? [];
			if (!list.some((v) => v === value)) list.push(value);
			setValues.set(name, list);
		}
	}

	const grouped = new Map<string, string[]>();
	let skipped = 0;
	for (const [name, values] of setValues) {
		if (values.length >= 2 && readNames.has(name)) grouped.set(name, values);
		else skipped++;
	}
	if (grouped.size === 0) return { controls: [], rewrittenItems: 0, strippedCalls: 0, skipped };

	const used = new Set<string>();
	const controls: PromptControl[] = [];
	const nameToMacro = new Map<string, string>();
	for (const [name] of grouped) nameToMacro.set(name, await slugFor(name, used));

	let rewrittenItems = 0;
	let strippedCalls = 0;
	for (const item of items) {
		let content = item.content;
		let touched = false;
		for (const [name, macro] of nameToMacro) {
			const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			const getRe = new RegExp(`\\{\\{getvar::${escaped}\\}\\}`, 'gi');
			if (getRe.test(content)) {
				content = content.replace(getRe, `{{${macro}}}`);
				touched = true;
			}
			const setRe = new RegExp(`\\{\\{setvar::${escaped}::${VAR_ARG}\\}\\}`, 'gi');
			const before = content;
			content = content.replace(setRe, () => {
				strippedCalls++;
				return '';
			});
			if (content !== before) touched = true;
		}
		if (touched) {
			item.content = content;
			rewrittenItems++;
			// An item whose only job was writing a grouped switch would now inject an
			// empty string every turn; switch it off instead of shipping dead weight.
			if (item.enabled && content.trim() === '') item.enabled = false;
		}
	}

	for (const [name, values] of grouped) {
		const options: PromptControlOption[] = values.map((value) => ({
			id: crypto.randomUUID(),
			label: value === '' ? '（空）' : value,
			injectedText: value
		}));
		controls.push({
			id: crypto.randomUUID(),
			macro: nameToMacro.get(name) as string,
			label: name,
			type: 'select',
			options,
			defaultOptionId: options[0].id,
			group: '变量开关'
		});
	}

	return { controls, rewrittenItems, strippedCalls, skipped };
}

export async function convertSillyTavernPreset(
	raw: Record<string, unknown>,
	fileName?: string
): Promise<ImportedPreset> {
	const prompts = readPrompts(raw.prompts);
	const order = readOrder(raw.prompt_order);
	const counts = new Map<string, number>();
	const notes: string[] = [];
	const seen = new Set<string>();
	const items: PromptItem[] = [];

	for (const entry of order) {
		const prompt = prompts.get(entry.identifier);
		if (!prompt) continue;
		seen.add(entry.identifier);

		if (prompt.marker) {
			if (prompt.content) {
				// An author-picked marker: keep the text as a plain item.
				items.push({
					id: crypto.randomUUID(),
					name: prompt.name,
					role: prompt.role,
					content: stripStMacros(prompt.content, counts),
					enabled: entry.enabled
				});
			} else if (entry.identifier === 'worldInfoAfter') {
				items.push({
					id: crypto.randomUUID(),
					name: prompt.name,
					role: 'system',
					content: '',
					enabled: false,
					note: 'ST 在此注入 worldInfoAfter；ChungusHub 的世界书由 {{lorebook}} 在 worldInfoBefore 位置统一注入，此条目仅作位置记录。'
				});
			} else if (MARKER_MACROS[entry.identifier]) {
				items.push({
					id: crypto.randomUUID(),
					name: prompt.name,
					role: 'system',
					content: `{{${MARKER_MACROS[entry.identifier]}}}`,
					enabled: entry.enabled
				});
			} else if (DROPPED_MARKERS.has(entry.identifier)) {
				continue;
			}
			continue;
		}

		const stripped = stripStMacros(prompt.content, counts);
		const absNote =
			prompt.injectionPosition === 1
				? `ST 绝对注入 depth=${prompt.injectionDepth ?? 0}；ChungusHub 无此概念，已按原顺序就地放置。`
				: undefined;
		items.push({
			id: crypto.randomUUID(),
			name: prompt.name,
			role: prompt.role,
			content: stripped,
			enabled: entry.enabled,
			...(absNote ? { note: absNote } : undefined)
		});
	}

	// Prompts the checklist never mentions: kept visible, switched off.
	for (const [identifier, prompt] of prompts) {
		if (seen.has(identifier)) continue;
		if (prompt.marker && (prompt.content || MARKER_MACROS[identifier])) {
			const macro = MARKER_MACROS[identifier];
			if (macro) {
				items.push({
					id: crypto.randomUUID(),
					name: prompt.name,
					role: 'system',
					content: `{{${macro}}}`,
					enabled: false
				});
			}
			continue;
		}
		if (prompt.marker) continue;
		items.push({
			id: crypto.randomUUID(),
			name: prompt.name,
			role: prompt.role,
			content: stripStMacros(prompt.content, counts),
			enabled: false
		});
	}

	const auto = await autoControlsFromVars(items);
	if (auto.controls.length > 0) {
		notes.push(
			`已从 ST 变量自动生成 ${auto.controls.length} 个控件（预设级作用域：同一预设的所有聊天共享开关状态，与酒馆的聊天级变量不同），改写了 ${auto.rewrittenItems} 个条目、停写了 ${auto.strippedCalls} 处变量赋值。`
		);
		if (auto.skipped > 0) {
			notes.push(`另有 ${auto.skipped} 个变量保持为运行时变量（单值、值含宏或从未被读取，不成开关）。`);
		}
	}

	// P008: ST presets never carry the {{memory}} slot macro, so the memory engine's
	// recall block has nowhere to inject (the third gate fails) and the reader pays
	// for extractions that reach nothing. Append one enabled system item before the
	// chat history marker; presets already carrying the macro are untouched.
	if (!items.some((i) => /\{\{\s*memory\s*\}\}/i.test(i.content))) {
		const memoryItem = {
			id: crypto.randomUUID(),
			name: '记忆',
			role: 'system' as const,
			content: '{{memory}}',
			enabled: true
		};
		const historyIdx = items.findIndex((i) => i.content.trim().toLowerCase() === '{{chathistory}}');
		if (historyIdx >= 0) {
			items.splice(historyIdx, 0, memoryItem);
		} else {
			items.push(memoryItem);
		}
		notes.push('已自动补「记忆」条目（原预设没有 {{memory}}，ChungusHub 记忆靠它注入）；不需要可在 Prompt Builder 删除。');
	}

	// P002 phase 2: every imported-disabled item with content becomes an entry toggle, the
	// same "checklist" affordance ST's own prompt manager gives the reader. Collapsed by
	// default so 100+ toggles stay out of the way until wanted.
	const entry = entryTogglesFor(items);
	if (entry.length > 0) {
		notes.push(`已为 ${entry.length} 个停用条目生成条目开关（面板「条目开关」分组，默认收起）。`);
	}
	notes.push(...noteFor(counts));

	const samplerNotes = SAMPLER_KEYS.filter((key) => raw[key] !== undefined && raw[key] !== null).map(
		(key) => `${key}=${String(raw[key])}`
	);
	if (samplerNotes.length > 0) {
		notes.push(`采样参数不随预设走（在本应用里属于连接设置）：${samplerNotes.join('，')}`);
	}

	const extensions = raw.extensions;
	if (extensions && typeof extensions === 'object' && !Array.isArray(extensions)) {
		const ext = extensions as Record<string, unknown>;
		const helper: unknown = ext.tavern_helper;
		const helperScripts = Array.isArray(helper)
			? helper
			: helper && typeof helper === 'object'
				? (helper as Record<string, unknown>).scripts
				: undefined;
		if (Array.isArray(helperScripts) && helperScripts.length > 0) {
			notes.push('检测到 tavern_helper 脚本（酒馆助手）：ChungusHub 没有对应运行时，未迁移。');
		}
		if (ext.regex_scripts !== undefined) {
			const rules = normalizeCarriedRules(ext.regex_scripts);
			if (rules) notes.push(`已随预设带入 ${rules.length} 条 ST 正则脚本（可在正则页查看/开关）。`);
		}
	}

	const meta: PromptPresetMeta = {
		...(fileName ? { description: `Converted from ${fileName}` } : {}),
		writtenFor: 'SillyTavern（已转换）'
	};

	return {
		name: (fileName ?? '').replace(/\.json$/i, '') || 'Imported preset',
		items,
		controls: [...auto.controls, ...entry],
		sections: entry.length > 0 ? [{ id: ENTRY_GROUP_ID, title: '条目开关', collapsed: true }] : undefined,
		regexRules: normalizeCarriedRules(
			extensions && typeof extensions === 'object' && !Array.isArray(extensions)
				? (extensions as Record<string, unknown>).regex_scripts
				: undefined
		),
		pruneEmptyBlocks: true,
		meta,
		conversionNotes: notes.length > 0 ? notes : undefined
	};
}
