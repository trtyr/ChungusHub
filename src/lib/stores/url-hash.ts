/**
 * Pure parsing for the panel hash deep links (see url-sync.svelte.ts for the
 * wiring). No imports: it must load under a plain test runner, which does not
 * compile Svelte runes.
 */

/** Panels that render over the chat column. */
export const OVERLAY_HASHES = {
	chats: 'chats',
	'preset-controls': 'presetControls',
	storymap: 'storymap',
	memory: 'memory',
	stats: 'stats'
} as const;

export const LIBRARY_TABS = ['characters', 'personas', 'lorebooks'] as const;

/** The hash that names a panel state, or '' for the plain workspace. Pure: the sync
 *  module feeds it the live store, tests feed it literal states. */
export function hashForPanels(state: {
	activeOverlay: string | null;
	settingsOpen: boolean;
	libraryOpen: boolean;
	libraryTab: string;
	assistantOpen: boolean;
}): string {
	if (state.activeOverlay) {
		const name = Object.entries(OVERLAY_HASHES).find(([, v]) => v === state.activeOverlay)?.[0];
		if (name) return `#${name}`;
	}
	if (state.settingsOpen) return '#settings';
	if (state.libraryOpen) {
		return state.libraryTab === 'characters' ? '#library' : `#library/${state.libraryTab}`;
	}
	if (state.assistantOpen) return '#assistant';
	return '';
}

export type HashTarget =
	| { kind: 'overlay'; overlay: (typeof OVERLAY_HASHES)[keyof typeof OVERLAY_HASHES] }
	| { kind: 'settings' }
	| { kind: 'library'; tab: (typeof LIBRARY_TABS)[number] | null }
	| { kind: 'assistant' }
	| { kind: 'none' };

/** Parse a location hash (with or without the leading '#') into a panel target. */
export function parseHash(hash: string): HashTarget {
	const h = hash.replace(/^#/, '');
	if (h in OVERLAY_HASHES) return { kind: 'overlay', overlay: OVERLAY_HASHES[h as keyof typeof OVERLAY_HASHES] };
	if (h === 'settings') return { kind: 'settings' };
	if (h === 'assistant') return { kind: 'assistant' };
	if (h === 'library' || h.startsWith('library/')) {
		const rest = h.slice('library'.length + (h.includes('/') ? 1 : 0));
		if (!rest) return { kind: 'library', tab: null };
		if ((LIBRARY_TABS as readonly string[]).includes(rest))
			return { kind: 'library', tab: rest as (typeof LIBRARY_TABS)[number] };
	}
	return { kind: 'none' };
}
