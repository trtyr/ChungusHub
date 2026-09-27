/**
 * The fact-maintenance agent (P006 Phase 2). A plain-completion JSON tool loop: the model
 * answers one JSON object per turn (`{"tool": "...", "args": {...}}`), the host executes
 * it against the fact RPCs and feeds the result back, until `finish` or a budget binds.
 * No native function-calling dependency — the same doctrine as the JSON extraction.
 *
 * Authority stays exactly where Phase 1 put it: every write is one audited RPC with
 * server-side validation, pinned rows are refused server-side, and the whole pass is
 * bounded (turns / writes) with stillActive checks between turns.
 */

import type { ChatFact, LlmFn, MemoryDb, MemoryMessage } from './types';

const MAX_TURNS = 8;
const MAX_APPLY = 20;
const MAX_UPDATE = 10;
const MAX_REAP = 10;

const SYSTEM = [
	'你维护一个角色扮演聊天的事实板。每轮只回一个 JSON 对象，不要 markdown 围栏、不要多余文字。',
	'可用工具：',
	'{"tool":"apply_facts","args":{"facts":[{"entity":"主体名","key":"受控键","value":"一句自含的话","importance":1-3}]}}',
	'{"tool":"update_fact","args":{"factId":"要改写的事实 id","value":"改后的自含一句话"}}',
	'{"tool":"reap_facts","args":{"ids":["要删除的事实 id"]}}',
	'{"tool":"finish"}',
	'规则：只从新回合提取，结果与状态而非过程；变化带转移；专名数量逐字保留；同义事实合并（改写旧行）而非堆叠；完全重复的回声行删除；importance 3=主线 2=状态变化 1=琐事；没有要做的就 finish。'
].join('\n');

export interface AgentDeps {
	llm: LlmFn;
	db: Pick<MemoryDb, 'applyFacts' | 'reapFacts' | 'updateFactContent'>;
	/** The board snapshot at pass start (the host reads it; the agent sees it in the seed). */
	board: ChatFact[];
	/** The recent turns the agent may extract from (already tail-trimmed by the caller). */
	recentTurns: MemoryMessage[];
	/** Chat-scoped abort: a chat switch or delete aborts between tool turns. */
	signal?: AbortSignal;
}

export interface AgentRunResult {
	applied: number;
	updated: number;
	reaped: number;
	turns: number;
}

interface AgentAction {
	tool: string;
	args: Record<string, unknown>;
}

function parseAction(raw: string): AgentAction | null {
	const data = raw.trim().startsWith('{') ? raw : raw.slice(Math.max(0, raw.indexOf('{')));
	try {
		const parsed = JSON.parse(data) as Record<string, unknown>;
		if (!parsed || typeof parsed.tool !== 'string') return null;
		return { tool: parsed.tool, args: (parsed.args ?? {}) as Record<string, unknown> };
	} catch {
		return null;
	}
}

function renderTurns(turns: MemoryMessage[]): string {
	return turns.map((m) => `${m.speaker || m.role}：${m.content}`).join('\n');
}

function renderBoard(board: ChatFact[]): string {
	if (board.length === 0) return '（事实板为空）';
	return board
		.map(
			(f) =>
				`- [${f.id.slice(0, 8)}] ${f.entity} · ${f.key} = ${f.value}${f.pinned ? '（已固定，不可改）' : ''}`
		)
		.join('\n');
}

/**
 * One agent maintenance pass. Returns the write counters; throws loud on a model that
 * will not produce parseable actions (after one retry, the P0 doctrine).
 */
export async function runAgentPass(deps: AgentDeps, chatId: string): Promise<AgentRunResult> {
	const result: AgentRunResult = { applied: 0, updated: 0, reaped: 0, turns: 0 };
	const seed =
		`[新回合原文]\n${renderTurns(deps.recentTurns) || '（无）'}\n\n[当前事实板]\n${renderBoard(deps.board)}`;
	const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
		{ role: 'system', content: SYSTEM },
		{ role: 'user', content: seed }
	];

	let lastParseFailed = false;
	while (result.turns < MAX_TURNS) {
		if (deps.signal?.aborted) break;
		result.turns++;

		let raw: string;
		try {
			raw = await deps.llm(messages, deps.signal);
		} catch (error) {
			if (deps.signal?.aborted) break;
			throw error;
		}
		const action = parseAction(raw);
		if (!action) {
			if (lastParseFailed) throw new Error(`agent produced unparseable action: ${raw.slice(0, 120)}`);
			lastParseFailed = true;
			messages.push({ role: 'assistant', content: raw.slice(0, 500) });
			messages.push({ role: 'user', content: '无法解析。请只回一个 JSON 对象：{"tool":...,"args":{...}} 或 {"tool":"finish"}。' });
			continue;
		}
		lastParseFailed = false;

		let feedback: string;
		if (action.tool === 'finish') break;

		if (action.tool === 'apply_facts') {
			if (result.applied >= MAX_APPLY) {
				feedback = 'apply 预算已用尽，请 finish。';
			} else {
				const facts = Array.isArray(action.args.facts) ? (action.args.facts as never[]) : [];
				await deps.db.applyFacts(chatId, facts.slice(0, MAX_APPLY - result.applied) as never, recentIds(deps.recentTurns));
				result.applied += facts.length;
				feedback = `applied ${facts.length}.`;
			}
		} else if (action.tool === 'update_fact') {
			if (result.updated >= MAX_UPDATE) {
				feedback = 'update 预算已用尽，请 finish。';
			} else {
				const factId = String(action.args.factId ?? '');
				const value = String(action.args.value ?? '');
				if (!factId || !value.trim()) {
					feedback = 'update_fact 需要 factId 与非空 value。';
				} else {
					await deps.db.updateFactContent(chatId, factId, value);
					result.updated++;
					feedback = 'updated.';
				}
			}
		} else if (action.tool === 'reap_facts') {
			if (result.reaped >= MAX_REAP) {
				feedback = 'reap 预算已用尽，请 finish。';
			} else {
				const ids = Array.isArray(action.args.ids)
					? (action.args.ids as unknown[]).map(String).slice(0, MAX_REAP - result.reaped)
					: [];
				await deps.db.reapFacts(chatId, ids);
				result.reaped += ids.length;
				feedback = `reaped ${ids.length}.`;
			}
		} else {
			feedback = `未知工具 "${action.tool}"。可用：apply_facts / update_fact / reap_facts / finish。`;
		}

		messages.push({ role: 'assistant', content: JSON.stringify(action) });
		messages.push({ role: 'user', content: `[工具结果] ${feedback}` });
	}
	return result;
}

function recentIds(turns: MemoryMessage[]): string[] {
	return turns.map((m) => m.id);
}
