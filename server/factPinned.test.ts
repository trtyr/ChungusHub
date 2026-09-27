/**
 * The mem-op-pinned refusals (P006 phase 2 audit): the server refuses fact edits and
 * reaps that target a reader-pinned row, loud, by pre-check. Real server database via
 * the env dance: CHUNGUS_DATA_DIR pinned to a throwaway dir before the first db call.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dataDir: string;
let serverDb: any;

beforeAll(async () => {
	dataDir = mkdtempSync(join(tmpdir(), 'chungus-factpinned-'));
	process.env.CHUNGUS_DATA_DIR = dataDir;
	const mod = await import('./db');
	serverDb = mod.serverDb;
	const db = serverDb.db;
	db.query("INSERT INTO chats (id, title, created_at, updated_at) VALUES ('c1', 'pin test', 1, 1)").run();
	db.query(
		"INSERT INTO chat_facts (id, chat_id, entity, key, value, importance, pinned, created_at, revised_at) VALUES ('fp1', 'c1', 'S', '所在地', '灯塔', 2, 1, 1, 1)"
	).run();
	db.query(
		"INSERT INTO chat_facts (id, chat_id, entity, key, value, importance, pinned, created_at, revised_at) VALUES ('fr1', 'c1', 'S', '其他', '普通行', 1, 0, 1, 1)"
	).run();
});

afterAll(() => {
	delete process.env.CHUNGUS_DATA_DIR;
	rmSync(dataDir, { recursive: true, force: true });
});

describe('mem-op-pinned refusals', () => {
	test('edit refuses a pinned fact, loud', () => {
		expect(() => serverDb.memUpdateFactContent('c1', 'fp1', '灯塔顶层')).toThrow(/mem-op-pinned/);
	});

	test('reap refuses when any target is pinned, loud', () => {
		expect(() => serverDb.memReapFacts('c1', ['fr1', 'fp1'])).toThrow(/mem-op-pinned/);
	});

	test('the unpinned fact edits and reaps normally', () => {
		serverDb.memUpdateFactContent('c1', 'fr1', '改过的行');
		const row = serverDb.db.query("SELECT value FROM chat_facts WHERE id = 'fr1'").get() as { value: string };
		expect(row.value).toBe('改过的行');
		serverDb.memReapFacts('c1', ['fr1']);
		const gone = serverDb.db.query("SELECT count(*) AS n FROM chat_facts WHERE id = 'fr1'").get() as { n: number };
		expect(gone.n).toBe(0);
	});

	test('the pinned row survives both attempts', () => {
		const row = serverDb.db.query("SELECT value, pinned FROM chat_facts WHERE id = 'fp1'").get() as {
			value: string;
			pinned: number;
		};
		expect(row.value).toBe('灯塔');
		expect(row.pinned).toBe(1);
	});
});
