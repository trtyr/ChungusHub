<script lang="ts">
	import { onDestroy } from 'svelte';
	import { i18n } from '$lib/i18n/i18n.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { holdMsForBlast } from '$lib/components/ui/HoldToConfirmButton.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { memoryStore, type ChatCtx } from '$lib/memory/store.svelte';
	import { featurePromptsStore } from '$lib/stores/featurePrompts.svelte';
	import {
		chatLorebookClaim,
		chatMutedLorebookClaim,
		chatPersonaClaim,
		chatPresetClaim
	} from '$lib/utils/chat-setup';
	import OverrideMark from '$lib/components/ui/OverrideMark.svelte';
	import {
		DEFAULT_MEMORY_CONFIG,
		MEMORY_CONFIG_FIELDS,
		followsInherited,
		memorySliderMax
	} from '$lib/memory/config';
	import { countTokens } from '$lib/tokenizer';
	import { rangeReset } from '$lib/actions/rangeReset';
	import type { MemoryConfig } from '$lib/memory/types';

	// The panel always acts on the currently-open chat.
	let chat = $derived(chatStore.currentChatState?.chat ?? null);

	let enabled = $derived(memoryStore.enabled);
	let autoExtract = $derived(memoryStore.autoExtract);
	let busy = $derived(memoryStore.busy);
	let progress = $derived(memoryStore.progress);
	let lastError = $derived(memoryStore.lastError);
	/** The status line and its four standings, from the store. The TitleBar's Memory button
	 *  reads the same derivation, and two hand-kept copies of this text would part on the
	 *  first change to either. */
	let standing = $derived(memoryStore.standing);

	// Active = what applies to the branch on screen. Dormant = summaries of other branches
	// of this chat (or of turns currently inside the verbatim tail): stored, intact, and out
	// of play until the reader walks back to them. Showing the split is the whole point: a
	// reader who cannot see the dormant half has no way to tell a branch change kept it.
	let coverage = $derived(memoryStore.coverage);
	let episodes = $derived(coverage.active);
	let dormant = $derived(coverage.dormant);
	/** What the two destructive actions actually discard: every summary of the chat, dormant
	 *  branches included. The two confirms state this number and scale their hold by it. */
	let allSummaries = $derived(episodes.length + dormant.length);
	/** Turn span per episode, in the transcript's own #N numbering. */
	let ranges = $derived(memoryStore.episodeRanges);
	/** The three bands of this path, summing to its length: summarised, queued, still raw. */
	let shape = $derived(memoryStore.composition);
	let pending = $derived(memoryStore.pending);
	let config = $derived(memoryStore.config);
	let memoryMacroPresent = $derived(memoryStore.macroPlaced);
	/** A pass would spend a model call right now: what makes "Up to date" a lie. Asked of the
	 *  store, not derived from `pending >= batchSize`: a hole left by a deleted turn is
	 *  narrower than a batch and still foldable. */
	let behind = $derived(memoryStore.canSummarise);
	/** Merges the layer caps owe with no new batch involved: what a dragged-down slider costs. */
	let owedMerges = $derived(memoryStore.pendingPromotions);

	/** The action button names the work in front of it, and its count is the same figure the
	 *  bar below prints as Waiting. When the only thing owed is merges that figure is zero and
	 *  the number switches unit, so the label switches with it rather than putting a count of
	 *  merges behind the word "waiting". */
	let summariseLabel = $derived.by(() => {
		if (!behind) return i18n.t('mem.waiting');
		if (pending > 0) return i18n.t('mem.waitingN', { n: pending });
		return i18n.t('mem.mergeN', { n: owedMerges });
	});

	// Oldest first: the episode list is the story in order, and reading it top-down should
	// read the story forward. Higher layers carry the timestamp of the span they replaced
	// (server memApplyPromotion), so one chronological sort places every layer correctly.
	let timeline = $derived(
		[...episodes].sort((a, b) => a.createdAt - b.createdAt).map((e, i) => ({ ...e, n: i + 1 }))
	);
	let merged = $derived(episodes.filter((e) => e.layer > 0).length);
	/** "2 raw · 1 merged · 1 merged ×2", the ladder's shape. It rides the footer's tooltip
	 *  rather than the line itself: depth matters when tuning the layer sliders and to nobody
	 *  else, and spelled out on screen it crowded out the figure it was qualifying. */
	let ladder = $derived.by(() => {
		const map = new Map<number, number>();
		for (const e of episodes) map.set(e.layer, (map.get(e.layer) ?? 0) + 1);
		return [...map.entries()]
			.sort((a, b) => a[0] - b[0])
			.map(([l, n]) => (l === 0 ? `${n} raw` : l === 1 ? `${n} merged` : `${n} merged ×${l}`))
			.join(' · ');
	});
	let showDormant = $state(false);

	// What the model is actually handed. The single most useful thing this panel can show:
	// everything else here is a proxy for it.
	let recallText = $derived(memoryStore.recall);
	let recallTokens = $derived(recallText ? countTokens(recallText) : 0);
	let showRecall = $state(false);

	function ctx(): ChatCtx | null {
		const state = chatStore.currentChatState;
		if (!state) return null;
		return {
			chatId: state.chat.id,
			allMessages: state.allMessages,
			leafId: state.chat.activeLeafId,
			characterId: state.chat.characterId,
			characterVersionId: state.chat.characterVersionId,
			personaId: chatPersonaClaim(state.chat),
			presetId: chatPresetClaim(state.chat),
			lorebookIds: chatLorebookClaim(state.chat),
			mutedLorebookIds: chatMutedLorebookClaim(state.chat)
		};
	}

	// Every action that spends model calls says how many first, past a handful. The number is
	// captured when the dialog opens so it can't drift under the reader while they decide.
	const CONFIRM_ABOVE = 3;
	type Work = { extractions: number; promotions: number; total: number };
	let quoted = $state<Work>({ extractions: 0, promotions: 0, total: 0 });

	/** "12 passes over the story and 3 merges". Merges only appear when there are any. */
	function priceOf(w: Work): string {
		const passes = i18n.t('mem.passesStory', { n: w.extractions });
		if (w.promotions === 0) return passes;
		return `${passes} and ${w.promotions} ${w.promotions === 1 ? 'merge' : 'merges'} of older summaries`;
	}

	let enableConfirmOpen = $state(false);

	/** Exported: MemoryPanel's header switch drives the same flow as the intro's
	 *  enable button, so the cost confirm below guards every door. */
	export async function requestToggle() {
		const c = ctx();
		if (!c) return;
		if (enabled) {
			await memoryStore.disable(c.chatId);
			return;
		}
		// Enabling reads the whole backlog, one paid call per batch and per merge. On a long
		// imported thread that is dozens of sequential calls, so say the number before spending it.
		quoted = memoryStore.plannedWork;
		if (quoted.total >= CONFIRM_ABOVE) enableConfirmOpen = true;
		else await startEnable(c);
	}

	async function confirmEnable() {
		enableConfirmOpen = false;
		const c = ctx();
		if (c) await startEnable(c);
	}

	/** enable() refuses a template that has lost a macro it cannot work without, and these are
	 *  DOM handlers, so the rejected promise they return goes nowhere. Enabling simply looked
	 *  like it did nothing at all: no toast, no error, no state change. */
	async function startEnable(c: ChatCtx) {
		try {
			await memoryStore.enable(c);
		} catch (e) {
			toastStore.failed(i18n.t('f.memoryOn'), e);
		}
	}

	// The waiting-turns pass is uncapped by design (it is the "do it now" button), so it is
	// priced and confirmed exactly like enabling. Left unpriced it was the cheapest-looking way
	// to spend a hundred calls in the app.
	let summariseConfirmOpen = $state(false);
	async function summarise() {
		const c = ctx();
		if (!c) return;
		quoted = memoryStore.plannedWork;
		if (quoted.total >= CONFIRM_ABOVE) summariseConfirmOpen = true;
		else await memoryStore.build(c);
	}

	async function confirmSummarise() {
		summariseConfirmOpen = false;
		const c = ctx();
		if (c) await memoryStore.build(c);
	}

	async function toggleAutoExtract() {
		if (chat) await memoryStore.setAutoExtract(chat.id, !autoExtract);
	}

	let rebuildConfirmOpen = $state(false);
	function askRebuild() {
		// A rebuild discards everything first, so it always costs the whole path, never the
		// smaller number the waiting-turns pass would quote.
		quoted = memoryStore.plannedRebuildWork;
		rebuildConfirmOpen = true;
	}
	async function rebuild() {
		rebuildConfirmOpen = false;
		const c = ctx();
		if (!c) return;
		await memoryStore.rebuild(c);
	}

	let forgetConfirmOpen = $state(false);
	async function forget() {
		forgetConfirmOpen = false;
		if (chat) await memoryStore.forget(chat.id);
	}

	// ===== Episode editing =====
	// Episodes are the whole store, so a single bad summary has to be fixable in place.
	// There is deliberately no delete: removing an episode would uncover its messages
	// while the cursor stayed past them, which is the one gap the engine must never have.
	let editingId = $state<string | null>(null);
	let editingText = $state('');
	function startEdit(e: { id: string; content: string }) {
		editingId = e.id;
		editingText = e.content;
	}
	async function saveEpisode() {
		if (!editingText.trim()) return; // empty is not a save: stay in edit mode
		if (chat && editingId) await memoryStore.editEpisode(chat.id, editingId, editingText);
		editingId = null;
	}

	// ===== Settings =====
	// The five sliders come from config.ts, shared with the app-wide defaults on the Engines
	// page: two hand-kept copies of the same rows part on the first change to either.
	let showSettings = $state(false);

	// Sliders read from `draft` while dragging and from the store otherwise, and commit on
	// RELEASE. Committing per drag tick fired one server write (and one cross-device sync
	// broadcast) per pixel, through a read-merge-write with no ordering between them, so
	// the value that landed was whichever round trip finished last, not the one released on.
	let draft = $state<Partial<Record<keyof MemoryConfig, number>>>({});
	function shown(key: keyof MemoryConfig): number {
		return draft[key] ?? config[key];
	}
	function drag(key: keyof MemoryConfig, value: number) {
		draft = { ...draft, [key]: value };
	}
	async function commit(key: keyof MemoryConfig, value: number) {
		draft = { ...draft, [key]: undefined };
		if (!chat) return;
		// Against the STORED value, not the clamped one. `config` is post-clamp, so releasing a
		// slider on a value the clamp itself produced (promoteCount pinned to maxPerLayer) read
		// as "no change" and writes nothing, leaving the stored number to resurface the
		// moment the clamping limit is raised.
		if (memoryStore.configOverride?.[key] === value) return;
		await memoryStore.updateConfig(chat.id, { [key]: value } as Partial<MemoryConfig>);
	}

	/** Against the DRAFT maxPerLayer, so dragging that slider narrows this one as it moves. */
	function sliderMax(key: keyof MemoryConfig): number {
		return memorySliderMax(key, shown('maxPerLayer'));
	}

	/** Double-click reaches the layer under this one, which for a chat is your Starting
	 *  defaults, not the shipped number: that card is where these numbers came from when
	 *  memory was switched on, so it is what "put it back" means here. A field never set
	 *  there falls through to the shipped one. */
	function startingDefault(key: keyof MemoryConfig): number {
		return featurePromptsStore.memoryDefaults[key] ?? DEFAULT_MEMORY_CONFIG[key];
	}

	// A slider commits on release, so a drag ended by closing the panel (Escape, a chat
	// switch) never reached onchange and the value was simply lost. Same flush-on-unmount as
	// the engine prompt fields.
	onDestroy(() => {
		if (!chat) return;
		for (const [key, value] of Object.entries(draft)) {
			if (typeof value === 'number') void commit(key as keyof MemoryConfig, value);
		}
	});
