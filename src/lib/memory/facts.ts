/**
 * The fact layer's pure core (P006). A fact is one asserted attribute of one entity,
 * anchored to the message ids it was extracted from. Which facts STAND on a given branch
 * is derived here at query time, never stored: a fact is active when its whole anchor is
 * on the active path, and among the survivors of one (entity, key) the deepest anchor
 * wins. That one rule is what makes reverts deactivate, branch switches isolate, and
 * same-key revisions supersede, with zero write-side conflict machinery.
 *
 * Everything here is pure and works off plain message slices (the same MemoryMessage
 * shape the episode core uses), so it is unit-testable with no app dependencies.
 */

import type { MemoryMessage } from './types';

export interface ChatFact {
	id: string;
	entity: string;
	key: string;
	value: string;
	/** 1 = trivia, 2 = a state change, 3 = mainline. Drives injection truncation later. */
	importance: number;
	/** The message ids this fact was extracted from. Empty means unanchored (a reader's
	 *  hand entry), which stands on every path until revised. */
	sourceIds: string[];
	createdAt?: number;
	revisedAt?: number;
}

/** The path's ids in walk order, for depth comparisons. */
function pathIdsInOrder(path: MemoryMessage[]): string[] {
	return path.map((m) => m.id);
}

/** A fact stands on the path when every anchor is on it. An unanchored fact (no source
 *  ids, e.g. a hand entry from the panel) stands everywhere. */
function standsOnPath(fact: ChatFact, pathIdSet: Set<string>): boolean {
	if (fact.sourceIds.length === 0) return true;
	return fact.sourceIds.every((id) => pathIdSet.has(id));
}

/** Depth of a fact on the path = the LATEST anchor's position. Deeper means the fact was
 *  asserted later in the story as currently told. */
function depthOf(fact: ChatFact, order: Map<string, number>): number {
	let depth = -1;
	for (const id of fact.sourceIds) {
		const at = order.get(id);
		if (at !== undefined && at > depth) depth = at;
	}
	return depth;
}

/**
 * The effective fact set for one active path: every standing fact, and per
 * (entity, key) only the deepest-standing one. Revert past a revision and the older
 * value resurfaces; switch branches and only that branch's facts remain.
 */
export function activeFacts(allFacts: ChatFact[], path: MemoryMessage[]): ChatFact[] {
	const order = new Map(pathIdsInOrder(path).map((id, index) => [id, index]));
	const pathIdSet = new Set(order.keys());
	const winners = new Map<string, { fact: ChatFact; depth: number }>();
	for (const fact of allFacts) {
		if (!standsOnPath(fact, pathIdSet)) continue;
		const depth = depthOf(fact, order);
		const slot = `${fact.entity}\u0000${fact.key}`;
		const incumbent = winners.get(slot);
		if (!incumbent || depth >= incumbent.depth) winners.set(slot, { fact, depth });
	}
	return [...winners.values()]
		.map((w) => w.fact)
		.sort((a, b) => {
			if (a.entity !== b.entity) return a.entity < b.entity ? -1 : 1;
			if (a.key !== b.key) return a.key < b.key ? -1 : 1;
			return a.id < b.id ? -1 : 1;
		});
}

/** Group an effective set by entity for injection and the panel (recall renders entity
 *  groups with the key demoted to a row label). */
export function groupByEntity(active: ChatFact[]): Map<string, ChatFact[]> {
	const groups = new Map<string, ChatFact[]>();
	for (const fact of active) {
		const list = groups.get(fact.entity) ?? [];
		list.push(fact);
		groups.set(fact.entity, list);
	}
	return groups;
}

/** Facts whose anchors point at turns that no longer exist: the extraction reaper's
 *  candidates, hard-deleted by the caller (a deleted turn must not leave facts about
 *  nothing behind). Unanchored facts are never reap candidates. */
export function reapCandidateFacts(allFacts: ChatFact[], liveMessageIds: Iterable<string>): ChatFact[] {
	const live = new Set(liveMessageIds);
	return allFacts.filter((fact) => fact.sourceIds.length > 0 && !fact.sourceIds.every((id) => live.has(id)));
}
