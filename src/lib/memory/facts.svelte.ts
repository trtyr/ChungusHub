/**
 * The fact store (P006): per-chat rows cached for synchronous prompt assembly, since both
 * the meter and the send must read the same board without the meter awaiting an RPC on
 * every keystroke. Reads ride the memListFacts RPC; writes belong to the extraction
 * pipeline (W3) and the panel (W4), which invalidate through {@link invalidate}.
 */

import { db } from '$lib/services/database';
import { activeFacts, type ChatFact } from './facts';
import { renderFactBlock } from './factBlock';
import type { MemoryMessage } from './types';

class FactsStore {
	#byChat = $state.raw<Record<string, ChatFact[]>>({});

	private async loadOne(chatId: string): Promise<void> {
		const rows = (await db.memListFacts(chatId)) as unknown as Array<Record<string, unknown>>;
		const facts: ChatFact[] = rows.map((r) => ({
			id: String(r.id),
			entity: String(r.entity),
			key: String(r.key),
			value: String(r.value),
			importance: typeof r.importance === 'number' ? r.importance : 2,
			sourceIds: Array.isArray(r.sourceIds) ? (r.sourceIds as string[]) : [],
			createdAt: typeof r.createdAt === 'number' ? r.createdAt : undefined,
			revisedAt: typeof r.revisedAt === 'number' ? r.revisedAt : undefined
		}));
		this.#byChat = { ...this.#byChat, [chatId]: facts };
	}

	/** Load a chat's facts once; later callers get the cache. */
	async ensure(chatId: string): Promise<void> {
		if (!chatId || chatId in this.#byChat) return;
		await this.loadOne(chatId);
	}

	/** Drop and re-read a chat's rows (after extraction or a panel edit). */
	async invalidate(chatId: string): Promise<void> {
		if (!chatId) return;
		await this.loadOne(chatId);
	}

	factsOf(chatId: string): ChatFact[] {
		return this.#byChat[chatId] ?? [];
	}

	/** The tail board for one active path, or '' when nothing stands. Synchronous by
	 *  design: the meter reads the same cache the send assembles from. Only ids matter
	 *  for the derivation, so any id-bearing message slice works. */
	blockFor(chatId: string, path: ReadonlyArray<{ id: string }>): string {
		const facts = this.#byChat[chatId];
		if (!facts?.length) return '';
		return renderFactBlock(activeFacts(facts, path as MemoryMessage[]));
	}
}

export const factsStore = new FactsStore();
