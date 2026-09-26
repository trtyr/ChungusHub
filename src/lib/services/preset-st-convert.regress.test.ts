import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { convertSillyTavernPreset } from './preset-st-convert';

/**
 * Real-preset regression: converts the operator's own SillyTavern presets and pins the
 * counts the conversion must reproduce. These files stay OUT of the repository on
 * purpose (preset authors forbid redistribution), so the suite skips when they are not
 * on disk and runs wherever they are: the operator's machine, which is where it
 * matters. A failure here means the converter drifted from what ST presets really look
 * like, not from a synthetic fixture.
 */
const REAL_PRESETS = [
	'/Users/trtyr/Downloads/Izumi 0923.json',
	'/Users/trtyr/Downloads/[主预设] V19.5 狐神抚 · 毓忻.json',
	'/Users/trtyr/Downloads/夏瑾 天琴座 V2 Beta 1.0.json'
];

const present = REAL_PRESETS.filter((path) => existsSync(path));

describe.skipIf(present.length === 0)('real SillyTavern presets convert end to end', () => {
	test('every present preset converts with items, enabled flags and carried rules', async () => {
		for (const path of present) {
			const raw = (await Bun.file(path).json()) as Record<string, unknown>;
			const name = path.split('/').pop()!;
			const converted = await convertSillyTavernPreset(raw, name);

			const pool = (raw.prompts as unknown[]).length;
			expect(converted.items.length, `${name}: one item per prompt`).toBe(pool);
			expect(converted.items.some((item) => item.enabled), `${name}: the checklist's enabled flags carry`).toBe(true);
			expect(converted.items.some((item) => !item.enabled) || pool === converted.items.filter((i) => i.enabled).length,
				`${name}: unlisted or switched-off prompts import disabled`).toBe(true);

			// History rides the chatHistory marker, translated to the engine macro.
			const history = converted.items.find((item) => item.content === '{{chatHistory}}');
			expect(history, `${name}: the chatHistory marker became the engine macro`).toBeTruthy();

			// Only comment macros are stripped now; variables and randomization travel.
			const stripped = (converted.conversionNotes ?? []).find((note) => note.includes('剥除'));
			if (stripped) expect(stripped, `${name}: only comments are stripped`).toContain('comment');

			// The notes never claim a variable-macro loss again.
			expect(
				(converted.conversionNotes ?? []).some((note) => note.includes('getvar') || note.includes('setvar')),
				`${name}: variables are supported, so no macro-stripping note`
			).toBe(false);
		}
	});

	test('the recorded baselines still hold on this machine', async () => {
		const baselines: Array<[string, number, number, number, number]> = [
			// [file, items, enabled, carried rules, auto-generated controls]
			// P002 re-recording 2026-09-27: enabled dropped by the pure-switch items the
			// auto-control pass now disables (their only content was grouped setvar writes).
			['Izumi 0923.json', 228, 45, 30, 68],
			['[主预设] V19.5 狐神抚 · 毓忻.json', 220, 49, 38, 43],
			['夏瑾 天琴座 V2 Beta 1.0.json', 144, 30, 11, 1]
		];
		for (const [fileName, items, enabled, rules, controls] of baselines) {
			const path = REAL_PRESETS.find((candidate) => candidate.endsWith(fileName));
			if (!path || !existsSync(path)) continue;
			const raw = (await Bun.file(path).json()) as Record<string, unknown>;
			const converted = await convertSillyTavernPreset(raw, fileName);
			expect(converted.items.length, `${fileName}: item count`).toBe(items);
			expect(converted.items.filter((item) => item.enabled).length, `${fileName}: enabled count`).toBe(enabled);
			expect(converted.regexRules?.length ?? 0, `${fileName}: carried rule count`).toBe(rules);
			expect(converted.controls.length, `${fileName}: auto control count`).toBe(controls);
		}
	});
});
