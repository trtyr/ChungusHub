/**
 * P006 W2: the fact board renders deterministically (same facts in, same bytes out) and
 * groups by entity with key=value rows. `bun test`.
 */
import { describe, expect, test } from 'bun:test';

import { renderFactBlock } from './factBlock';
import type { ChatFact } from './facts';

function fact(partial: Pick<ChatFact, 'id' | 'entity' | 'key' | 'value'>): ChatFact {
	return { importance: 2, sourceIds: [], ...partial };
}

describe('renderFactBlock', () => {
	test('empty set renders empty', () => {
		expect(renderFactBlock([])).toBe('');
	});

	test('entity-grouped key=value rows, deterministic order', () => {
		const facts = [
			fact({ id: 'b', entity: 'Seraphina', key: '持有物', value: '提灯' }),
			fact({ id: 'a', entity: 'Seraphina', key: '身体', value: '断了左手' }),
			fact({ id: 'c', entity: '世界', key: '地点状态', value: '暴风雨' })
		];
		const out = renderFactBlock(facts);
		const expected = [
			'[当前事实]',
			'Seraphina：持有物=提灯；身体=断了左手',
			'世界：地点状态=暴风雨'
		].join('\n');
		expect(out).toBe(expected);
		expect(renderFactBlock([...facts].reverse())).toBe(expected);
	});
});
