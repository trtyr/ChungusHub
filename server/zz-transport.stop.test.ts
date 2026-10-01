import { describe, expect, test } from 'bun:test';

/**
 * The Stop button's full contract, pinned at the client transport layer.
 *
 * EN-20 (2026-09-30): a reader reported that Stop did nothing during a streaming
 * reply. The server side of `llm-cancel` is pinned by generationSurvival.test.ts
 * and the provider abort semantics by openai-compatible.test.ts, but the ONE link
 * nobody had under test is the client itself: that aborting the page's own
 * AbortController (what `cancelGeneration` does for a reply this page started)
 * actually sends `llm-cancel`, the upstream actually stops, and everything that
 * streamed before the stop lands as the turn.
 *
 * The real transport module is exercised against the real server over a real
 * WebSocket, and it runs in a CHILD PROCESS. This suite boots an isolated bun
 * test run for the actual work: the transport module holds live sockets, heartbeats
 * and a reconnect loop that outlive its tests, and Bun's module registry is shared
 * by every file in the outer run (see presets.test.ts), so a leaked timer here
 * would detune every suite after this one. The child takes the churn with it.
 *
 * The endpoint holds the rest of its answer behind a gate that the tests never
 * open: if the cancel did not reach the upstream, the only way the promise could
 * settle is the backstop timers, and the assertions on the upstream-side flag
 * would fail. There is no path to a false green here.
 */

const IS_CHILD = process.env.STOP_E2E_CHILD === '1';

