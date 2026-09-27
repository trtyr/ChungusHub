/**
 * Adapts the app's RPC database to the engine's MemoryDb port.
 *
 * This is the only file in the memory module that touches `$lib`, which keeps the rest of
 * the engine pure and unit-testable. The server owns the SQL and the atomic transactions;
 * this just forwards calls.
 */

import { db } from '$lib/services/database';
import type { ChatFact, MemoryDb, RawFact } from './types';

export function createMemoryDb(): MemoryDb {
	return {
		getState: (chatId) => db.memGetState(chatId),
		setState: (chatId, patch) => db.memSetState(chatId, patch),
		listEpisodes: (chatId) => db.memListEpisodes(chatId),
		applyBatch: (chatId, result) => db.memApplyBatch(chatId, result),
		applyPromotion: (chatId, result) => db.memApplyPromotion(chatId, result),
		reapEpisodes: (chatId, episodeIds) => db.memReapEpisodes(chatId, episodeIds),
		updateEpisodeContent: (chatId, episodeId, content) => db.memUpdateEpisodeContent(chatId, episodeId, content),
		applyFacts: (chatId, facts: RawFact[], sourceIds) =>
			db.memApplyFacts(
				chatId,
				facts.map((f) => ({ ...f, sourceIds }))
			),
		listFacts: (chatId) => db.memListFacts(chatId) as Promise<ChatFact[]>,
		reapFacts: (chatId, factIds) => db.memReapFacts(chatId, factIds),
		updateFactContent: (chatId, factId, value) => db.memUpdateFactContent(chatId, factId, value),
		reset: (chatId) => db.memReset(chatId)
	};
}
