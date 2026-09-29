import { describe, expect, test } from 'bun:test';
import { parseHash } from './url-hash';

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
});