</script>

<div class="memory-view">
	<div class="memory-body">
		{#if !chat}
			<div class="memory-empty">
				<EmptyState icon="brain" size="sm">{i18n.t('mem.openChatHint')}</EmptyState>
			</div>
		{:else if !enabled}
			<div class="memory-intro">
				<div class="empty-orb w-14 h-14">
					<Icon name="brain" class="w-7 h-7 text-text-muted" strokeWidth={1.5} />
				</div>
				<h3>{i18n.t('mem.ltTitle')}</h3>
				<p>
					{i18n.t('mem.t58')}


				</p>
				{#if !memoryMacroPresent}
					<p class="memory-warn">
						<Icon name="warning" class="w-3.5 h-3.5" />
						{i18n.t('mem.noMemoryItem')}
						{i18n.t('mem.t59')}
					</p>
				{/if}
				<button type="button" class="memory-primary-btn" onclick={requestToggle} disabled={busy}>
					<Icon name="brain" class="w-4 h-4" />
					{i18n.t('mem.t60')}
				</button>
			</div>
		{:else}
			<!-- Status + actions -->
			<section class="memory-status-row">
				<div
					class="memory-status"
					class:is-busy={standing.kind === 'working'}
					class:is-error={standing.kind === 'error'}
					class:is-behind={standing.kind === 'behind'}
				>
					{#if busy}<span class="memory-spinner"></span>{/if}
					<span>{standing.label}</span>
					{#if progress && busy}
						<span class="memory-status-detail">{i18n.t('mem.passDetail', { pass: progress.batchesDone + 1, merged: progress.promotionsDone > 0 ? i18n.t('mem.mergedN', { n: progress.promotionsDone }) : '', waiting: progress.pending })}</span>
					{/if}
				</div>
				<div class="memory-actions">
					{#if busy}
						<button type="button" class="memory-btn" onclick={() => memoryStore.cancel()}><Icon name="stop" class="w-3.5 h-3.5" /> {i18n.t('mem.stopBtn')}</button>
					{:else}
						<button
							type="button"
							class="memory-btn"
							onclick={summarise}
							disabled={!behind}
							title={behind
								? undefined
								: i18n.t('mem.moreTurns', { n: Math.max(1, config.batchSize - pending) })}
						>
							<Icon name="sparkles" class="w-3.5 h-3.5" /> {summariseLabel}
						</button>
						<button type="button" class="memory-btn" onclick={askRebuild}><Icon name="refresh" class="w-3.5 h-3.5" /> {i18n.t('mem.rebuildTitle')}</button>
						<button type="button" class="memory-btn memory-btn-danger" onclick={() => (forgetConfirmOpen = true)}><Icon name="trash" class="w-3.5 h-3.5" /> {i18n.t('mem.forgetBtn')}</button>
					{/if}
				</div>
			</section>

			{#if lastError}
				<p class="memory-error"><Icon name="warning" class="w-3.5 h-3.5" /> {lastError}</p>
			{/if}

			{#if !memoryMacroPresent}
				<p class="memory-warn">
					<Icon name="warning" class="w-3.5 h-3.5" />
					{i18n.t('mem.noMemoryInert')}
				</p>
			{/if}

			<!-- Auto/manual folding mode -->
			<section class="memory-mode">
				<div class="memory-mode-text">
					<span class="memory-mode-label">{i18n.t('mem.autoLabel')}</span>
					<span class="memory-mode-help">
						{#if autoExtract}
							{i18n.t('mem.t61')}
						{:else}
							{i18n.t('mem.t62')}
						{/if}
					</span>
				</div>
				<div
					class="memory-toggle"
					class:is-on={autoExtract}
					title={autoExtract ? i18n.t('mem.autoTipOn') : i18n.t('mem.autoTipOff')}
				>
					<Toggle checked={autoExtract} onchange={toggleAutoExtract} label={i18n.t('mem.autoLabel')} />
					<span>{i18n.t(autoExtract ? 'ap.auto' : 'ap.manual')}</span>
				</div>
			</section>

			<!-- Where this story stands. Three of these numbers are one fact (every turn on the
			     branch is summarised, queued, or still raw), so they share a bar and a colour key
			     instead of sitting in separate boxes that leave the reader adding them up. The
			     ladder and the per-turn cost are about the store rather than the story, so they
			     drop below the rule. -->
			<section class="memory-shape">
				{#if shape.total > 0}
					<div class="memory-bar" aria-hidden="true">
						{#if shape.archived > 0}
							<span class="memory-bar-seg is-archived" style:width="{(shape.archived / shape.total) * 100}%"></span>
						{/if}
						{#if shape.waiting > 0}
							<span class="memory-bar-seg is-waiting" style:width="{(shape.waiting / shape.total) * 100}%"></span>
						{/if}
						{#if shape.verbatim > 0}
							<span class="memory-bar-seg is-verbatim" style:width="{(shape.verbatim / shape.total) * 100}%"></span>
						{/if}
					</div>
				{/if}

				<div class="memory-keys">
					<div class="memory-key" title={i18n.t('mem.keySummarizedTip')}>
						<span class="memory-key-num">{shape.archived}</span>
						<span class="memory-key-name"><span class="memory-key-dot is-archived"></span>{i18n.t('mem.keySummarized')}</span>
					</div>
					<div class="memory-key" title={i18n.t('mem.keyWaitingTip')}>
						<span class="memory-key-num">{shape.waiting}</span>
						<span class="memory-key-name"><span class="memory-key-dot is-waiting"></span>{i18n.t('mem.keyWaiting')}</span>
					</div>
					<div class="memory-key" title={i18n.t('mem.keyVerbatimTip')}>
						<span class="memory-key-num">{shape.verbatim}</span>
						<span class="memory-key-name"><span class="memory-key-dot is-verbatim"></span>{i18n.t('mem.keyVerbatim')}</span>
					</div>
				</div>

				<div class="memory-shape-foot">
					<span title={ladder ? i18n.t('mem.ladderTip', { ladder }) : i18n.t('mem.ladderTipPlain')}>
						{i18n.t(episodes.length === 1 ? 'mem.oneSummary' : 'mem.nSummaries', { n: episodes.length })}{#if merged > 0} · {i18n.t('mem.nMerged', { n: merged })}{/if}
					</span>
					<span
						class="memory-cost"
						title={i18n.t('mem.blockTip')}
					>
						<strong>{recallTokens.toLocaleString()}</strong> {i18n.t('mem.tokensPerTurn')}
					</span>
				</div>
			</section>

			<!-- What the model reads -->
			<section class="memory-section">
				<button type="button" class="memory-settings-toggle" onclick={() => (showRecall = !showRecall)}>
					<Icon name={showRecall ? 'chevronDown' : 'chevronRight'} class="w-3.5 h-3.5" />
					{i18n.t('mem.t63')}
				</button>
				{#if showRecall}
					{#if recallText}
						<pre class="memory-recall">{recallText}</pre>
					{:else}
						<p class="memory-muted">{i18n.t('mem.emptyYet')}</p>
					{/if}
				{/if}
			</section>

			<!-- Episodes -->
			<section class="memory-section">
				<h3 class="memory-section-title">{i18n.t('mem.soFar')}</h3>
				{#if dormant.length > 0}
					<p class="memory-muted">
						{dormant.length === 1 ? i18n.t('mem.dormantOne', { n: dormant.length }) : i18n.t('mem.dormantMany', { n: dormant.length })}
					</p>
					{#if showDormant}
						{#each dormant as e (e.id)}
							<div class="memory-episode is-dormant">
								<span class="memory-episode-mark" title={i18n.t('mem.coversOther', { n: e.sourceMessageIds.length })}>
									<Icon name="branch" class="w-3 h-3" />
								</span>
								<span class="memory-episode-text">{e.content}</span>
							</div>
						{/each}
					{/if}
				{/if}
				{#if timeline.length === 0}
					<p class="memory-muted">
						{i18n.t('mem.noSumYet', { batch: config.batchSize, tail: config.verbatimTail })}
					</p>
				{:else}
					{#each timeline as e (e.id)}
						{@const span = ranges.get(e.id)}
						<div class="memory-episode" class:is-merged={e.layer > 0}>
							<!-- The span is the same #N the transcript prints, so a summary can be
							     checked against the turns it was written from without counting. A
							     summary in play always has one (on-path and contiguous by
							     construction); the guard below is for the type, not a real state. -->
							<span
								class="memory-episode-mark"
								title={(e.layer === 0 ? i18n.t('mem.coversN', { n: e.sourceMessageIds.length }) : i18n.t('mem.mergedCovers', { n: e.sourceMessageIds.length })) + (span ? i18n.t('mem.spanTo', { from: span.from, to: span.to }) : '')}
							>
								<span class="memory-episode-n">
									{#if e.layer > 0}<Icon name="archive" class="w-3 h-3" />{/if}
									{e.n}
								</span>
								{#if span}<span class="memory-episode-span">#{span.from} to #{span.to}</span>{/if}
							</span>
							{#if editingId === e.id}
								<div class="memory-episode-editor">
									<textarea class="memory-episode-edit" bind:value={editingText} rows="5"></textarea>
									<div class="memory-episode-actions">
										<button type="button" class="memory-btn memory-btn-sm" onclick={saveEpisode}><Icon name="check" class="w-3 h-3" /> {i18n.t('common.save')}</button>
										<button type="button" class="memory-btn memory-btn-sm" onclick={() => (editingId = null)}>{i18n.t('common.cancel')}</button>
									</div>
								</div>
							{:else}
								<span class="memory-episode-text">{e.content}</span>
								<button type="button" class="memory-icon-btn" onclick={() => startEdit(e)} aria-label={i18n.t('mem.editAria')}><Icon name="pencil" class="w-3.5 h-3.5" /></button>
							{/if}
						</div>
					{/each}
				{/if}
			</section>

			<!-- Settings -->
			<section class="memory-section">
				<button type="button" class="memory-settings-toggle" onclick={() => (showSettings = !showSettings)}>
					<Icon name={showSettings ? 'chevronDown' : 'chevronRight'} class="w-3.5 h-3.5" />
					{i18n.t('mem.settingsBtn')}
				</button>
				{#if showSettings}
					<div class="memory-settings">
						{#each MEMORY_CONFIG_FIELDS as s (s.key)}
							<div class="memory-setting">
								<div class="memory-setting-head">
									<span class="memory-setting-label">
										<label for="mem-{s.key}">{i18n.t(s.label)}</label>
										<span class="memory-help-icon" title={i18n.t(s.help)}><Icon name="info" class="w-3.5 h-3.5" /></span>
										<OverrideMark
											overridden={!followsInherited(memoryStore.configOverride, featurePromptsStore.memoryDefaults, s.key)}
											onRevert={() => commit(s.key, startingDefault(s.key))}
											label={i18n.t('mem.changedDefaults')}
										/>
									</span>
									<span class="memory-setting-val">{shown(s.key)}</span>
								</div>
								<input
									id="mem-{s.key}"
									type="range"
									min={s.min}
									max={sliderMax(s.key)}
									step="1"
									value={shown(s.key)}
									title={i18n.t('mem.resetDefaultsTip')}
									oninput={(e) => drag(s.key, Number((e.currentTarget as HTMLInputElement).value))}
									onchange={(e) => commit(s.key, Number((e.currentTarget as HTMLInputElement).value))}
									use:rangeReset={{ defaultValue: startingDefault(s.key), apply: (v) => commit(s.key, v) }}
								/>
							</div>
						{/each}
						<p class="memory-muted">{i18n.t('mem.layerRaiseNote')}</p>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</div>

<ConfirmDialog
	open={enableConfirmOpen}
	title={i18n.t('mem.readTitle')}
	message={i18n.t('mem.readAsk', { price: priceOf(quoted), n: quoted.total })}
	confirmLabel={i18n.t('bk.start')}
	onConfirm={confirmEnable}
	onCancel={() => (enableConfirmOpen = false)}
/>

<ConfirmDialog
	open={summariseConfirmOpen}
	title={i18n.t('mem.sumTitle')}
	message={i18n.t('mem.sumAsk', { price: priceOf(quoted), n: quoted.total })}
	confirmLabel={i18n.t('mem.summarize')}
	onConfirm={confirmSummarise}
	onCancel={() => (summariseConfirmOpen = false)}
/>

<ConfirmDialog
	open={rebuildConfirmOpen}
	title={i18n.t('mem.rebuildTitle')}
	message={i18n.t('mem.rebuildAsk', { n: allSummaries, price: priceOf(quoted), calls: quoted.total })}
	confirmLabel={i18n.t('mem.rebuild')}
	variant="danger"
	holdMs={holdMsForBlast(allSummaries)}
	onConfirm={rebuild}
	onCancel={() => (rebuildConfirmOpen = false)}
/>


<ConfirmDialog
	open={forgetConfirmOpen}
	title={i18n.t('mem.forgetTitle')}
	message={i18n.t('mem.forgetAsk', { n: allSummaries })}
	confirmLabel={i18n.t('mem.forgetBtn')}
	variant="danger"
	destructive
	holdMs={holdMsForBlast(allSummaries)}
	onConfirm={forget}
	onCancel={() => (forgetConfirmOpen = false)}
/>

<style>
	/* Embedded in the Memory panel overlay: it flows in the panel's scroll rather than
	   owning its own height. */
	.memory-view {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		background: transparent;
	}

	/* Labeled pill around the standard ui/Toggle switch. */
	.memory-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		flex-shrink: 0;
		padding: 0.3rem 0.7rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-full);
		background: color-mix(in srgb, var(--color-bg-secondary) 70%, transparent);
		color: var(--color-text-secondary);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 700;
		transition: color 140ms ease, border-color 140ms ease;
	}
	.memory-toggle.is-on { color: var(--color-accent); border-color: color-mix(in srgb, var(--color-accent) 36%, transparent); }

	.memory-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.memory-empty,
	.memory-intro {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.6rem;
		margin: auto;
		max-width: 30rem;
		color: var(--color-text-secondary);
		font-family: var(--font-ui);
	}
	.memory-empty { color: var(--color-text-muted); }

	.memory-intro h3 { margin: 0.3rem 0 0; font-size: 1.05rem; font-weight: 700; color: var(--color-text-primary); }
	.memory-intro p { margin: 0; font-size: 0.88rem; line-height: 1.5; }

	.memory-primary-btn {
		margin-top: 0.5rem;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0.55rem 1rem;
		border: 0;
		border-radius: var(--radius-lg);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 140ms ease;
	}
	.memory-primary-btn:hover { background: var(--color-accent-hover); }
	.memory-primary-btn:disabled { opacity: 0.6; cursor: default; }

	.memory-status-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.memory-status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--color-text-secondary);
	}
	.memory-status.is-busy { color: var(--color-accent); }
	.memory-status.is-error { color: var(--color-error); }
	.memory-status.is-behind { color: var(--color-warning); }
	.memory-status-detail { color: var(--color-text-muted); font-weight: 500; }
	.memory-spinner {
		width: 0.85rem;
		height: 0.85rem;
		border: 2px solid color-mix(in srgb, var(--color-accent) 30%, transparent);
		border-top-color: var(--color-accent);
		border-radius: 50%;
		animation: memspin 0.8s linear infinite;
	}
	@keyframes memspin { to { transform: rotate(360deg); } }

	.memory-actions { display: inline-flex; gap: 0.4rem; flex-wrap: wrap; }

	.memory-mode {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.55rem 0.65rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--color-bg-secondary) 40%, transparent);
	}
	.memory-mode-text { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
	.memory-mode-label {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--color-text-primary);
	}
	.memory-mode-help {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.memory-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.4rem 0.65rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-bg-secondary) 70%, transparent);
		color: var(--color-text-secondary);
		font-family: var(--font-ui);
		font-size: 0.76rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 140ms ease, border-color 140ms ease, background-color 140ms ease;
	}
	.memory-btn:hover { color: var(--color-text-primary); border-color: var(--color-border); }
	.memory-btn:disabled { opacity: 0.5; cursor: default; }
	.memory-btn-sm { padding: 0.3rem 0.5rem; font-size: 0.72rem; }
	.memory-btn-danger:hover { color: var(--color-error); border-color: color-mix(in srgb, var(--color-error) 40%, transparent); }

	.memory-error {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--color-error);
	}

	.memory-warn {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		margin: 0;
		padding: 0.5rem 0.65rem;
		border-radius: var(--radius-md);
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.45;
		text-align: left;
		color: var(--color-text-secondary);
		background: color-mix(in srgb, var(--color-warning) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-warning) 30%, transparent);
	}

	/* One card for the whole reading: the bar, its key, then the store's own two figures under
	   a rule. */
	.memory-shape {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		padding: 0.7rem 0.75rem 0.6rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--color-bg-secondary) 40%, transparent);
	}

	/* Same recipe as the composer's prompt-token bar: one track, segments in story order,
	   oldest on the left. The three widths always total 100%, so the track shows only while a
	   fresh chat has no turns yet. */
	.memory-bar {
		display: flex;
		height: 0.4rem;
		border-radius: var(--radius-full);
		overflow: hidden;
		background: var(--color-bg-tertiary);
	}
	.memory-bar-seg {
		height: 100%;
		transition: width 300ms ease;
	}

	/* One hue at three strengths rather than three hues: the bands are stages of the same
	   process, and a second palette here would compete with the accent the panel already
	   spends on its own controls. */
	.memory-bar-seg.is-archived,
	.memory-key-dot.is-archived { background: var(--color-accent); }
	.memory-bar-seg.is-waiting,
	.memory-key-dot.is-waiting { background: color-mix(in srgb, var(--color-accent) 40%, transparent); }
	.memory-bar-seg.is-verbatim,
	.memory-key-dot.is-verbatim { background: color-mix(in srgb, var(--color-text-muted) 45%, transparent); }

	.memory-keys {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
		gap: 0.5rem 0.75rem;
	}
	.memory-key {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
		cursor: default;
	}
	.memory-key-num {
		font-family: var(--font-ui);
		font-size: 1.15rem;
		font-weight: 700;
		line-height: 1.1;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-primary);
	}
	.memory-key-name {
		display: inline-flex;
		align-items: center;
		gap: 0.32rem;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 600;
		color: var(--color-text-muted);
	}
	/* The key that ties the word to its band. Square-ish, like the composer's token dots. */
	.memory-key-dot {
		flex-shrink: 0;
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 2px;
	}

	.memory-shape-foot {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.6rem;
		flex-wrap: wrap;
		padding-top: 0.55rem;
		border-top: 1px solid var(--color-border-raised);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: default;
	}
	/* The bottom line, and the one number here that can cost the reader their live history,
	   so it carries the weight the old grid gave it as one tile of five. */
	.memory-cost { color: var(--color-text-secondary); }
	.memory-cost strong {
		font-size: 0.95rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-primary);
	}

	.memory-section { display: flex; flex-direction: column; gap: 0.5rem; }
	.memory-section-title {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
	}

	.memory-muted { font-family: var(--font-ui); font-size: 0.8rem; color: var(--color-text-muted); line-height: 1.45; }

	.memory-recall {
		margin: 0;
		padding: 0.6rem 0.7rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--color-bg-secondary) 45%, transparent);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		line-height: 1.5;
		color: var(--color-text-secondary);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 22rem;
		overflow-y: auto;
	}

	.memory-episode {
		display: flex;
		align-items: flex-start;
		gap: 0.55rem;
		padding: 0.45rem 0.55rem;
		border-left: 2px solid color-mix(in srgb, var(--color-accent) 25%, transparent);
		background: color-mix(in srgb, var(--color-bg-secondary) 30%, transparent);
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
	}
	/* Merged summaries stand for a whole stretch of the story, so they read heavier. */
	.memory-episode.is-merged {
		border-left-color: color-mix(in srgb, var(--color-accent) 60%, transparent);
		background: color-mix(in srgb, var(--color-bg-secondary) 55%, transparent);
	}
	/* Another branch's summaries: present, readable, and visibly not in play. */
	.memory-episode.is-dormant {
		border-left-style: dashed;
		border-left-color: var(--color-border);
		background: transparent;
		opacity: 0.66;
	}
	.memory-episode.is-dormant .memory-episode-mark { color: var(--color-text-muted); }

	.memory-episode-mark {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		flex-shrink: 0;
		min-width: 1.4rem;
		padding-top: 0.1rem;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		color: var(--color-accent);
	}
	.memory-episode-n {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
	}
	/* The turn span sits under the ordinal rather than beside the prose: it is metadata,
	   and the prose column must stay one uninterrupted block of story. */
	.memory-episode-span {
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--color-text-muted);
		white-space: nowrap;
	}
	.memory-episode-text { flex: 1; font-family: var(--font-prose); font-size: 0.84rem; line-height: 1.5; color: var(--color-text-primary); }
	.memory-episode-editor { flex: 1; display: flex; flex-direction: column; gap: 0.35rem; }
	.memory-episode-edit {
		width: 100%;
		resize: vertical;
		font-family: var(--font-prose);
		font-size: 0.84rem;
		line-height: 1.5;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
		background: var(--color-bg-secondary);
		color: var(--color-text-primary);
	}
	.memory-episode-edit:focus { outline: none; border-color: color-mix(in srgb, var(--color-accent) 50%, transparent); }
	.memory-episode-actions { display: inline-flex; gap: 0.35rem; }

	.memory-icon-btn {
		display: inline-flex;
		flex-shrink: 0;
		padding: 0.2rem;
		border: 0;
		background: transparent;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		opacity: 0;
		transition: opacity 120ms ease, color 120ms ease;
	}
	.memory-episode:hover .memory-icon-btn { opacity: 1; }
	.memory-icon-btn:focus-visible { opacity: 1; }
	.memory-icon-btn:hover { color: var(--color-text-primary); background: var(--color-bg-tertiary); }
	/* Touch has no hover, so the edit affordance would be unreachable. */
	@media (hover: none) {
		.memory-icon-btn { opacity: 1; }
	}

	.memory-settings-toggle {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 0;
		background: transparent;
		padding: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--color-text-muted);
		cursor: pointer;
	}
	.memory-settings-toggle:hover { color: var(--color-text-secondary); }
	.memory-settings { display: flex; flex-direction: column; gap: 0.7rem; margin-top: 0.4rem; }
	.memory-setting { display: flex; flex-direction: column; gap: 0.2rem; }
	.memory-setting-head { display: flex; justify-content: space-between; font-family: var(--font-ui); font-size: 0.8rem; font-weight: 600; color: var(--color-text-secondary); }
	.memory-setting-label { display: inline-flex; align-items: center; gap: 0.3rem; }
	.memory-help-icon { display: inline-flex; color: var(--color-text-muted); cursor: help; }
	.memory-help-icon:hover { color: var(--color-text-secondary); }
	.memory-setting-val { color: var(--color-accent); }
	.memory-setting input[type='range'] { width: 100%; accent-color: var(--color-accent); }
</style>
