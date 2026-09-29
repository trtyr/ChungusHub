<script lang="ts">
	/**
	 * Inline badge for SillyTavern extension-card markers on a lorebook entry
	 * (P015 档0): distinguishes the Prompt-Template dialect (EJS blocks, entry-title
	 * injection syntax) from TavernHelper script cards, with a shared hint that the
	 * content degrades to static text for the model. Purely informational: the
	 * entry's data is never touched.
	 */
	import { i18n } from '$lib/i18n/i18n.svelte';
	import { detectStMarkers } from '$lib/utils/st-markers';

	interface Props {
		title?: string;
		content?: string;
	}
	let { title = '', content = '' }: Props = $props();

	let hits = $derived(detectStMarkers(`${title}\n${content}`));
	let label = $derived(
		hits.tavernHelper
			? i18n.t('st.badgeScript')
			: hits.ejs
				? i18n.t('st.badgeEjs')
				: hits.inject
					? i18n.t('st.badgeInject')
					: hits.decorator
						? i18n.t('st.badgeDecorator')
						: ''
	);
</script>

{#if label}
	<span class="st-badge" title={i18n.t('st.badgeHint')}>{label}</span>
{/if}

<style>
	.st-badge {
		flex: none;
		font-size: 0.6875rem;
		line-height: 1;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		border: 1px solid var(--color-accent);
		color: var(--color-accent);
		opacity: 0.8;
		white-space: nowrap;
		user-select: none;
	}
</style>
