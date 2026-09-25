<script lang="ts">
	import {
		generalSettingsStore,
		type InputHistoryScope,
		type TranscriptLoadMode
	} from '$lib/stores/general-settings.svelte';
	import { inputHistoryStore } from '$lib/stores/inputHistory.svelte';
	import { viewport } from '$lib/stores/viewport.svelte';
	import InfoTip from '$lib/components/ui/InfoTip.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import PillRow from '$lib/components/ui/PillRow.svelte';
	import { MOD_KEY } from '$lib/components/ui/ShortcutsSheet.svelte';
	import { toggleRow } from '$lib/actions/toggleRow';

	import { i18n } from '$lib/i18n/i18n.svelte';

	const SCOPE_OPTIONS: { value: InputHistoryScope; label: string }[] = $derived([
		{ value: 'global', label: i18n.t('gen.scopeAll') },
		{ value: 'chat', label: i18n.t('gen.scopeChat') }
	]);

	const LOAD_MODE_OPTIONS: { value: TranscriptLoadMode; label: string }[] = $derived([
		{ value: 'scroll', label: i18n.t('gen.loadScroll') },
		{ value: 'button', label: i18n.t('gen.loadButton') }
	]);

	let saveDrafts = $derived(generalSettingsStore.saveDrafts);
	let inputHistory = $derived(generalSettingsStore.inputHistory);
	let historyScope = $derived(generalSettingsStore.inputHistoryScope);
	let historyLimit = $derived(generalSettingsStore.inputHistoryLimit);
	let historyCount = $derived(inputHistoryStore.entries.length);
	let transcriptPaging = $derived(generalSettingsStore.transcriptPaging);
	let transcriptPageSize = $derived(generalSettingsStore.transcriptPageSize);
	let transcriptLoadMode = $derived(generalSettingsStore.transcriptLoadMode);
	let followStream = $derived(generalSettingsStore.followStream);
	let autoExpandReasoning = $derived(generalSettingsStore.autoExpandReasoning);
	let assistantLauncher = $derived(generalSettingsStore.assistantLauncher);
	let libraryOpenChatRow = $derived(generalSettingsStore.libraryOpenChatRow);
	let settingsSplitView = $derived(generalSettingsStore.settingsSplitView);
	let storyMapWheelPans = $derived(generalSettingsStore.storyMapWheelPans);

	let clearing = $state(false);

	function handleHistoryLimit(event: Event): void {
		const input = event.target as HTMLInputElement;
		const value = Number(input.value);
		if (!Number.isFinite(value)) return;
		generalSettingsStore.setInputHistoryLimit(value);
		// The store clamps; reflect the value that actually stuck.
		input.value = String(generalSettingsStore.inputHistoryLimit);
	}

	function handlePageSize(event: Event): void {
		const input = event.target as HTMLInputElement;
		const value = Number(input.value);
		if (!Number.isFinite(value)) return;
		generalSettingsStore.setTranscriptPageSize(value);
		// The store clamps; reflect the value that actually stuck.
		input.value = String(generalSettingsStore.transcriptPageSize);
	}

	async function clearHistory(): Promise<void> {
		if (clearing) return;
		clearing = true;
		try {
			await inputHistoryStore.clearAll();
		} finally {
			clearing = false;
		}
	}
</script>

