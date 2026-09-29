/**
 * bun test preload: identity-shim Svelte 5 runes so tests whose import chain merely
 * GRAZES a rune module (a pure util importing a store for one value) still run.
 *
 * This is the same discipline architecture/testing.md already documents for the
 * eight rune-store test files, lifted to a global: a shimmed rune turns classes into
 * plain classes, which is exactly right for tests that pin logic and deliberately
 * not about reactivity. `$effect` stays loudly broken: an effect firing in a test
 * is a bug, not something to swallow.
 */
interface RuneShim {
	(fn: unknown, ...rest: unknown[]): unknown;
	raw?: unknown;
}

const identity = <T>(value: T): T => value;

(globalThis as unknown as Record<string, unknown>).$state = Object.assign(identity, {
	raw: identity
}) as unknown as RuneShim;
(globalThis as unknown as Record<string, unknown>).$derived = Object.assign(identity, {
	raw: identity
}) as unknown as RuneShim;
(globalThis as unknown as Record<string, unknown>).$derivedBy = identity;
(globalThis as unknown as Record<string, unknown>).$props = () => ({});
(globalThis as unknown as Record<string, unknown>).$effect = (): never => {
	throw new Error('$effect ran in a test: side effects do not belong here.');
};
