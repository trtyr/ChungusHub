/**
 * P006 W3 contracts: the extraction call carries the fact appendix and ONE response
 * serves both the episode and the fact rows; malformed fact rows are dropped engine-side
 * (no placeholder can land); a looped episode retries and only the good response's facts
 * apply; facts commit only when their batch commits. `bun test` with in-memory fakes,
 * the same doctrine as memory.test.ts.
 */
import { describe, expect, test } from 'bun:test';

import { processChat, type EngineDeps } from './engine';
import { FACTS_APPENDIX, parseFacts } from './prompts';
import type { BatchResult, MemoryDb, MemoryMessage, PromotionResult, RawFact } from './types';

// ===== fakes =====

const TEMPLATE =
	'Summarize. {{batch}} {{deepMemory}} {{recentEpisodes}} {{sceneLength}} {{character}} {{persona}}';

class FakeDb implements Pick<MemoryDb, 'getState' | 'listEpisodes' | 'applyBatch' | 'applyPromotion' | 'applyFacts' | 'listFacts' | 'reapFacts' | 'reapEpisodes' | 'updateEpisodeContent' | 'reset'> {
	appliedBatches: BatchResult[] = [];
	appliedFacts: Array<{ chatId: string; rows: Array<Record<string, unknown>> }> = [];
	async getState() {
		// A tight tail and a small batch: 8 turns must leave an extractable span.
		return { chatId: 'c', enabled: true, autoExtract: true, config: { verbatimTail: 2, batchSize: 4 } };
	}
	async setState() {}
	async listEpisodes() {
		// Accumulate what applied, or the coverage cursor never moves and the engine
		// treats every batch as stillborn (facts ride behind that gate on purpose).
		return this.appliedBatches.map((b, i) => ({
			id: `ep${i}`,
			chatId: 'c',
			layer: 0,
			content: b.episode.content,
			sourceMessageIds: b.episode.sourceMessageIds,
			anchorMessageId: b.episode.anchorMessageId,
			createdAt: i
		}));
	}
	async applyBatch(chatId: string, result: BatchResult) {
		this.appliedBatches.push(result);
	}
	async applyPromotion(chatId: string, result: PromotionResult) {}
	async applyFacts(chatId: string, facts: RawFact[], sourceIds: string[]) {
		this.appliedFacts.push({ chatId, rows: facts.map((f) => ({ ...f, sourceIds })) });
	}
	reapedFactIds: string[] = [];
	async listFacts() {
		return this.appliedFacts.flatMap((a) => a.rows) as never;
	}
	async reapFacts(chatId: string, factIds: string[]) {
		this.reapedFactIds.push(...factIds);
	}
	async reapEpisodes() {}
	async updateEpisodeContent() {}
	async reset() {}
}

function story(n: number, batchOf: number): MemoryMessage[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `m${i + 1}`,
		parentId: i === 0 ? null : `m${i}`,
		role: i % 2 === 0 ? 'assistant' : 'user',
		content: `turn ${i + 1}`,
		speaker: 'S'
	})) as MemoryMessage[];
}

/** One good dual-output response. Facts ride the same JSON as the episode. */
function dualResponse(episode: string, facts: unknown[]): string {
	return JSON.stringify({ episode, facts });
}

function makeDeps(db: FakeDb, responses: string[]): EngineDeps {
	let call = 0;
	return {
		db,
		llm: async () => {
			const raw = responses[Math.min(call, responses.length - 1)];
			call++;
			return raw;
		},
		templates: { extract: TEMPLATE, promote: 'merge {{episodes}}' } as EngineDeps['templates']
	};
}

// ===== contracts =====