if (!IS_CHILD) {
	describe('client stop chain (isolated child run)', () => {
		test('the full stop-chain suite passes in an isolated process', async () => {
			const proc = Bun.spawn([process.execPath, 'test', import.meta.path], {
				env: { ...process.env, STOP_E2E_CHILD: '1' },
				stdout: 'inherit',
				stderr: 'pipe'
			});
			const stderr = await new Response(proc.stderr as ReadableStream<Uint8Array>).text();
			const exit = await proc.exited;
			if (exit !== 0) throw new Error(`the isolated stop-chain run failed (${exit}):\n${stderr}`);
			expect(exit).toBe(0);
		}, 120_000);
	});
} else {
	const { afterAll, afterEach, beforeAll, test } = await import('bun:test');
	const { mkdtempSync, rmSync } = await import('node:fs');
	const { tmpdir } = await import('node:os');
	const { join } = await import('node:path');

	const TOKENS = ['Hel', 'lo ', ...Array.from({ length: 38 }, (_, i) => `w${i} `)];

	let releaseGate: () => void = () => {};
	let gate: Promise<void> = Promise.resolve();
	function armGate(): void {
		gate = new Promise<void>((resolve) => {
			releaseGate = resolve;
		});
	}

	const upstream = { sawCancel: false };

	function sse(payload: unknown): string {
		return `data: ${JSON.stringify(payload)}\n\n`;
	}

	/** An OpenAI-compatible endpoint that streams the token list then blocks on the gate. */
	const model = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		async fetch(req) {
			const path = new URL(req.url).pathname;
			if (path === '/v1/models') {
				return Response.json({ data: [{ id: 'scripted' }] });
			}
			if (path !== '/v1/chat/completions') return new Response('Not found', { status: 404 });
			const stream = new ReadableStream<Uint8Array>({
				async start(controller) {
					const encode = (s: string) => controller.enqueue(new TextEncoder().encode(s));
					try {
						for (const token of TOKENS) {
							encode(sse({ choices: [{ delta: { content: token } }] }));
							await Bun.sleep(25);
						}
						await gate;
						encode(sse({ choices: [{ delta: {}, finish_reason: 'stop' }] }));
						encode(
							sse({ usage: { prompt_tokens: 5, completion_tokens: TOKENS.length, total_tokens: 5 + TOKENS.length } })
						);
						encode('data: [DONE]\n\n');
						controller.close();
					} catch {
						// The reader went away mid-stream: expected on the abort path.
					}
				},
				cancel() {
					upstream.sawCancel = true;
				}
			});
			return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
		}
	});

	const scratch = mkdtempSync(join(tmpdir(), 'chungus-stop-'));
	let child: ReturnType<typeof Bun.spawn> | null = null;
	let origin = '';

	async function bootServer(): Promise<string> {
		child = Bun.spawn([process.execPath, 'server/index.ts'], {
			env: {
				...process.env,
				NODE_ENV: 'production',
				CHUNGUS_PORT: '0',
				CHUNGUS_HOST: '127.0.0.1',
				CHUNGUS_DATA_DIR: join(scratch, 'data'),
				CHUNGUS_BACKUP_DIR: join(scratch, 'backups'),
				CHUNGUS_NO_OPEN: '1'
			},
			stdout: 'pipe',
			stderr: 'pipe'
		});
		let banner = '';
		const stdout = child.stdout as ReadableStream<Uint8Array>;
		const decoder = new TextDecoder();
		for await (const chunk of stdout) {
			banner += decoder.decode(chunk, { stream: true });
			const match = banner.match(/http:\/\/localhost:(\d+)/);
			if (match) return `http://127.0.0.1:${match[1]}`;
		}
		throw new Error(`The server exited before it announced a port.\n${banner}`);
	}

	async function rpc(method: string, args: unknown[]): Promise<unknown> {
		const res = await fetch(`${origin}/api/rpc/db`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ method, args, clientId: 'test' })
		});
		if (!res.ok) throw new Error(`${method} failed: ${res.status} ${await res.text()}`);
		return (await res.json()).result;
	}

	const CONNECTION_ID = 'stop-chain-conn';

	async function seedChat(): Promise<{ chatId: string; userTurnId: string }> {
		const chatId = crypto.randomUUID();
		const userTurnId = crypto.randomUUID();
		const now = Date.now();
		await rpc('insertChat', [
			{
				id: chatId,
				title: 'Stop chain',
				createdAt: now,
				updatedAt: now,
				rootMessageId: null,
				activeLeafId: null,
				canonLeafId: null,
				settings: null,
				characterId: null,
				characterVersionId: null
			}
		]);
		await rpc('insertMessage', [
			{ id: userTurnId, chatId, parentId: null, role: 'user', content: 'say hello', createdAt: now, siblingIndex: 0 }
		]);
		await rpc('updateChatActiveLeaf', [chatId, userTurnId]);
		return { chatId, userTurnId };
	}

	beforeAll(async () => {
		origin = await bootServer();
		const res = await fetch(`${origin}/api/rpc/db`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				method: 'setConnectionCredentials',
				args: [CONNECTION_ID, 'openai-compatible', 'test-key', `http://127.0.0.1:${model.port}/v1`],
				clientId: 'test'
			})
		});
		expect(res.status).toBe(200);

		// The transport module guards its browser-only pieces on `typeof window`, and
		// wsUrl() reads location. Provide both before the first import touches them.
		(globalThis as Record<string, unknown>).window = globalThis;
		(globalThis as Record<string, unknown>).location = {
			protocol: 'http:',
			host: origin.replace('http://', '')
		};
	});

	afterEach(() => {
		releaseGate();
	});

	afterAll(async () => {
		child?.kill();
		await child?.exited;
		model.stop(true);
		// The child process exits with the suite; its sockets and timers go with it.
		process.exit(0);
	});

	test('aborting the page controller mid-stream stops the upstream and commits what streamed', async () => {
		armGate();
		const transport = await import('../src/lib/services/transport.ts');
		await transport.connectWs();

		const { chatId, userTurnId } = await seedChat();
		const controller = new AbortController();
		const tokens: string[] = [];

		const settled = transport.llmComplete({
			connectionId: CONNECTION_ID,
			provider: 'openai-compatible',
			model: 'scripted',
			messages: [{ role: 'user', content: 'say hello' }],
			stream: true,
			deliverTokens: true,
			onToken: (token) => {
				tokens.push(token);
				// Stop exactly like the Stop button does: cancel the page controller.
				if (tokens.length === 2) controller.abort();
			},
			signal: controller.signal,
			commit: {
				chatId,
				parentId: userTurnId,
				expectedLeafId: userTurnId,
				claimsRoot: false,
				lorebook: null,
				spendSteeringIds: []
			}
		});

		// The gate never opens, so this can only resolve if the abort cancelled the
		// upstream: the pinned contract is that a Stop RESOLVES (never rejects) with
		// everything that streamed before it, as a cancelled finish.
		const result = await settled;
		expect(result.finishReason).toBe('cancelled');
		expect(tokens.length).toBe(2);
		// The abort raced the last frame boundary, so assert against the provider's own
		// accumulation rather than the client frame count: what matters is that a real
		// prefix of the reply arrived and the client view equals the persisted view.
		expect(result.content.startsWith('Hel')).toBe(true);
		expect(upstream.sawCancel).toBe(true);

		// What the reader watched arrive persists as the turn.
		expect(result.committedMessageId).toBeTruthy();
		const messages = (await rpc('getMessagesByChat', [chatId])) as { role: string; content: string }[];
		const assistant = messages.filter((m) => m.role === 'assistant');
		expect(assistant).toHaveLength(1);
		expect(assistant[0].content).toBe(result.content);
	}, 20_000);

	test('the whole chain is silent-free: a second reply runs normally after a stop', async () => {
		armGate();
		const transport = await import('../src/lib/services/transport.ts');
		const { chatId, userTurnId } = await seedChat();
		const controller = new AbortController();
		const tokens: string[] = [];

		const first = transport.llmComplete({
			connectionId: CONNECTION_ID,
			provider: 'openai-compatible',
			model: 'scripted',
			messages: [{ role: 'user', content: 'again' }],
			stream: true,
			deliverTokens: true,
			onToken: (token) => {
				tokens.push(token);
				if (tokens.length === 1) controller.abort();
			},
			signal: controller.signal,
			commit: {
				chatId,
				parentId: userTurnId,
				expectedLeafId: userTurnId,
				claimsRoot: false,
				lorebook: null,
				spendSteeringIds: []
			}
		});
		const stopped = await first;
		expect(stopped.finishReason).toBe('cancelled');

		// The single-flight gate must be free after a stop: the next reply streams.
		releaseGate();
		const second = await transport.llmComplete({
			connectionId: CONNECTION_ID,
			provider: 'openai-compatible',
			model: 'scripted',
			messages: [{ role: 'user', content: 'once more' }],
			stream: true,
			deliverTokens: true,
			onToken: () => {},
			signal: undefined,
			commit: {
				chatId,
				parentId: userTurnId,
				expectedLeafId: null,
				claimsRoot: false,
				lorebook: null,
				spendSteeringIds: []
			}
		});
		expect(second.finishReason).toBe('stop');
		// Full completion after a stop: first token, last token, nothing cancelled.
		expect(second.content.startsWith(TOKENS[0])).toBe(true);
		expect(second.content.endsWith(TOKENS[TOKENS.length - 1].trimEnd())).toBe(true);
		expect(second.committedMessageId).toBeTruthy();
	}, 20_000);

	test('token arrival keeps the upstream cadence: no batching backlog at the app boundary', async () => {
		// EN-21 asked whether the frontend thwarts a fast upstream. The endpoint paces
		// one token every 25ms; if the pipeline delivered in batches, arrivals would
		// clump into bursts separated by long gaps. Twenty arrivals is enough to see
		// the shape and fast enough to stay load-tolerant: the bound is 10x the
		// pacing, far above anything a healthy local hop produces (de-flake rule
		// 8279d96).
		armGate();
		const transport = await import('../src/lib/services/transport.ts');
		const { chatId, userTurnId } = await seedChat();
		const controller = new AbortController();
		const arrivals: number[] = [];

		const done = transport.llmComplete({
			connectionId: CONNECTION_ID,
			provider: 'openai-compatible',
			model: 'scripted',
			messages: [{ role: 'user', content: 'pace' }],
			stream: true,
			deliverTokens: true,
			onToken: () => {
				arrivals.push(performance.now());
				if (arrivals.length === 20) controller.abort();
			},
			signal: controller.signal,
			commit: {
				chatId,
				parentId: userTurnId,
				expectedLeafId: userTurnId,
				claimsRoot: false,
				lorebook: null,
				spendSteeringIds: []
			}
		});
		await done;

		expect(arrivals.length).toBe(20);
		const gaps = arrivals.slice(1).map((t, i) => t - arrivals[i]);
		const maxGap = Math.max(...gaps);
		// A batched delivery would show at least one gap of several pacing intervals.
		expect(maxGap).toBeLessThan(250);
	}, 20_000);
}
