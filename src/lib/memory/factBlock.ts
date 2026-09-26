/**
 * Render the effective fact set as the compact entity-grouped board that rides in the
 * prompt's tail (P006 W2). Pure string work: same facts in, same bytes out — the tail is
 * only cache-safe while it is deterministic.
 */

import { groupByEntity, type ChatFact } from './facts';

/** One line per entity, `key=value` pairs joined by `；`. The renderer sorts, so callers
 *  cannot break determinism by handing rows in a different order. */
export function renderFactBlock(active: ChatFact[]): string {
	if (active.length === 0) return '';
	const sorted = [...active].sort((a, b) => {
		if (a.entity !== b.entity) return a.entity < b.entity ? -1 : 1;
		if (a.key !== b.key) return a.key < b.key ? -1 : 1;
		return a.id < b.id ? -1 : 1;
	});
	const groups = groupByEntity(sorted);
	const lines: string[] = ['[当前事实]'];
	for (const [entity, facts] of groups) {
		lines.push(`${entity}：${facts.map((f) => `${f.key}=${f.value}`).join('；')}`);
	}
	return lines.join('\n');
}
