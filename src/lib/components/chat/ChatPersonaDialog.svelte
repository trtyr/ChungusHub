<script lang="ts">
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import { i18n } from '$lib/i18n/i18n.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import { characterLibraryStore } from '$lib/stores/characterLibrary.svelte';
	import { messageStore } from '$lib/stores/messages.svelte';
	import { imageService } from '$lib/services/imageService';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { portraitFocusStyle } from '$lib/utils/portrait-focus';

	interface Props {
		open: boolean;
		onClose: () => void;
		chatId: string;
		/** The persona currently on this chat's user turns, so it can be marked active. */
		currentPersonaId: string | null;
	}

	let { open, onClose, chatId, currentPersonaId }: Props = $props();

	let personas = $derived(characterLibraryStore.personas);
	let saving = $state(false);

	async function pick(personaId: string | null): Promise<void> {
		if (saving) return;
		saving = true;
		try {
			await messageStore.setChatPersona(chatId, personaId);
			const name = personaId
				? personas.find((p) => p.id === personaId)?.identity.name?.trim() || i18n.t('lib.unnamedPersona')
				: null;
			toastStore.success(name ? i18n.t('t.relabelNow', { name }) : i18n.t('t.relabelYou'));
			onClose();
		} catch (e) {
			toastStore.failed(i18n.t('f.setPersona'), e);
		} finally {
			saving = false;
		}
	}
</script>

<Dialog {open} {onClose} title={i18n.t('chat.relabelDialogTitle')} size="md">
	<!-- The wording carries the whole weight here: the composer's persona button is centimetres
	     away and also opens a persona list, so this copy has to say what only this one does.
	     Hence the last sentence, which draws the line the other control sits on. -->
	<p class="lede font-ui">
		{i18n.t('chat.personaLede')}
	</p>
	<!-- Rebinding changes the name on the turns, not the text of the summaries already written
	     from them: memory only invalidates a summary when a turn's own content changes. Saying
	     so here is the whole fix: reaping every episode on a rename would charge a full re-read
	     for a label. -->
	<p class="lede font-ui">
		{i18n.t('chat.personaSummaries')}
	</p>

	<div class="persona-list" role="radiogroup" aria-label={i18n.t('chat.personaListAria')}>
		<button
			type="button"
			role="radio"
			aria-checked={currentPersonaId === null}
			class="persona-row"
			class:active={currentPersonaId === null}
			disabled={saving}
			onclick={() => pick(null)}
		>
			<span class="persona-avatar persona-avatar--none" aria-hidden="true">
				<Icon name="user" class="w-4 h-4" />
			</span>
			<span class="persona-name">{i18n.t('chat.personaNone')} <span class="persona-hint">{i18n.t('chat.shownAsYou')}</span></span>
			{#if currentPersonaId === null}
				<span class="persona-check"><Icon name="check" class="w-3.5 h-3.5" /></span>
			{/if}
		</button>

		{#each personas as persona (persona.id)}
			{@const thumb = imageService.thumbnailUrl(persona.identity.imageUrl)}
			<button
				type="button"
				role="radio"
				aria-checked={currentPersonaId === persona.id}
				class="persona-row"
				class:active={currentPersonaId === persona.id}
				disabled={saving}
				onclick={() => pick(persona.id)}
			>
				<span class="persona-avatar">
					{#if thumb}
						<img
							src={thumb}
							alt=""
							loading="lazy"
							style={portraitFocusStyle(persona.identity.portraitFocus)}
						/>
					{:else}
						<Icon name="user" class="w-4 h-4" />
					{/if}
				</span>
				<span class="persona-name">{persona.identity.name?.trim() || i18n.t('lib.unnamedPersona')}</span>
				{#if currentPersonaId === persona.id}
					<span class="persona-check"><Icon name="check" class="w-3.5 h-3.5" /></span>
				{/if}
			</button>
		{/each}

		{#if personas.length === 0}
			<p class="empty font-ui">{i18n.t('chat.personaEmpty')}</p>
		{/if}
	</div>
</Dialog>

<style>
	.lede {
		font-size: 0.82rem;
		color: var(--color-text-secondary);
		line-height: 1.5;
		margin-bottom: 0.9rem;
	}

	.persona-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-height: 22rem;
		overflow-y: auto;
	}

	.persona-row {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		width: 100%;
		padding: 0.5rem 0.6rem;
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		background: transparent;
		cursor: pointer;
		text-align: left;
		transition: background-color 120ms ease, border-color 120ms ease;
	}

	.persona-row:hover:not(:disabled) {
		background: var(--color-bg-tertiary);
	}

	.persona-row.active {
		border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
		background: color-mix(in srgb, var(--color-accent) 10%, transparent);
	}

	.persona-row:disabled {
		opacity: 0.55;
		cursor: default;
	}

	.persona-avatar {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		flex-shrink: 0;
		border-radius: 999px;
		overflow: hidden;
		background: var(--color-bg-tertiary);
		color: var(--color-text-muted);
	}

	.persona-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.persona-avatar--none {
		border: 1px dashed var(--color-border);
		background: transparent;
	}

	.persona-name {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.persona-hint {
		font-weight: 400;
		color: var(--color-text-muted);
	}

	.persona-check {
		display: grid;
		place-items: center;
		width: 1.35rem;
		height: 1.35rem;
		flex-shrink: 0;
		border-radius: 999px;
		background: var(--color-accent);
		color: var(--color-on-accent);
	}

	.empty {
		font-size: 0.8rem;
		color: var(--color-text-muted);
		padding: 0.5rem 0.6rem;
	}
</style>
