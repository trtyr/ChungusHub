/**
 * P017 1c: the msg_vars column (schema v48) round-trips per-message, per-swipe variable
 * rows and stays NULL on rows that never carry one.
 */
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';

import { MIGRATIONS_FOR_TESTS } from './db';

let db: Database;

beforeEach(() => {
	db = new Database(':memory:');
	for (const migration of [...MIGRATIONS_FOR_TESTS].sort((a, b) => a.version - b.version)) {
		db.exec(migration.sql);
	}
	db.run("INSERT INTO chats (id, title, created_at, updated_at) VALUES ('c1', 't', 1, 1)");
});

afterEach(() => db.close());

function insertMessage(id: string, msgVars: string | null): void {
	db.run(
		'INSERT INTO messages (id, chat_id, parent_id, role, content, msg_vars, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?)',
		[id, 'c1', 'assistant', 'lore', msgVars, 1]
	);
}

const msgVarsOf = (id: string): string | null =>
	(db.query('SELECT msg_vars FROM messages WHERE id = ?').get(id) as { msg_vars: string | null })
		.msg_vars;

describe('schema v48: messages.msg_vars', () => {
	test('the column exists after the migrations run', () => {
		const columns = (
			db.query('PRAGMA table_info(messages)').all() as { name: string }[]
		).map((c) => c.name);
		expect(columns).toContain('msg_vars');
	});

	test('a row carrying a message-scoped variable table round-trips as JSON', () => {
		const payload = JSON.stringify({ 'hakimi.affection': '50', mood: 'warm' });
		insertMessage('m1', payload);
		expect(JSON.parse(msgVarsOf('m1')!)).toEqual({ 'hakimi.affection': '50', mood: 'warm' });
	});

	test('rows written without vars read back NULL, not an empty object', () => {
		insertMessage('m2', null);
		expect(msgVarsOf('m2')).toBeNull();
	});

	test('LATEST_SCHEMA_VERSION covers v48 through the migrations array', () => {
		const versions = MIGRATIONS_FOR_TESTS.map((m) => m.version);
		expect(versions).toContain(48);
	});
});
