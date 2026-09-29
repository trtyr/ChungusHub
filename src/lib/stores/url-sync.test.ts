import { describe, expect, test } from 'bun:test';
import { hashForPanels, parseHash } from './url-hash';

const state = (over: Partial<Parameters<typeof hashForPanels>[0]> = {}) => ({
	activeOverlay: null,
	settingsOpen: false,
	libraryOpen: false,
	libraryTab: 'characters',
	assistantOpen: false,
	...over
});

describe('panel hash deep links', () => {
	test('the five overlay names parse to their OverlayType', () => {
		expect(parseHash('#chats')).toEqual({ kind: 'overlay', overlay: 'chats' });
		expect(parseHash('#preset-controls')).toEqual({ kind: 'overlay', overlay: 'presetControls' });
		expect(parseHash('#storymap')).toEqual({ kind: 'overlay', overlay: 'storymap' });
		expect(parseHash('#memory')).toEqual({ kind: 'overlay', overlay: 'memory' });
		expect(parseHash('#stats')).toEqual({ kind: 'overlay', overlay: 'stats' });
	});

	test('settings, assistant and plain library parse without extras', () => {
		expect(parseHash('#settings')).toEqual({ kind: 'settings' });
		expect(parseHash('#assistant')).toEqual({ kind: 'assistant' });
		expect(parseHash('#library')).toEqual({ kind: 'library', tab: null });
	});

	test('library shelves ride the slash', () => {
		expect(parseHash('#library/personas')).toEqual({ kind: 'library', tab: 'personas' });
		expect(parseHash('#library/lorebooks')).toEqual({ kind: 'library', tab: 'lorebooks' });
		expect(parseHash('#library/characters')).toEqual({ kind: 'library', tab: 'characters' });
	});

	test('unknown or stale values degrade to none', () => {
		expect(parseHash('#nonsense')).toEqual({ kind: 'none' });
		expect(parseHash('#library/nope')).toEqual({ kind: 'none' });
		expect(parseHash('#')).toEqual({ kind: 'none' });
		expect(parseHash('')).toEqual({ kind: 'none' });
	});

	test('every panel state round-trips: hashForPanels then parseHash agree', () => {
		// The write side and the read side are one vocabulary: whatever the sync effect
		// pushes, a later parse must name the same panel back.
		const cases = [
			state(),
			state({ activeOverlay: 'chats' }),
			state({ activeOverlay: 'presetControls' }),
			state({ activeOverlay: 'storymap' }),
			state({ activeOverlay: 'memory' }),
			state({ activeOverlay: 'stats' }),
			state({ settingsOpen: true }),
			state({ libraryOpen: true }),
			state({ libraryOpen: true, libraryTab: 'personas' }),
			state({ libraryOpen: true, libraryTab: 'lorebooks' }),
			state({ assistantOpen: true })
		];
		for (const s of cases) {
			const hash = hashForPanels(s);
			const back = parseHash(hash);
			if (s.activeOverlay) {
				expect(back).toEqual({ kind: 'overlay', overlay: s.activeOverlay });
			} else if (s.settingsOpen) {
				expect(back).toEqual({ kind: 'settings' });
			} else if (s.libraryOpen) {
				expect(back).toEqual({
					kind: 'library',
					tab: s.libraryTab === 'characters' ? null : s.libraryTab
				});
			} else if (s.assistantOpen) {
				expect(back).toEqual({ kind: 'assistant' });
			} else {
				expect(back).toEqual({ kind: 'none' });
			}
		}
	});
});