<div class="general">
	<section class="card" data-setting="message-drafts">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.draftsTitle')}</span>
			<InfoTip
				text={i18n.t('gen.draftsTip')}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.draftsToggle')}</span>
			<Toggle
				checked={saveDrafts}
				onchange={(v) => generalSettingsStore.setSaveDrafts(v)}
				label={i18n.t('lbl.saveDrafts')}
			/>
		</div>
	</section>

	<section class="card" data-setting="input-history">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.historyTitle')}</span>
			<InfoTip
				text={i18n.t('gen.historyTip')}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.historyToggle')}</span>
			<Toggle
				checked={inputHistory}
				onchange={(v) => generalSettingsStore.setInputHistory(v)}
				label={i18n.t('lbl.recallSent')}
			/>
		</div>

		{#if inputHistory}
			<div class="sub">
				<span class="section-label">{i18n.t('gen.recall')}</span>
				<div class="row-block">
					<span class="slider-label">{i18n.t('gen.recallFrom')}</span>
					<PillRow
						options={SCOPE_OPTIONS}
						current={historyScope}
						onpick={(v) => generalSettingsStore.setInputHistoryScope(v as InputHistoryScope)}
						label={i18n.t('lbl.recallFrom')}
					/>
				</div>
				<div class="row-block">
					<label for="history-limit" class="slider-label">{i18n.t('gen.maxEntries')}</label>
					<input
						id="history-limit"
						class="input-base limit-input"
						type="number"
						min="10"
						max="1000"
						value={historyLimit}
						onchange={handleHistoryLimit}
					/>
				</div>
				<div class="history-clear-row">
					<button
						type="button"
						class="history-clear-btn"
						onclick={clearHistory}
						disabled={clearing || historyCount === 0}
					>
						{i18n.t('gp.t18')}
					</button>
					<span class="text-xs font-ui text-text-muted">
						{historyCount} {historyCount === 1 ? 'entry' : 'entries'} stored
					</span>
				</div>
			</div>
		{/if}
	</section>

	<section class="card" data-setting="reasoning">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.reasoningTitle')}</span>
			<InfoTip
				text={i18n.t('gen.reasoningTip')}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.reasoningToggle')}</span>
			<Toggle
				checked={autoExpandReasoning}
				onchange={(v) => generalSettingsStore.setAutoExpandReasoning(v)}
				label={i18n.t('lbl.autoExpandReasoning')}
			/>
		</div>
	</section>

	<section class="card" data-setting="long-chats">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.longChatsTitle')}</span>
			<InfoTip
				text={i18n.t('gen.longChatsTip')}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.longChatsToggle')}</span>
			<Toggle
				checked={transcriptPaging}
				onchange={(v) => generalSettingsStore.setTranscriptPaging(v)}
				label={i18n.t('lbl.loadLongChats')}
			/>
		</div>

		{#if transcriptPaging}
			<div class="sub">
				<span class="section-label">{i18n.t('gen.loading')}</span>
				<div class="row-block">
					<label for="transcript-page-size" class="slider-label">{i18n.t('gen.turnsPerLoad')}</label>
					<input
						id="transcript-page-size"
						class="input-base limit-input"
						type="number"
						min="10"
						max="1000"
						value={transcriptPageSize}
						onchange={handlePageSize}
					/>
				</div>
				<div class="row-block">
					<span class="slider-label">{i18n.t('gen.earlierArrive')}</span>
					<PillRow
						options={LOAD_MODE_OPTIONS}
						current={transcriptLoadMode}
						onpick={(v) => generalSettingsStore.setTranscriptLoadMode(v as TranscriptLoadMode)}
						label={i18n.t('lbl.earlierArrive')}
					/>
				</div>
			</div>
		{/if}
	</section>

	<section class="card" data-setting="autoscroll">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.autoscrollTitle')}</span>
			<InfoTip
				text={i18n.t('gen.autoscrollTip')}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.autoscrollToggle')}</span>
			<Toggle
				checked={followStream}
				onchange={(v) => generalSettingsStore.setFollowStream(v)}
				label={i18n.t('lbl.followStream')}
			/>
		</div>
	</section>

	<section class="card" data-setting="assistant-button">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.assistantTitle')}</span>
			<InfoTip
				text={i18n.t('gen.assistantTip', { mod: MOD_KEY })}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.assistantToggle')}</span>
			<Toggle
				checked={assistantLauncher}
				onchange={(v) => generalSettingsStore.setAssistantLauncher(v)}
				label={i18n.t('lbl.assistantButton')}
			/>
		</div>
	</section>

	<section class="card" data-setting="library-open-chat">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.libraryTitle')}</span>
			<InfoTip
				text={i18n.t('gen.libraryTip')}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.libraryToggle')}</span>
			<Toggle
				checked={libraryOpenChatRow}
				onchange={(v) => generalSettingsStore.setLibraryOpenChatRow(v)}
				label={i18n.t('lbl.showChatIdentity')}
			/>
		</div>
	</section>

	<section class="card" data-setting="story-map-scroll">
		<div class="card-head">
			<span class="card-title">{i18n.t('gen.storymapTitle')}</span>
			<InfoTip
				text={i18n.t('gen.storymapTip', { mod: MOD_KEY })}
			/>
		</div>
		<div class="toggle-row" use:toggleRow>
			<span class="slider-label">{i18n.t('gen.storymapToggle')}</span>
			<Toggle
				checked={storyMapWheelPans}
				onchange={(v) => generalSettingsStore.setStoryMapWheelPans(v)}
				label={i18n.t('lbl.scrollPansMap')}
			/>
		</div>
	</section>

		<!-- Split view only exists at dock widths (≥76rem): below that Settings is
		     a single centered overlay and the toggle would be inert, so don't pretend
		     it works (the panel is a plain drill-down there). -->
		{#if viewport.canDockSettings}
			<section class="card" data-setting="split-view">
				<div class="card-head">
					<span class="card-title">{i18n.t('gen.panelTitle')}</span>
					<InfoTip
						text={i18n.t('gen.panelTip')}
					/>
				</div>
				<div class="toggle-row" use:toggleRow>
					<span class="slider-label">{i18n.t('gen.panelToggle')}</span>
					<Toggle
						checked={settingsSplitView}
						onchange={(v) => generalSettingsStore.setSettingsSplitView(v)}
						label={i18n.t('lbl.splitView')}
					/>
				</div>
			</section>
		{/if}
</div>

<style>
	.general {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	/* Labeled sub-group inside a card (Recall): a quiet seam + micro label. */
	.sub {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.9rem;
		padding-top: 0.8rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border-subtle) 45%, transparent);
	}

	.row-block {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.limit-input {
		width: 100%;
		padding: 0.45rem 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		color: var(--color-text-primary);
	}

	.history-clear-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}

	.history-clear-btn {
		padding: 0.45rem 0.8rem;
		border-radius: var(--radius-md);
		border: 1px solid color-mix(in srgb, var(--color-error) 45%, var(--color-border));
		background: transparent;
		color: var(--color-error);
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 0.78rem;
		cursor: pointer;
		transition: background-color 120ms ease;
	}

	.history-clear-btn:hover:not(:disabled) {
		background: color-mix(in srgb, var(--color-error) 12%, transparent);
	}

	.history-clear-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
