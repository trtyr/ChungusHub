<script lang="ts">
	import { i18n } from '$lib/i18n/i18n.svelte';
	import { varsStore } from '$lib/stores/vars.svelte';

	/** The read-only state of the variable system: the globals and every chat's local
	 *  table. Pick pins (__pick::*) are ST-internal bookkeeping, folded into a count. */

	const chatBuckets = $derived(
		Object.entries(varsStore.byChat).filter(([, rows]) => Object.keys(rows).length > 0)
	);

	function rowsOf(rows: Record<string, string>): [string, string][] {
		return Object.entries(rows).filter(([key]) => !key.startsWith('__pick::'));
	}

	function picksOf(rows: Record<string, string>): number {
		return Object.keys(rows).filter((key) => key.startsWith('__pick::')).length;
	}

	let loaded = $state(false);
	$effect(() => {
		if (!loaded) {
			loaded = true;
			void varsStore.load();
		}
	});
</script>

<section class="vi" data-setting="prompt-builder">
	<h3 class="vi-title">{i18n.t('vi.title')}</h3>
	{#if Object.keys(varsStore.globalVars).length === 0 && chatBuckets.length === 0}
		<p class="vi-empty">{i18n.t('vi.empty')}</p>
	{:else}
		<div class="vi-block">
			<h4 class="vi-heading">{i18n.t('vi.globals')}</h4>
			<dl class="vi-table">
				{#each rowsOf(varsStore.globalVars) as [name, value] (name)}
					<dt>{name}</dt>
					<dd>{value}</dd>
				{/each}
			</dl>
		</div>
		{#each chatBuckets as [chatId, rows] (chatId)}
			<div class="vi-block">
				<h4 class="vi-heading">{i18n.t('vi.chat')} · {chatId.slice(0, 8)}</h4>
				<dl class="vi-table">
					{#each rowsOf(rows) as [name, value] (name)}
						<dt>{name}</dt>
						<dd>{value}</dd>
					{/each}
				</dl>
				{#if picksOf(rows) > 0}
					<p class="vi-picks">{i18n.t('vi.picksN', { n: picksOf(rows) })}</p>
				{/if}
			</div>
		{/each}
	{/if}
</section>

<style>
	.vi {
		margin-top: 1rem;
		border-top: 1px solid var(--line-dim);
		padding-top: 0.75rem;
	}
	.vi-title {
		font-size: 0.8rem;
		font-weight: 600;
		opacity: 0.7;
	}
	.vi-empty {
		font-size: 0.75rem;
		opacity: 0.5;
	}
	.vi-block {
		margin-top: 0.5rem;
	}
	.vi-heading {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		opacity: 0.55;
	}
	.vi-table {
		display: grid;
		grid-template-columns: minmax(6rem, max-content) 1fr;
		gap: 0 0.75rem;
		font-size: 0.75rem;
	}
	.vi-table dt {
		font-family: var(--font-mono, monospace);
		opacity: 0.8;
		word-break: break-all;
	}
	.vi-table dd {
		word-break: break-word;
		white-space: pre-wrap;
	}
	.vi-picks {
		font-size: 0.7rem;
		opacity: 0.45;
		margin-top: 0.25rem;
	}
</style>
