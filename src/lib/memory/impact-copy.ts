/**
 * Plain-English rendering of a `ChangeImpact`: what a rewrite or a delete costs the chat's
 * memory, said before it happens.
 *
 * Kept beside the engine rather than inside the component because it is pure, unit-testable,
 * and has to stay honest about mechanics only this module's neighbours know: which summaries
 * die, which merely pause, how many turns are re-read, and WHO re-reads them (a delete's reap
 * kicks the pass itself, a rewrite waits for the next reply, manual mode waits for the panel's
 * Summarise, and a backlog past `AUTO_MAX_BATCHES` takes several replies whatever the mode).
 *
 * Short by construction: one sentence for what the change costs, one for what happens next,
 * and a third only when summaries outside the current thread go too. Everything else belongs
 * in the Memory panel. The rule these sentences must never break is that each one describes
 * something the engine will actually do. A promised re-read that no pass performs sends the
 * reader to Forget and rebuild, which discards the whole ladder to fix nothing.
 */

import type { ChangeImpact } from './branching';
import { AUTO_MAX_BATCHES } from './config';

export interface ImpactCopyOptions {
	/** A rewrite keeps the turns; a delete takes them out of the chat. */
	mode: 'edit' | 'delete';
	/** Whether extraction fires on its own. In manual mode the panel's Summarise is the
	 *  only trigger, so promising the next reply will fix it would be a lie. */
	auto: boolean;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Sentences for a confirmation, or an empty array when memory is untouched by the change. */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Sentences for a confirmation, or an empty array when memory is untouched by the change.
 *  The caller injects `t` (i18n.t on the client) so this module stays server-safe. */
export function describeMemoryImpact(
	impact: ChangeImpact,
	opts: ImpactCopyOptions,
	t: Translate
): string[] {
	const { dropped, droppedStored, paused, survivors, reread, passes, span } = impact;
	if (!dropped && !droppedStored) return [];
	const lines: string[] = [];

	if (dropped) {
		if (!span) throw new Error('memory: a summary in play has no turn span');
		const where =
			span.from === span.to
				? t('mem.icTurn', { n: span.from })
				: t('mem.icTurns', { from: span.from, to: span.to });
		const verb = opts.mode === 'edit' ? t('mem.icSaving') : t('mem.icDeleting');
		const what = dropped === 1 ? t('mem.icThatSummary') : t('mem.icThoseSummaries', { n: dropped });
		const after = paused === 1 ? t('mem.icAfterOne') : paused ? t('mem.icAfterN', { n: paused }) : '';
		lines.push(t('mem.icSummarized', { where, verb, what, after }));
	}

	if (passes > 0) {
		const cost = t('mem.icCost', { n: reread, p: passes, turn: reread === 1 ? 'turn' : 'turns', pass: passes === 1 ? 'pass' : 'passes' });
		const back = paused === 1 ? t('mem.icBackOne') : paused ? t('mem.icBackN', { n: paused }) : '';
		if (!opts.auto) {
			lines.push(t('mem.icManual', { cost, back }));
		} else if (opts.mode === 'delete') {
			lines.push(t('mem.icDeleteLine', { cost, back }));
		} else if (passes > AUTO_MAX_BATCHES) {
			lines.push(t('mem.icAutoMany', { cost, back }));
		} else {
			lines.push(t('mem.icAutoOne', { cost, back }));
		}
	} else if (dropped && survivors === 0) {
		lines.push(t('mem.icWhole'));
	} else if (dropped) {
		lines.push(t('mem.icSurvivors', { n: survivors }));
	}

	if (droppedStored) {
		lines.push(droppedStored === 1 ? t('mem.icStoredOne') : t('mem.icStoredGone', { n: droppedStored }));
	}
	return lines;
}

/** English fallback for server-side consumers (tool payloads the model reads, not UI copy). */
const EN: Record<string, string> = {
	'mem.icTurn': 'Turn #{n} is',
	'mem.icTurns': 'Turns #{from} to #{to} are',
	'mem.icSaving': 'Saving',
	'mem.icDeleting': 'Deleting',
	'mem.icThatSummary': 'that summary',
	'mem.icThoseSummaries': 'those {n} summaries',
	'mem.icAfterOne': ', and the 1 summary behind it pauses',
	'mem.icAfterN': ', and the {n} summaries behind them pause',
	'mem.icSummarized': '{where} summarized in memory. {verb} drops {what}{after}.',
	'mem.icCost': '{n} {turn} ({p} {pass})',
	'mem.icBackOne': ', and the paused one returns',
	'mem.icBackN': ', and the paused {n} return',
	'mem.icManual': 'Nothing is lost: summarizing in the Memory panel re-reads {cost}{back}.',
	'mem.icDeleteLine': 'The turns that survive are re-summarized right away: {cost}{back}.',
	'mem.icAutoMany': 'Nothing is lost: {cost} are re-read over your next few replies{back}.',
	'mem.icAutoOne': 'Nothing is lost: your next reply re-reads {cost}{back}.',
	'mem.icWhole': 'The turns it describes are going too, so nothing is re-read and the rest of memory is untouched.',
	'mem.icSurvivors': 'The {n} turns that survive go back to being sent in full, so nothing is re-read.',
	'mem.icStoredOne': '1 other stored summary of these turns goes with them.',
	'mem.icStoredGone': '{n} other stored summaries of these turns go with them.'
};

export const enT: Translate = (key, params) => {
	let out = EN[key] ?? key;
	for (const [k, v] of Object.entries(params ?? {})) out = out.replaceAll(`{${k}}`, String(v));
	return out;
};
