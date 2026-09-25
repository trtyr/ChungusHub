<script lang="ts">
	/**
	 * The one question duplicating a chat can't answer on its own: does the copy get the
	 * memory too? Only raised when there IS memory to carry: a chat with none is copied
	 * without asking anything (see ChatsView.handleDuplicate).
	 */
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { ChatMemoryFootprint } from '$lib/types/chat';

	interface Props {
		open: boolean;
		title: string;
		footprint: ChatMemoryFootprint;
		busy: boolean;
		onConfirm: (includeMemory: boolean) => void;
		onCancel: () => void;
	}

	let { open, title, footprint, busy, onConfirm, onCancel }: Props = $props();

	// Every stored row, across every branch, which is what the copy carries. The Memory
	// panel counts only the summaries in play on the branch you are reading, so this number
	// is usually larger; saying "across every branch" is what keeps the two from reading as
	// the same figure disagreeing with itself.
	let summary = $derived(
		footprint.episodes > 0 ? i18n.t('dup.summary', { n: footprint.episodes }) : ''
	);
</script>

<Dialog {open} onClose={onCancel} title={i18n.t('dup.title')} size="md">
	<p class="dup-lead">
		{i18n.t('dup.lead', { name: title })}
	</p>

	<div class="dup-memory">
		<div class="dup-memory-head">
			<Icon name="brain" class="w-4 h-4" />
			<span>{i18n.t('dup.hasMemory')}</span>
		</div>
		<p class="dup-memory-body">
			{#if summary}
				{i18n.t('dup.memoryHolds', { summary })}{footprint.enabled ? '' : i18n.t('dup.memoryOff')}{i18n.t('dup.period')}
			{:else}
				{i18n.t('dup.memoryEmpty')}
			{/if}
			{i18n.t('dup.question')}
		</p>
	</div>

	<div class="dup-actions">
		<Button variant="ghost" onclick={onCancel} disabled={busy}>{i18n.t('common.cancel')}</Button>
		<Button variant="secondary" onclick={() => onConfirm(false)} disabled={busy}>{i18n.t('dup.storyOnly')}</Button>
		<Button variant="primary" onclick={() => onConfirm(true)} disabled={busy}>{i18n.t('dup.withMemory')}</Button>
	</div>
</Dialog>

<style>
	.dup-lead {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
	}

	.dup-memory {
		margin-top: 0.9rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--color-bg-tertiary) 45%, transparent);
	}

	.dup-memory-head {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 700;
		color: var(--color-text-primary);
	}

	.dup-memory-body {
		margin-top: 0.3rem;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
	}

	.dup-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		margin-top: 1.2rem;
	}
</style>
