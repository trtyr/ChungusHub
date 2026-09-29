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
