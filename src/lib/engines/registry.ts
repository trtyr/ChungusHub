/**
 * Engines are the app's built-in AI machinery: Chat Memory, Opening Scene,
 * Steering, Spellcheck, Impersonate, Sprites. Each engine is its own deep
 * system; this registry is their shared identity for the Engines settings
 * page: what the engine does, whether it makes model calls (every
 * calling engine is a routing point with its own concrete connection on the
 * Connections page, with no roles and no defaults-following), which editable
 * templates drive it, and its app-wide on/off switch.
 *
 * Pure data plus tiny accessors: no engine logic lives here. An engine's id
 * doubles as its debug-panel source label (`sourceColor` in debug/format.ts).
 * The prompt field descriptors are the single source for the inline prompt
 * editor in the Engines settings page.
 *
 * There is no fixed-sampling table here: an engine runs on its connection's own
 * generation settings, because overriding the settings of a connection you
 * deliberately assigned makes assigning it pointless.
 *
 * A feature that needs bespoke UI or a bespoke pipeline is an engine. See
 * architecture/engines.md.
 */
import { featurePromptsStore, type FeaturePromptKey } from '$lib/stores/featurePrompts.svelte';

export type EngineId =
	| 'memory'
	| 'opening-scene'
	| 'steering'
	| 'spellcheck'
	| 'impersonate'
	| 'sprites';

export interface EnginePromptField {
	key: FeaturePromptKey;
	label: string;
	hint: string;
	/**
	 * Macros the template is useless without: the editor warns when an edit drops one.
	 *
	 * Not every missing macro matters (a template that stops mentioning {{char}} is a style
	 * choice), so this lists only the ones whose absence makes the call meaningless while
	 * still returning something plausible. The engine that owns the template throws on the
	 * same condition; this is the earlier, gentler half of the same rule.
	 */
	requires?: string[];
}

export interface EngineDef {
	/** Also the engine's `source` label on LLM calls in the prompt debug panel. */
	id: EngineId;
	name: string;
	icon: 'brain' | 'sparkles' | 'compass' | 'checkCircle' | 'mask' | 'image';
	/** One line for the engine's row: what it does, nothing about cost or trigger. */
	summary: string;
	/** The tooltip beside the engine's name in the detail view: what it does and when it fires. */
	description: string;
	/**
	 * Whether this engine makes model calls of its own. Every calling engine is a
	 * routing point: its connection is assigned directly and visibly on the
	 * Connections page (`connectionStore.assignments`), with no role or default
	 * behind it. `false` only for Steering, whose text rides the story generation
	 * without a call of its own: it has nothing to assign.
	 */
	makesCalls: boolean;
	/** Editable templates, in the inline prompt-editor field format. */
	prompts: EnginePromptField[];
	/** The engine's app-wide on/off switch. Off leaves stored data intact and only makes
	 *  the runtime inert (no recall/extraction, no on-demand run, no per-turn sidecar). */
	enabled: { get(): boolean; set(value: boolean): void };
}

export const ENGINES: EngineDef[] = [
	{
		id: 'memory',
		name: 'Chat Memory',
		icon: 'brain',
		summary: 'eng.s0',
		description: 'eng.d0',
		makesCalls: true,
		prompts: [
			{
				key: 'memoryExtract',
				label: 'eng.l0',
				hint: 'eng.h0',
				requires: ['{{batch}}']
			},
			{
				key: 'memoryPromote',
				label: 'eng.l1',
				hint: 'eng.h1',
				requires: ['{{episodes}}']
			}
		],
		enabled: {
			get: () => featurePromptsStore.memoryEnabled,
			set: (value) => featurePromptsStore.setMemoryEnabled(value)
		}
	},
	{
		id: 'opening-scene',
		name: 'Opening Scene',
		icon: 'sparkles',
		summary: 'eng.s1',
		description: 'eng.d1',
		makesCalls: true,
		prompts: [
			{
				key: 'openingScene',
				label: 'eng.l2',
				hint: "eng.x200"
			}
		],
		enabled: {
			get: () => featurePromptsStore.openingSceneEnabled,
			set: (value) => featurePromptsStore.setOpeningSceneEnabled(value)
		}
	},
	{
		id: 'steering',
		name: 'Steering',
		icon: 'compass',
		summary: 'eng.s2',
		description: 'eng.d2',
		makesCalls: false,
		prompts: [
			{
				key: 'steeringWrapper',
				label: 'eng.l3',
				hint: 'eng.h2'
			}
		],
		enabled: {
			get: () => featurePromptsStore.steeringEnabled,
			set: (value) => featurePromptsStore.setSteeringEnabled(value)
		}
	},
	{
		id: 'spellcheck',
		name: 'Spellcheck',
		icon: 'checkCircle',
		summary: 'eng.s3',
		description: 'eng.d3',
		makesCalls: true,
		prompts: [
			{
				key: 'spellcheck',
				label: 'eng.l4',
				hint: 'eng.h3'
			}
		],
		enabled: {
			get: () => featurePromptsStore.spellcheckEnabled,
			set: (value) => featurePromptsStore.setSpellcheckEnabled(value)
		}
	},
	{
		id: 'impersonate',
		name: 'Impersonate',
		icon: 'mask',
		summary: 'eng.s4',
		description: 'eng.d4',
		makesCalls: true,
		prompts: [
			{
				key: 'impersonate',
				label: 'eng.l5',
				hint: 'eng.h4'
			}
		],
		enabled: {
			get: () => featurePromptsStore.impersonateEnabled,
			set: (value) => featurePromptsStore.setImpersonateEnabled(value)
		}
	},
	{
		id: 'sprites',
		name: 'Sprites',
		icon: 'image',
		summary: "eng.x201",
		description:
			"eng.x202",
		makesCalls: true,
		prompts: [
			{
				key: 'sprites',
				label: 'eng.l6',
				hint: "eng.x203",
				requires: ['{{labels}}']
			}
		],
		enabled: {
			get: () => featurePromptsStore.spritesEnabled,
			set: (value) => featurePromptsStore.setSpritesEnabled(value)
		}
	}
];

export function engineById(id: EngineId): EngineDef {
	const def = ENGINES.find((e) => e.id === id);
	if (!def) throw new Error(`Unknown engine: ${id}`);
	return def;
}

