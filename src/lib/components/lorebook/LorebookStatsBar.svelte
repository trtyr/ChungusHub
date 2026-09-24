<script lang="ts">
	/**
	 * The open book's foot, wearing the shape the two library editors wear (`.editor-stats`,
	 * app.css): what this book holds, counted live off the book itself. The token figure is
	 * an upper bound on purpose: what a turn injects is the scan's per-turn decision, and a
	 * real answer is what the Test scan strip is for (architecture/lorebook.md).
	 */
	import { countTokens } from '$lib/tokenizer';
	import { i18n } from '$lib/i18n/i18n.svelte';
	import { llmService } from '$lib/services/llm/provider';
	import { partitionEntries, type Lorebook } from '$lib/lorebook/types';

	let { book }: { book: Lorebook } = $props();

	let parts = $derived(partitionEntries(book.entries));

	/** The natures, spelled out only where the book holds more than one of them: "3 entries ·
	 *  3 keyword" says the same number twice. */
	let composition = $derived(
		[
			{ label: i18n.t('lb.alwaysActive'), count: parts.alwaysActive.length },
			{ label: i18n.t('lb.keywords'), count: parts.keyword.length },
			{ label: i18n.t('lb.off'), count: parts.disabled.length }
		].filter((part) => part.count > 0)
	);

	/** Every key that can wake something in here, primary and secondary alike, counted per
	 *  entry rather than deduped: two entries listening for one word are two ways in. */
	let keys = $derived(book.entries.reduce((n, e) => n + e.key.length + e.keysecondary.length, 0));

	// The model the library editors' feet price under too, so one editor family shares one
	// tokenizer. Cached per entry by content: a keystroke re-prices one entry, not the book.
	let model = $derived(llmService.getPrimaryModel());
	let priced = new Map<string, { content: string; model: string; count: number }>();
	let tokens = $derived.by(() => {
		const next = new Map<string, { content: string; model: string; count: number }>();
		let total = 0;
		for (const e of book.entries) {
			if (e.disable) continue;
			const hit = priced.get(e.id);
			const row =
				hit && hit.content === e.content && hit.model === model
					? hit
					: { content: e.content, model, count: countTokens(e.content, model) };
			next.set(e.id, row);
			total += row.count;
		}
		priced = next;
		return total;
	});

	function num(value: number): string {
		return value.toLocaleString();
	}
</script>

<div class="editor-stats">
	<span class="editor-stat">
		<b>{num(book.entries.length)}</b>
		{i18n.t('lb.entriesN', { n: book.entries.length })}
	</span>
	{#if composition.length > 1}
		{#each composition as part (part.label)}
			<span class="editor-stat"><b>{num(part.count)}</b> {part.label}</span>
		{/each}
	{/if}
	{#if keys > 0}
		<span class="editor-stat"><b>{num(keys)}</b> {i18n.t('lb.keywordsN', { n: keys })}</span>
	{/if}
	<span
		class="editor-stat"
		title={i18n.t('lb.statsTip')}
	>
		<b>{i18n.t('lb.tokensN', { n: tokens })}</b>
	</span>
</div>
