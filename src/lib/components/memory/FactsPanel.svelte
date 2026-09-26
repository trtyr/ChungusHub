<script lang="ts">
	/**
	 * The fact board panel (P006 W4): the chat's facts as the reader sees them. Standing
	 * facts on the active path, the dormant ones kept apart (they come back on a revert,
	 * so they are shown, not hidden), inline edit, pin, and soft delete. Reads the shared
	 * facts store, the same cache the prompt tail assembles from.
	 */
	import { i18n } from '$lib/i18n/i18n.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { factsStore } from '$lib/memory/facts.svelte';
	import { activeFacts, type ChatFact } from '$lib/memory/facts';
	interface Props {
		chatId: string;
		/** The active path's message slice (ids are all the derivation needs). */
		path: Array<{ id: string; parentId: string | null }>;
	}

	let { chatId, path }: Props = $props();

	let editingId = $state<string | null>(null);
	let draft = $state('');

	$effect(() => {
		if (chatId) void factsStore.ensure(chatId);
	});

	const all = $derived(factsStore.factsOf(chatId));
	const standing = $derived(activeFacts(all, path));
	const standingIds = $derived(new Set(standing.map((f) => f.id)));
	// Dormant = rows whose anchors are off the current path: the 待消解 zone. They stand
	// again the moment a revert walks back onto them.
	const dormant = $derived(all.filter((f) => !standingIds.has(f.id) && !f.pinned));
	// The newest write cluster is the last extraction's contribution: the change view.
	const newestAt = $derived(Math.max(0, ...all.map((f) => f.createdAt ?? 0)));
	const isNew = (f: ChatFact) => (f.createdAt ?? 0) >= newestAt && newestAt > 0;

	function startEdit(f: ChatFact) {
		editingId = f.id;
		draft = f.value;
	}

	async function saveEdit(f: ChatFact) {
		const value = draft.trim();
		editingId = null;
		if (!value || value === f.value) return;
		try {
			await factsStore.editValue(chatId, f.id, value);
		} catch (error) {
			toastStore.error(i18n.t('mem.factsFail', { error: String(error) }));
		}
	}

	async function togglePin(f: ChatFact) {
		try {
			await factsStore.pin(chatId, f.id, !f.pinned);
		} catch (error) {
			toastStore.error(i18n.t('mem.factsFail', { error: String(error) }));
		}
	}

	async function removeFact(f: ChatFact) {
		try {
			await factsStore.remove(chatId, f.id);
		} catch (error) {
			toastStore.error(i18n.t('mem.factsFail', { error: String(error) }));
		}
	}
</script>

<div class="facts-panel">
	{#if all.length === 0}
		<p class="facts-empty">{i18n.t('mem.factsEmpty')}</p>
	{:else}
		<p class="facts-hint">{i18n.t('mem.factsHint', { n: standing.length, total: all.length })}</p>
		{#each standing as f (f.id)}
			<div class="fact-row" class:fact-new={isNew(f)} class:fact-pinned={f.pinned}>
				<div class="fact-main">
					<span class="fact-entity">{f.entity}</span>
					<span class="fact-key">{f.key}</span>
					{#if editingId === f.id}
						<textarea
							class="fact-edit"
							bind:value={draft}
							rows="2"
							onkeydown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									void saveEdit(f);
								}
							}}
						></textarea>
						<div class="fact-actions">
							<button type="button" class="fact-btn" onclick={() => void saveEdit(f)}>{i18n.t('common.save')}</button>
							<button type="button" class="fact-btn" onclick={() => (editingId = null)}>{i18n.t('common.cancel')}</button>
						</div>
					{:else}
						<span class="fact-value">{f.value}</span>
						<div class="fact-actions">
							{#if isNew(f)}<span class="fact-badge">{i18n.t('mem.factsNew')}</span>{/if}
							{#if f.pinned}<span class="fact-badge fact-badge-pin">{i18n.t('mem.factsPinned')}</span>{/if}
							<button type="button" class="fact-btn" title={i18n.t('mem.factsPin')} onclick={() => void togglePin(f)}>
								<Icon name="pin" class="w-3.5 h-3.5" />
							</button>
							<button type="button" class="fact-btn" title={i18n.t('mem.factsEdit')} onclick={() => startEdit(f)}>
								<Icon name="pencil" class="w-3.5 h-3.5" />
							</button>
							<button type="button" class="fact-btn" title={i18n.t('common.remove')} onclick={() => void removeFact(f)}>
								<Icon name="trash" class="w-3.5 h-3.5" />
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/each}
		{#if dormant.length > 0}
			<details class="facts-dormant">
				<summary>{i18n.t('mem.factsDormant', { n: dormant.length })}</summary>
				{#each dormant as f (f.id)}
					<div class="fact-row fact-dormant-row">
						<span class="fact-entity">{f.entity}</span>
						<span class="fact-key">{f.key}</span>
						<span class="fact-value">{f.value}</span>
						<div class="fact-actions">
							<button type="button" class="fact-btn" title={i18n.t('common.remove')} onclick={() => void removeFact(f)}>
								<Icon name="trash" class="w-3.5 h-3.5" />
							</button>
						</div>
					</div>
				{/each}
			</details>
		{/if}
	{/if}
</div>

<style>
	.facts-panel {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.85rem;
	}
	.facts-empty,
	.facts-hint {
		color: var(--color-text-muted);
		margin: 0;
	}
	.fact-row {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
	}
	.fact-new {
		border-color: var(--color-accent);
	}
	.fact-pinned {
		background: color-mix(in srgb, var(--color-accent) 6%, transparent);
	}
	.fact-main {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.35rem;
	}
	.fact-entity {
		font-weight: 600;
	}
	.fact-key {
		color: var(--color-text-muted);
		font-size: 0.78rem;
	}
	.fact-value {
		flex: 1;
		min-width: 8rem;
	}
	.fact-edit {
		width: 100%;
		resize: vertical;
	}
	.fact-actions {
		display: flex;
		gap: 0.25rem;
		align-items: center;
		margin-left: auto;
	}
	.fact-btn {
		display: inline-flex;
		padding: 0.15rem;
		border: none;
		background: none;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}
	.fact-btn:hover {
		color: var(--color-text);
		background: color-mix(in srgb, var(--color-text) 8%, transparent);
	}
	.fact-badge {
		font-size: 0.7rem;
		color: var(--color-accent);
		border: 1px solid currentColor;
		border-radius: var(--radius-sm);
		padding: 0 0.3rem;
	}
	.fact-badge-pin {
		color: var(--color-text-muted);
	}
	.facts-dormant {
		color: var(--color-text-muted);
	}
	.fact-dormant-row {
		opacity: 0.75;
		margin-top: 0.4rem;
		flex-direction: row;
		align-items: baseline;
	}
</style>
