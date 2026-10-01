import { describe, expect, test } from 'bun:test';

/**
 * EN-19 root-cause pin: `i18n.t` was a class METHOD, and seven call sites hand it
 * to formatters as a bare callback (`activationSummary(..., i18n.t)` et al). A bare
 * reference loses `this`, so the first `this.lang` read inside `t` threw
 * "Cannot read properties of undefined (reading 'lang')", and in LorebooksView
 * that throw happened inside a mount-time $derived, so the whole shelf branch
 * never mounted: the Library's 世界书 tab switched while the content stayed on the
 * old shelf. `t` is now an arrow field (bound at construction), and this test
 * keeps it that way: any regression back to a method re-breaks every bare call
 * site at once, here first.
 */
describe('i18n.t survives bare-callback passing (EN-19 root cause)', () => {
	test('a bare reference to t keeps this and translates', () => {
		const t = i18n.t; // exactly what activationSummary / lorebookDeleteMessage receive
		// The pre-fix failure mode was a throw (this lost, `this.lang` unreadable), so the
		// pin is: no throw, and the key resolves to real copy in WHATEVER language the
		// shared-process store currently holds (another suite may have switched it).
		let out: string | undefined;
		expect(() => {
			out = t('lv.tabLorebooks');
		}).not.toThrow();
		expect(out).toBeTruthy();
		expect(out).not.toBe('lv.tabLorebooks');
	});
});

import { i18n } from './i18n.svelte';
