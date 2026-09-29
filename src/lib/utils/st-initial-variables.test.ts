import { describe, expect, test } from 'bun:test';
import { isInitialVariablesEntry, parseInitialVariables } from './st-initial-variables';

describe('isInitialVariablesEntry', () => {
	test('title prefix and content decorator both qualify', () => {
		expect(isInitialVariablesEntry('[InitialVariables] hakimi', '{}')).toBe(true);
		expect(isInitialVariablesEntry('  [InitialVariables]', '{}')).toBe(true);
		expect(isInitialVariablesEntry('anything', '@@initial_variables\n{"a":1}')).toBe(true);
		expect(isInitialVariablesEntry('plain', 'plain content')).toBe(false);
		expect(isInitialVariablesEntry('', '')).toBe(false);
	});

	test('title mentions mid-text do not qualify', () => {
		expect(isInitialVariablesEntry('see [InitialVariables] spec', 'x')).toBe(false);
	});
});

describe('parseInitialVariables', () => {
	test('flat JSON object maps scalars to strings', () => {
		const r = parseInitialVariables('{"affection": 50, "name": "hakimi", "met": true}');
		expect(r).toEqual({ ok: true, vars: { affection: '50', name: 'hakimi', met: 'true' } });
	});

	test('nested trees flatten to dotted paths; arrays freeze to JSON strings', () => {
		const r = parseInitialVariables(
			'{"hakimi": {"affection": 0, "tags": ["a", "b"]}, "world": {"stage": 1}}'
		);
		expect(r).toEqual({
			ok: true,
			vars: {
				'hakimi.affection': '0',
				'hakimi.tags': '["a","b"]',
				'world.stage': '1'
			}
		});
	});

	test('decorator line is stripped before parsing', () => {
		const r = parseInitialVariables('@@initial_variables\n{"stage": 2}');
		expect(r).toEqual({ ok: true, vars: { stage: '2' } });
	});

	test('null and undefined-valued keys are dropped, not stringified', () => {
		const r = parseInitialVariables('{"keep": 1, "drop": null}');
		expect(r).toEqual({ ok: true, vars: { keep: '1' } });
	});

	test('YAML bodies are refused by name, not failed as broken JSON', () => {
		const r = parseInitialVariables('hakimi:\n  affection: 0\n  status: normal');
		expect(r).toEqual({ ok: false, error: 'yaml-unsupported' });
	});

	test('JSON-shaped bodies that fail to parse say invalid-json', () => {
		expect(parseInitialVariables('{"broken": ')).toEqual({ ok: false, error: 'invalid-json' });
	});

	test('non-object roots are rejected', () => {
		expect(parseInitialVariables('[1, 2]')).toEqual({ ok: false, error: 'not-an-object' });
		expect(parseInitialVariables('42')).toEqual({ ok: false, error: 'not-an-object' });
		expect(parseInitialVariables('   ')).toEqual({ ok: false, error: 'empty' });
	});
});
