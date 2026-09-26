/**
 * Reply suggestions (P007). When the reader is stuck, one LLM call proposes four
 * short, direction-diverse candidates for their next message; picking one fills the
 * composer (never auto-sends). Rides the impersonate engine's connection, same as
 * the other composer side-flows. Suggestions are ephemeral: nothing here touches the
 * message tree, so no memory maintenance or pricing side effects exist by construction.
 *
 * The instruction rides AFTER the history tail as a plain final user turn, which keeps
 * the prompt a pure append on the cached prefix. The template is a service constant on
 * purpose for the MVP: registering it as a user-editable feature prompt is a later
 * concern and would grow the engine editor's surface.
 */
import { i18n } from '$lib/i18n/i18n.svelte';
import type { LLMMessage } from '$lib/types/llm';
import type { Message } from '$lib/types/chat';
import { llmService } from '$lib/services/llm/provider';

const HISTORY_TURNS = 12;

const INSTRUCTION =
	'You suggest short replies the user could send next in this roleplay chat. Read the recent ' +
	'turns, then reply with EXACTLY a JSON array of 4 strings: no markdown fence, no commentary, ' +
	'no numbering. Each string is one candidate for the user\'s next message, 1-2 sentences, ' +
	'written in the same language the chat itself uses, in the user\'s voice. The 4 candidates ' +
	'must take clearly DIFFERENT directions: one advancing the plot, one reacting emotionally, ' +
	'one asking the character a question, one taking a concrete action. Plain chat messages only: ' +
	'no OOC notes, no stage directions, unless the chat itself already writes that way.';

/** Exported so a caller (or test) can price the exact messages a real run would send. */
export function buildReplySuggestionPrompt(chatMessages: Message[]): LLMMessage[] {
	const recent = chatMessages
		.filter((m) => m.role === 'user' || m.role === 'assistant')
		.slice(-HISTORY_TURNS)
		.map((m) => ({ role: m.role, content: m.content }) as LLMMessage);
	if (!recent.length) throw new Error(i18n.t('chat.suggestNoHistory'));
	return [...recent, { role: 'user', content: INSTRUCTION }];
}

/** Exported for the suite: the JSON-first, lines-fallback candidate parser. */
export function parseCandidates(text: string): string[] {
	const bracketed = text.match(/\[[\s\S]*\]/);
	if (bracketed) {
		try {
			const arr = JSON.parse(bracketed[0]);
			if (Array.isArray(arr)) {
				return arr.map((v) => String(v).trim()).filter(Boolean).slice(0, 4);
			}
		} catch {
			// fall through to line splitting
		}
	}
	return text
		.split('\n')
		.map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
		.filter(Boolean)
		.slice(0, 4);
}

/** Four candidates, or a thrown error the composer surfaces as a toast. */
export async function runReplySuggestions(opts: {
	chatMessages: Message[];
	signal?: AbortSignal;
}): Promise<string[]> {
	const messages = buildReplySuggestionPrompt(opts.chatMessages);
	// Foreground user-triggered call: errors PROPAGATE, same contract as composer transforms.
	const result = await llmService.complete(
		{ engine: 'impersonate' },
		{ messages, source: 'reply-suggestions', signal: opts.signal }
	);
	const items = parseCandidates(result.content);
	if (!items.length) throw new Error(i18n.t('rx.emptyResult'));
	return items;
}