describe('P006 W3 extraction pipeline', () => {
	test('one call yields episode AND facts, facts anchored to the batch turns', async () => {
		const db = new FakeDb();
		const deps = makeDeps(db, [
			dualResponse('A clean scene summary.', [
				{ entity: 'Seraphina', key: '身体', value: '断了左手', importance: 3 },
				{ entity: '世界', key: '地点状态', value: '灯塔外暴风雨', importance: 2 }
			])
		]);
		const msgs = story(8, 8);
		await processChat(deps, 'c', msgs, 'm8');
		expect(db.appliedBatches.length).toBeGreaterThan(0);
		expect(db.appliedFacts.length).toBe(1);
		const rows = db.appliedFacts[0].rows;
		expect(rows.length).toBe(2);
		expect(rows[0].entity).toBe('Seraphina');
		// anchored to the extracted batch's own turn ids
		const ids = rows[0].sourceIds as string[];
		expect(ids.length).toBeGreaterThan(0);
		expect(ids.every((id) => msgs.some((m) => m.id === id))).toBe(true);
	});

	test('malformed and macro-bearing rows are dropped engine-side; good rows survive', async () => {
		const facts = parseFacts(
			JSON.stringify({
				episode: 'x',
				facts: [
					{ entity: 'S', key: '身体', value: '好的', importance: 2 },
					{ entity: '', key: '身体', value: 'no entity' },
					{ entity: 'S', key: '', value: 'no key' },
					{ entity: 'S', key: '持有物', value: '' },
					{ entity: 'S', key: '持有物', value: 'says {{user}} aloud' },
					'not an object',
					{ entity: 'S', key: '所在地', value: '灯塔', importance: 99 }
				]
			})
		);
		expect(facts.length).toBe(2);
		expect(facts[0]).toEqual({ entity: 'S', key: '身体', value: '好的', importance: 2 });
		expect(facts[1].importance).toBe(3);
	});

	test('looped episode retries; only the good response\'s facts apply', async () => {
		const db = new FakeDb();
		const loop = 'the same words ' + 'repeat repeat repeat repeat '.repeat(20);
		const deps = makeDeps(db, [
			dualResponse(loop, [{ entity: 'Bad', key: '其他', value: 'from the looped call', importance: 1 }]),
			dualResponse('A clean retry summary.', [{ entity: 'Good', key: '目标', value: '找到钥匙', importance: 2 }])
		]);
		const msgs = story(8, 8);
		await processChat(deps, 'c', msgs, 'm8');
		expect(db.appliedBatches.length).toBeGreaterThan(0);
		// exactly one facts application, from the SECOND response
		expect(db.appliedFacts.length).toBe(1);
		expect(db.appliedFacts[0].rows[0].entity).toBe('Good');
	});

	test('the appendix rides the extraction call, not the stored template', async () => {
		const db = new FakeDb();
		let seen = '';
		const deps = makeDeps(db, [dualResponse('summary.', [])]);
		deps.llm = async (messages) => {
			seen = messages[0].content;
			return dualResponse('summary.', []);
		};
		await processChat(deps, 'c', story(8, 8), 'm8');
		expect(deps.templates.extract.includes('facts')).toBe(false);
		expect(seen.includes('"facts"')).toBe(true);
		// The stored template is what got rendered (batch turns substituted in), with the
		// appendix appended after it.
		expect(seen.includes('turn 1')).toBe(true);
		expect(seen.includes(FACTS_APPENDIX)).toBe(true);
	});

	test('agent mode replaces the fact pass: no appendix on the extraction call', async () => {
		const db = new FakeDb();
		let seen = '';
		const deps = makeDeps(db, [dualResponse('summary.', [])]);
		deps.llm = async (messages) => {
			seen = messages[0].content;
			return dualResponse('summary.', []);
		};
		await processChat(deps, 'c', story(8, 8), 'm8', { factsViaAgent: true });
		expect(seen.includes(FACTS_APPENDIX)).toBe(false);
		// The episode work is untouched: the summary template still renders fully.
		expect(seen.includes('turn 1')).toBe(true);
	});
});

describe('parseFacts hygiene', () => {
	test('absent, non-array and unparseable responses yield no rows', () => {
		expect(parseFacts('{"episode":"only"}')).toEqual([]);
		expect(parseFacts('{"facts":"nope"}')).toEqual([]);
		expect(parseFacts('total nonsense')).toEqual([]);
	});

	test('cap at twenty keeps a runaway response bounded', () => {
		const many = Array.from({ length: 50 }, (_, i) => ({
			entity: `E${i}`,
			key: '其他',
			value: `v${i}`,
			importance: 1
		}));
		expect(parseFacts(JSON.stringify({ episode: 'x', facts: many })).length).toBe(20);
	});
});
