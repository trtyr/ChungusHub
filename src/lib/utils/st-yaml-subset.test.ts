/**
 * P015 档1a YAML fallback (P018-goal): the zero-dependency YAML subset parser.
 * Covers the shapes card authors actually write for a variable seed, and (just as
 * important) refuses shapes it cannot read confidently instead of half-parsing.
 */
import { describe, test, expect } from 'bun:test';

import { parseYamlSubset } from './st-yaml-subset';

describe('parseYamlSubset (P015 档1a YAML fallback)', () => {
	test('a nested seed with scalars, quotes, lists and comments parses to a tree', () => {
		const yaml = [
			'# Hakimi seed',
			'hakimi:',
			'  affection: 0',
			'  mood: warm',
			'  title: "Lady \'Kimi"   # quoted with an escaped-looking quote',
			'tags:',
			'  - alpha',
			'  - beta',
			'count: 3'
		].join('\n');
		const r = parseYamlSubset(yaml);
		expect(r).toEqual({
			ok: true,
			data: {
				hakimi: { affection: 0, mood: 'warm', title: "Lady 'Kimi" },
				tags: ['alpha', 'beta'],
				count: 3
			}
		});
	});

	test('quoted keys and single-quoted values lose their quotes', () => {
		const r = parseYamlSubset("'mood': 'warm'\n\"flag\": true");
		expect(r).toEqual({ ok: true, data: { mood: 'warm', flag: true } });
	});

	test('null-ish and bareword scalars', () => {
		const r = parseYamlSubset('a: null\nb: ~\nc: maybe\nd: false');
		expect(r).toEqual({ ok: true, data: { a: null, b: null, c: 'maybe', d: false } });
	});

	test('tabs in indentation are refused, never guessed', () => {
		expect(parseYamlSubset('a:\n\tb: 1')).toEqual({ ok: false, error: 'yaml-invalid' });
	});

	test('flow collections are refused: JSON already had its chance', () => {
		expect(parseYamlSubset('{a: 1}')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('[1, 2]')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('a: {nested: flow}')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('a: [1, 2]')).toEqual({ ok: false, error: 'yaml-invalid' });
	});

	test('block scalars are refused rather than half-read', () => {
		expect(parseYamlSubset('a: |\n  text')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('a: >\n  folded')).toEqual({ ok: false, error: 'yaml-invalid' });
	});

	test('mapping entries without the `: ` shape are refused', () => {
		expect(parseYamlSubset('novalue')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('tight:value')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset(': justakey')).toEqual({ ok: false, error: 'yaml-invalid' });
	});

	test('multi-document streams and empty bodies are refused', () => {
		expect(parseYamlSubset('---\na: 1')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('# only a comment\n\n')).toEqual({ ok: false, error: 'yaml-empty' });
	});

	test('the parsed tree flattens to the same dotted paths JSON seeds produce', () => {
		// End-to-end shape contract: parseInitialVariables consumes this parser's
		// output, so a YAML seed and its JSON twin must flatten identically.
		const r = parseYamlSubset('hakimi:\n  affection: 50');
		expect(r).toEqual({ ok: true, data: { hakimi: { affection: 50 } } });
	});
});

describe('CRLF input and anchors/aliases (auditor findings)', () => {
	test('CRLF line endings parse identically to LF, end to end', () => {
		const r = parseYamlSubset('hakimi:\r\n  affection: 0\r\n  status: normal\r\n');
		expect(r).toEqual({ ok: true, data: { hakimi: { affection: 0, status: 'normal' } } });
	});

	test('anchors and aliases are refused, not stored as mystery strings', () => {
		expect(parseYamlSubset('a: &anchor 1')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('a: *ref')).toEqual({ ok: false, error: 'yaml-invalid' });
		expect(parseYamlSubset('list:\n  - &item x')).toEqual({ ok: false, error: 'yaml-invalid' });
	});
});
