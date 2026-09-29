/**
 * Recall assembly: turns the stored memory into the text injected via {{memory}}.
 *
 * Two blocks: deep memory (compacted higher-layer episodes) and the layer-0 episodes
 * ("Recent events"), each in story order.
 *
 * **Callers pass `Coverage.active`, and its order IS the story order.** Nothing is sorted
 * here on purpose. Inferring order from `createdAt` holds only while episodes are appended
 * strictly along the path, and they are not: a hole left by a deleted turn is re-folded
 * later, producing a brand-new row that covers an OLD stretch of the story. Sorting that by
 * write time prints the middle of the book after its ending.
 * `resolveCoverage` already tiles the path from the root, so it knows the real order and is
 * the only thing that should decide it.
 *
 * Every episode handed in is rendered. There is deliberately no cap on the COUNT: a second
 * cap on top of the layer caps hides whole batches whose messages have already been dropped
 * from the live history, a band of the story neither shown verbatim nor recalled. Whatever
 * is folded is recalled, so "a message is either live or in memory" holds end to end.
 *
 * **Size: uncapped by default, with an opt-in soft cap.** The 2026-07 decision
 * (architecture/memory.md) rejected a hard cap twice over: capping by size means
 * compacting harder, spending merge calls to make memory worse, and letting memory yield
 * under pressure hides episodes whose turns are already archived. The soft cap added here
 * (`recallSoftCapTokens`, default 0 = off) takes a third shape the old note did not
 * consider: over budget, the OLDEST episodes render as a one-line folded index
 * (`[N turns folded]`) instead of their full text, newest first to keep their prose.
 * Nothing disappears: every episode still appears in the block (in full or as an index
 * line that names its turn span), so the band-of-story-invisible hole the
 * folded-implies-recalled rule exists to prevent cannot open; and no merge calls are
 * spent, the fold is a rendering decision re-evaluated on every read. The layer caps
 * still bound how many episodes exist, and episode size is still geometric in
 * `maxLayers` (the promote template targets "roughly half the length of the input"),
 * which is why a saturated three-layer ladder on the shipped defaults measures around
 * 12k tokens, enough to blow the whole budget on an 8k or 16k model. Whether that
 * pressure is visible is unchanged: composer chip, Prompt Builder header, the panel's
 * Tokens/turn.
 */

import { substitute } from '$lib/macros';
import { DEFAULT_RECALL_TEMPLATE } from './prompts';
import type { Episode } from './types';

/**
 * Rough token estimate for a rendered recall block, pure and dependency-free on purpose
 * (the memory core takes no tokenizer import; architecture/memory.md coupling 9 keeps
 * this file server-buildable). CJK characters count ~1 token each, other scripts ~4
 * characters per token; for the CJK-heavy prose this feature targets the estimate errs
 * HIGH, which is the safe direction for a cap: it folds a little earlier rather than
 * letting the block bloat past the number the reader set.
 */
export function estimateRecallTokens(text: string): number {
	let cjk = 0;
	let other = 0;
	for (const ch of text) {
		const code = ch.codePointAt(0) ?? 0;
		// CJK unified ideographs + ext A/compat, kana, fullwidth forms.
		if (
			(code >= 0x3040 && code <= 0x30ff) ||
			(code >= 0x3400 && code <= 0x4dbf) ||
			(code >= 0x4e00 && code <= 0x9fff) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xff00 && code <= 0xffef)
		) {
			cjk++;
		} else {
			other++;
		}
	}
	return cjk + Math.ceil(other / 4);
}

/** The one-line stand-in for a folded episode: present, countable, not prose. */
function foldedLine(e: Episode): string {
	return `- [${e.sourceMessageIds.length} turns folded]`;
}

function deepBlock(episodes: Episode[], foldedIds: Set<string>): string {
	const deep = episodes.filter((e) => e.layer >= 1);
	if (deep.length === 0) return '';
	// "Earlier arcs", not "The story so far": the default preset labels its history
	// block that way, and two identical headings in one prompt read as the same thing.
	return (
		'Earlier arcs:\n' +
		deep.map((e) => (foldedIds.has(e.id) ? foldedLine(e) : `- ${e.content}`)).join('\n')
	);
}

function recentBlock(episodes: Episode[], foldedIds: Set<string>): string {
	const l0 = episodes.filter((e) => e.layer === 0);
	if (l0.length === 0) return '';
	return (
		'Recent events:\n' +
		l0.map((e) => (foldedIds.has(e.id) ? foldedLine(e) : `- ${e.content}`)).join('\n')
	);
}

function fillRecall(template: string, vars: { deepMemory: string; recent: string }): string {
	return substitute(template, vars)
		.replace(/\n{3,}/g, '\n\n') // collapse gaps left by empty blocks
		.trim();
}

/**
 * Build the recall block, or null when there's nothing to recall. `template` defaults to
 * the built-in template (so tests/fallback don't need a template source).
 *
 * `episodes` must already be in story order: pass `Coverage.active`, never a raw table
 * read. See the module header for why nothing is sorted in here.
 *
 * `softCapTokens` (0 = off) folds the OLDEST episodes to index lines, in story order,
 * until the estimate fits. All-episodes-folded is the floor: the index block is the
 * smallest honest form and is shipped even if it alone sits over the cap.
 */
export function buildRecall(
	episodes: Episode[],
	template: string = DEFAULT_RECALL_TEMPLATE,
	softCapTokens = 0
): string | null {
	const render = (foldedIds: Set<string>): string | null => {
		const d = deepBlock(episodes, foldedIds);
		const r = recentBlock(episodes, foldedIds);
		if (!d && !r) return null;
		return fillRecall(template, { deepMemory: d, recent: r });
	};

	if (!softCapTokens) return render(new Set());

	let out = render(new Set());
	if (!out) return null;
	// Fold oldest-first (story order = array order). The floor is the fully-indexed block.
	for (let folded = 1; folded <= episodes.length; folded++) {
		if (estimateRecallTokens(out) <= softCapTokens) break;
		const next = render(new Set(episodes.slice(0, folded).map((e) => e.id)));
		if (!next) break; // unreachable: episodes is non-empty here
		out = next;
	}
	return out;
}
