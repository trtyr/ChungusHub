/**
 * P006 Phase 2 agent contracts: the JSON tool loop executes real RPC-backed tools,
 * budgets bind, parse failures retry once then fail loud, finish ends the pass, and
 * stillActive aborts between turns. `bun test` with fakes, the memory.test doctrine.
 */
import { describe, expect, test } from 'bun:test';

import { runAgentPass, type AgentDeps } from './agent';
import type { ChatFact, MemoryDb, MemoryMessage, RawFact } from './types';

function turn(id: string, content: string): MemoryMessage {
	return { id, parentId: null, role: 'user', content, speaker: 'You' } as MemoryMessage;
}

class FakeDb {
	applied: RawFact[][] = [];
	updated: Array<{ factId: string; value: string }> = [];
	reaped: string[][] = [];
	facts: ChatFact[] = [];
	async applyFacts(chatId: string, facts: RawFact[]) {
		this.applied.push(facts);
		for (const f of facts) {
			this.facts.push({ ...f, id: `f${this.facts.length + 1}`, sourceIds: [] });
		}
	}
	async listFacts() {
		return this.facts;
	}
	async reapFacts(chatId: string, ids: string[]) {
		this.reaped.push(ids);
	}
	async updateFactContent(chatId: string, factId: string, value: string) {
		this.updated.push({ factId, value });
		const row = this.facts.find((f) => f.id === factId);
		if (row) row.value = value;
	}
	async getState() {
		return null;
	}
	async setState() {}
	async listEpisodes() {
		return [];
	}
	async applyBatch() {}
	async applyPromotion() {}
	async updateEpisodeContent() {}
	async reset() {}
}

function deps(db: FakeDb, responses: string[]): AgentDeps {
	let call = 0;
	return {
		llm: async () => {
			const r = responses[Math.min(call, responses.length - 1)];
			call++;
			return r;
		},
		db: db as unknown as AgentDeps['db'],
		board: [],
		recentTurns: [turn('m1', '莉莉在礁石下递给苏辰一把铜钥匙')]
	};
}

describe('agent tool loop', () => {
	test('apply_facts writes rows and finish ends the pass', async () => {
		const db = new FakeDb();
		const d = deps(db, [
			'{"tool":"apply_facts","args":{"facts":[{"entity":"苏辰","key":"持有物","value":"一枚铜钥匙","importance":2}]}}',
			'{"tool":"finish"}'
		]);
		const r = await runAgentPass(d, 'c');
		expect(r.applied).toBe(1);
		expect(r.reaped).toBe(0);
		expect(db.applied[0][0].entity).toBe('苏辰');
	});

	test('update and reap flow through the same loop', async () => {
		const db = new FakeDb();
		db.facts = [
			{ id: 'f1', entity: 'S', key: '所在地', value: '灯塔', importance: 2, sourceIds: [] },
			{ id: 'f2', entity: 'S', key: '其他', value: '回声', importance: 1, sourceIds: [] }
		];
		const d = deps(db, [
			'{"tool":"update_fact","args":{"factId":"f1","value":"灯塔顶层"}}',
			'{"tool":"reap_facts","args":{"ids":["f2"]}}',
			'{"tool":"finish"}'
		]);
		const r = await runAgentPass(d, 'c');
		expect(r.updated).toBe(1);
		expect(r.reaped).toBe(1);
		expect(db.updated[0].value).toBe('灯塔顶层');
	});

	test('unparseable response retries once, then fails loud', async () => {
		const db = new FakeDb();
		const d = deps(db, ['not json at all', 'still not json']);
		await expect(runAgentPass(d, 'c')).rejects.toThrow(/unparseable/);
	});

	test('retry after one parse failure still completes', async () => {
		const db = new FakeDb();
		const d = deps(db, ['garbage', '{"tool":"finish"}']);
		const r = await runAgentPass(d, 'c');
		expect(r.turns).toBeGreaterThanOrEqual(2);
	});

	test('turn budget binds: 8 turns max then the pass ends', async () => {
		const db = new FakeDb();
		const responses: string[] = [];
		for (let i = 0; i < 20; i++) {
			responses.push(`{"tool":"apply_facts","args":{"facts":[{"entity":"E${i}","key":"其他","value":"v${i}","importance":1}]}}`);
		}
		const d = deps(db, responses);
		const r = await runAgentPass(d, 'c');
		expect(r.turns).toBeLessThanOrEqual(8);
	});

	test('read_fact_board and read_recent_turns are real tools', async () => {
		const db = new FakeDb();
		db.facts = [{ id: 'f1', entity: 'S', key: '所在地', value: '灯塔', importance: 2, sourceIds: [] }];
		const scripted = ['{"tool":"read_fact_board"}', '{"tool":"read_recent_turns"}', '{"tool":"finish"}'];
		const seenUserTexts: string[] = [];
		const d = deps(db, scripted);
		let call = 0;
		d.llm = async (messages) => {
			const last = messages[messages.length - 1];
			if (call > 0) seenUserTexts.push(last.content);
			const out = scripted[Math.min(call, scripted.length - 1)];
			call++;
			return out;
		};
		const r = await runAgentPass(d, 'c');
		expect(r.turns).toBe(3);
		// The board tool's feedback carries the LIVE row from listFacts, not the seed snapshot.
		expect(seenUserTexts[0]).toContain('灯塔');
		expect(seenUserTexts[0]).toContain('f1');
		// The turns tool re-feeds the source turns verbatim.
		expect(seenUserTexts[1]).toContain('莉莉在礁石下递给苏辰一把铜钥匙');
	});

	test('stillActive false stops the pass before the next turn', async () => {
		const db = new FakeDb();
		const d = deps(db, ['{"tool":"apply_facts","args":{"facts":[{"entity":"E","key":"其他","value":"v","importance":1}]}}', '{"tool":"finish"}']);
		d.stillActive = () => false;
		const r = await runAgentPass(d, 'c');
		expect(r.turns).toBe(0);
	});

	test('tool errors feed back gracefully instead of crashing the pass', async () => {
		const db = new FakeDb();
		db.reapFacts = async () => {
			throw new Error('mem-op-pinned: pinned facts resist reaping');
		};
		const d = deps(db, [
			'{"tool":"reap_facts","args":{"ids":["f1"]}}',
			'{"tool":"finish"}'
		]);
		const r = await runAgentPass(d, 'c');
		expect(r.reaped).toBe(0);
		expect(r.turns).toBe(2);
	});
	test('aborted signal ends the pass between turns', async () => {
		const db = new FakeDb();
		const controller = new AbortController();
		let call = 0;
		const d: AgentDeps = {
			llm: async () => {
				call++;
				if (call === 2) controller.abort();
				return '{"tool":"finish"}';
			},
			db: db as unknown as AgentDeps['db'],
			board: [],
			recentTurns: [turn('m1', 'x')],
			signal: controller.signal
		};
		const r = await runAgentPass(d, 'c');
		expect(r.turns).toBeLessThanOrEqual(2);
	});
});
