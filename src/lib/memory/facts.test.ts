/**
 * P006 W1 contracts for the fact layer's pure core, seed-data driven: revert deactivates,
 * returning reactivates, deepest same-key wins, branch isolation, reaping. `bun test`.
 */
import { describe, expect, test } from 'bun:test';

import { activeFacts, groupByEntity, reapCandidateFacts, type ChatFact } from './facts';
import type { MemoryMessage } from './types';

/** A linear story m1 → m2 → … → m9. */
function linearStory(n = 9): MemoryMessage[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `m${i + 1}`,
		parentId: i === 0 ? null : `m${i}`,
		role: i % 2 === 0 ? 'assistant' : 'user',
		content: `turn ${i + 1}`,
		speaker: i % 2 === 0 ? 'Seraphina' : 'You'
	})) as MemoryMessage[];
}

function pathTo(story: MemoryMessage[], depth: number): MemoryMessage[] {
	return story.slice(0, depth);
}

function fact(partial: Pick<ChatFact, 'id' | 'entity' | 'key' | 'value'> & Partial<ChatFact>): ChatFact {
	return { importance: 2, sourceIds: [], ...partial };
}

describe('activeFacts (path derivation)', () => {
	test('revert deactivates a fact anchored past the fold-back point', () => {
		const story = linearStory();
		const injured = fact({ id: 'f1', entity: 'Seraphina', key: '身体', value: '断了左手', sourceIds: ['m6', 'm7'] });
		expect(activeFacts([injured], pathTo(story, 9)).map((f) => f.id)).toEqual(['f1']);
		// Roll the chat back to turn 5: the left hand is whole again.
		expect(activeFacts([injured], pathTo(story, 5))).toEqual([]);
	});

	test('returning reactivates without any write', () => {
		const story = linearStory();
		const injured = fact({ id: 'f1', entity: 'Seraphina', key: '身体', value: '断了左手', sourceIds: ['m6', 'm7'] });
		const tree = [...story];
		expect(activeFacts([injured], pathTo(tree, 5))).toEqual([]);
		// Walk forward again: the fact stands once more, same row, zero writes.
		expect(activeFacts([injured], pathTo(tree, 9)).map((f) => f.value)).toEqual(['断了左手']);
	});

	test('deepest same-key revision wins; revert resurfaces the older value', () => {
		const story = linearStory();
		const v1 = fact({ id: 'v1', entity: 'Seraphina', key: '文风', value: '仙侠腔', sourceIds: ['m2'] });
		const v2 = fact({ id: 'v2', entity: 'Seraphina', key: '文风', value: '生活流', sourceIds: ['m6'] });
		// Both stand on the full path: the deeper one is the truth.
		expect(activeFacts([v1, v2], pathTo(story, 9)).map((f) => f.value)).toEqual(['生活流']);
		// Revert past m6: v1 is the deepest SURVIVOR, so the old voice comes back.
		expect(activeFacts([v1, v2], pathTo(story, 4)).map((f) => f.value)).toEqual(['仙侠腔']);
	});

	test('branch isolation: a fact from the other branch does not stand here', () => {
		const story = linearStory();
		// Branch B: m5 forks to b5 (say, the story where nobody lost an arm).
		const b5: MemoryMessage = { ...story[4], id: 'b5', parentId: 'm4' };
		const armB = fact({ id: 'fb', entity: 'Seraphina', key: '身体', value: '双手完好', sourceIds: ['b5'] });
		// On the A path (no b5), the branch-B fact cannot stand.
		expect(activeFacts([armB], pathTo(story, 9))).toEqual([]);
		// On the B path it stands.
		expect(activeFacts([armB], [...pathTo(story, 4), b5]).map((f) => f.value)).toEqual(['双手完好']);
	});

	test('unanchored (hand-entered) facts stand on every path', () => {
		const story = linearStory();
		const hand = fact({ id: 'h1', entity: 'Seraphina', key: '持有物', value: '一枚铜钥匙', sourceIds: [] });
		expect(activeFacts([hand], pathTo(story, 3)).map((f) => f.id)).toEqual(['h1']);
		expect(activeFacts([hand], pathTo(story, 9)).map((f) => f.id)).toEqual(['h1']);
	});

	test('different keys and entities coexist; grouping is by entity', () => {
		const story = linearStory();
		const facts = [
			fact({ id: 'a', entity: 'Seraphina', key: '所在地', value: '灯塔', sourceIds: ['m3'] }),
			fact({ id: 'b', entity: 'Seraphina', key: '持有物', value: '提灯', sourceIds: ['m5'] }),
			fact({ id: 'c', entity: '世界', key: '地点状态', value: '暴风雨', sourceIds: ['m5'] })
		];
		const active = activeFacts(facts, pathTo(story, 9));
		expect(active.length).toBe(3);
		const groups = groupByEntity(active);
		expect(groups.get('Seraphina')?.length).toBe(2);
		expect(groups.get('世界')?.length).toBe(1);
	});

	test('empty path yields nothing standing except unanchored facts', () => {
		const story = linearStory();
		const anchored = fact({ id: 'a', entity: 'Seraphina', key: '身体', value: 'x', sourceIds: ['m1'] });
		const hand = fact({ id: 'h', entity: 'Seraphina', key: '持有物', value: 'y', sourceIds: [] });
		expect(activeFacts([anchored], [])).toEqual([]);
		expect(activeFacts([hand], []).map((f) => f.id)).toEqual(['h']);
	});
});

describe('reapCandidateFacts', () => {
	test('a fact whose anchor turn is gone is a reap candidate; anchored-and-live is not', () => {
		const story = linearStory();
		const live = fact({ id: 'live', entity: 'S', key: '所在地', value: '灯塔', sourceIds: ['m3'] });
		const dead = fact({ id: 'dead', entity: 'S', key: '持有物', value: '提灯', sourceIds: ['m5'] });
		const liveIds = story.filter((m) => m.id !== 'm5').map((m) => m.id);
		expect(reapCandidateFacts([live, dead], liveIds).map((f) => f.id)).toEqual(['dead']);
	});

	test('unanchored facts are never reaped by turn deletion', () => {
		const hand = fact({ id: 'h', entity: 'S', key: '其他', value: 'x', sourceIds: [] });
		expect(reapCandidateFacts([hand], [])).toEqual([]);
	});
});
