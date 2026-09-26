import type { ImportedPreset } from '$lib/services/preset-io';
import type { PromptItem, PromptPresetMeta, PromptRole } from '$lib/types/database';
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
 * What cannot carry: ST's variable system (`{{getvar}}`/`{{setvar}}`: the
 * values live in ST's session store, not in the file), tavern_helper scripts,
 * and the sampler settings (a connection-level concern here, not a preset's).
 * Each of those is counted in `conversionNotes` instead of failing the import.
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

export function convertSillyTavernPreset(raw: Record<string, unknown>, fileName?: string): ImportedPreset {
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
		controls: [],
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
