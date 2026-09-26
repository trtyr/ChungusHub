/**
 * ST-style variable tables: chat-scoped locals and app-scoped globals, backed by two
 * settings rows (the same spine presetControlValuesByPreset rides). The GENERATION path
 * takes a live env reference from here: assembly mutates it in item order and the
 * mutated tables are flushed back right after — while meters build throwaway clones so
 * pricing a prompt can never change the variables it prices.
 */
import { db } from '$lib/services/database';
import { registerSettingsReload } from '$lib/services/syncedSetting';
import type { VarEnv } from '$lib/macros';

const CHAT_VARS_KEY = 'chatVarsByChat';
const GLOBAL_VARS_KEY = 'globalVars';

type VarsByChat = Record<string, Record<string, string>>;

class VarsStore {
	byChat: Record<string, Record<string, string>> = $state({});
	globalVars: Record<string, string> = $state({});

	async load(): Promise<void> {
		this.byChat = (await readVars(CHAT_VARS_KEY)) as Record<string, Record<string, string>>;
		this.globalVars = (await readVars(GLOBAL_VARS_KEY)) as Record<string, string>;
	}

	/** Sync overwrites another device's rows wholesale; the reactive tables re-read. */
	syncReload = async (): Promise<void> => {
		await this.load();
	};

	/** The LIVE tables for one chat: assembly mutates these in place. */
	envFor(chatId: string): VarEnv {
		return {
			locals: (this.byChat[chatId] ??= {}),
			globals: this.globalVars
		};
	}

	/** A detached copy for meters and previews: expansion can never persist. */
	cloneFor(chatId: string): VarEnv {
		return {
			locals: { ...(this.byChat[chatId] ?? {}) },
			globals: { ...this.globalVars }
		};
	}

	/** Persist one chat's locals (replacing its bucket) and the globals, once. */
	async flush(chatId: string, locals: Record<string, string>): Promise<void> {
		if (Object.keys(locals).length > 0) this.byChat[chatId] = locals;
		await Promise.all([
			db.setSetting(CHAT_VARS_KEY, JSON.stringify(this.byChat)),
			db.setSetting(GLOBAL_VARS_KEY, JSON.stringify(this.globalVars))
		]);
	}
}

async function readVars(key: string): Promise<Record<string, unknown>> {
	const raw = await db.getSetting(key);
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

export const varsStore = new VarsStore();
registerSettingsReload(() => varsStore.syncReload());
