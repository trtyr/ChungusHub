/**
 * Lightweight i18n: two flat dictionaries + one runes store.
 *
 * Deliberately dependency-free to match the app's four-dependency budget. The
 * language rides the server settings spine (`i18nSettings` key) so a phone and
 * a desktop agree on it, like every other synced preference. `load()` fires
 * once at module import; until it resolves the store answers with the default
 * (zh), so first paint is Chinese and a stored `en` swaps in a beat later.
 *
 * Fallback order when a key is missing: current dictionary → en → the key
 * itself, which keeps an untranslated row readable during the migration and
 * immediately visible to a `grep '\$lib\/i18n'`-style audit.
 */
import { readSetting, writeSetting, registerSettingsReload } from '$lib/services/syncedSetting';
import { zh } from './zh';
import { en } from './en';

export type Lang = 'zh' | 'en';

const DICTS: Record<Lang, Record<string, string>> = { zh, en };

class I18nStore {
	/** Active UI language. Defaults to zh before the stored setting resolves. */
	lang = $state<Lang>('zh');

	/** Look up a user-visible string in the active language, {param}-interpolated.
	 *
	 * Arrow FIELD, not a method, and that is load-bearing: seven call sites hand
	 * `i18n.t` to formatters as a bare callback (activationSummary,
	 * lorebookDeleteMessage, describeMemoryImpact, parsePromptJson,
	 * formatMonthYear), and a method's `this` dies at the call site. Before the
	 * arrow, the first `this.lang` read inside those formatters threw
	 * "Cannot read properties of undefined (reading 'lang')"; in LorebooksView
	 * it fired inside a mount-time $derived and the whole 世界书 shelf branch
	 * never mounted (EN-19). Pinned by i18n.bare-ref.test.ts. */
	t = (key: string, params?: Record<string, string | number>): string => {
		let text = DICTS[this.lang][key] ?? DICTS.en[key] ?? key;
		if (params) {
			for (const [name, value] of Object.entries(params)) {
				text = text.replaceAll(`{${name}}`, String(value));
			}
		}
		return text;
	};

	/** Switch the UI language and persist across devices via the settings spine. */
	async setLang(lang: Lang): Promise<void> {
		this.lang = lang;
		await writeSetting('i18nSettings', { lang });
	}

	/** Re-read the stored language. Registered on the settings spine so another
	 *  device's switch lands here without a reload. */
	async reload(): Promise<void> {
		const stored = await readSetting<{ lang?: Lang }>('i18nSettings', {});
		if (stored.lang && DICTS[stored.lang]) this.lang = stored.lang;
	}
}

export const i18n = new I18nStore();

// Fire-and-forget boot: stored preference lands whenever it lands, and the
// reactive lang swaps any rendered strings. Module-scope registration = the
// boot-time store pattern, so another device's switch lands here via the
// `settings` broadcast without a reload.
// Boot errors (db not ready under tests, offline) leave the zh default standing.
void i18n.reload().catch(() => {});
registerSettingsReload(() => i18n.reload());
