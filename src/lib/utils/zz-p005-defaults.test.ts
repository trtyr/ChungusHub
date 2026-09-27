/**
 * P005 contract: the shipped defaults are 1M context / 65535 response. Constants only —
 * the assemble-level "long chat is not false-trimmed" leg lives in
 * prompt-assembly.test.ts (it needs the warmed assembly imports). `bun test`.
 */
import { describe, expect, test } from 'bun:test';

import { DEFAULT_CONTEXT_SIZE, DEFAULT_GENERATION_SETTINGS } from '../types/llm';

describe('P005 shipped defaults', () => {
	test('1M context and 65535 response budget', () => {
		expect(DEFAULT_CONTEXT_SIZE).toBe(1048576);
		expect(DEFAULT_GENERATION_SETTINGS.maxTokens).toBe(65535);
	});
});
