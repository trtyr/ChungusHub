<script lang="ts">
	/**
	 * The editor for one palette the reader built. It appends BELOW the palette grid on
	 * the Interface page and never above it, so opening it cannot slide the card that was
	 * just tapped out from under the pointer.
	 *
	 * Every change applies live, which is the whole point of editing in place rather than
	 * in a modal: the workspace behind the settings panel repaints under each pick, so a
	 * color is judged where it will actually be read instead of against a swatch. The
	 * price of that is that there is nothing to cancel, so the editor takes a copy of the
	 * palette as it found it and the bar at the foot is the way back out: Discard changes
	 * puts that copy back, and a palette forked minutes ago offers Cancel instead of
	 * Delete, since backing out of something that never existed is not a deletion.
	 *
	 * The reader edits the palette's own colors and nothing else. `applyTheme()` mints
	 * roughly seventy-five custom properties out of them (the glass tiers, the raised
	 * border, the on-accent and on-error inks, the shadows, both scrims), so the derived
	 * half can never be dragged out of step with the half that is picked here, and the
	 * editor stays a short list instead of a spreadsheet.
	 *
	 * The readout is the one thing that makes this safe to hand over. Everything in the
	 * app is derived from these pairs, so measuring ink against surface here is a reading
	 * of the whole interface rather than a spot check, and it is a reading rather than a
	 * refusal: a palette is the reader's to build.
	 */
	import InfoTip from '$lib/components/ui/InfoTip.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ColorPicker from '$lib/components/ui/ColorPicker.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { DEFAULT_APPEARANCE, type PaletteColorKey } from '$lib/themes/presets';
	import { readContrast, type ContrastCheck } from '$lib/utils/contrast';
	import { i18n } from '$lib/i18n/i18n.svelte';
	import type { PaletteMode } from '$lib/types/theme';

	interface Props {
		paletteId: string;
		/**
		 * The palette this one was forked from, when the reader made it moments ago and
		 * has not left the editor since. Backing out of a palette that never existed
		 * before this session removes it and puts that one back on; an existing palette
		 * carries no such id and offers Delete instead.
		 */
		forkedFrom: string | null;
		onclose: () => void;
	}

	let { paletteId, forkedFrom, onclose }: Props = $props();

	/**
	 * The palette exactly as the editor found it. Captured once at mount, which is what
	 * the `{#key}` around this component on the Interface page is for: pointing the editor
	 * at another palette is a new session and has to take a new copy.
	 */
	const found = themeStore.customPalettes.find((p) => p.id === paletteId);
	// svelte-ignore state_referenced_locally
	if (!found) throw new Error(`[palette-editor] "${paletteId}" is not a palette this reader owns`);
	const opened = $state.snapshot(found);

	let palette = $derived(themeStore.customPalettes.find((p) => p.id === paletteId));

	/** Something has moved since the editor opened, so there is something to discard. */
	let drifted = $derived(
		palette ? JSON.stringify($state.snapshot(palette)) !== JSON.stringify(opened) : false
	);

	/** What each color actually paints, said in the reader's terms rather than the token's. */
	const COLOR_LABELS: Record<PaletteColorKey, string> = $derived({
		bgPrimary: i18n.t('pal.colorWorkspace'),
		bgSecondary: i18n.t('pal.colorPanels'),
		bgTertiary: i18n.t('pal.colorRaisedRows'),
		bgElevated: i18n.t('pal.colorMenus'),
		cardBg: i18n.t('pal.colorCards'),
		inputBg: i18n.t('pal.colorInputs'),
		textPrimary: i18n.t('pal.colorText'),
		textSecondary: i18n.t('pal.colorTextSecondary'),
		textMuted: i18n.t('pal.colorTextMuted'),
		border: i18n.t('pal.colorBorders'),
		borderSubtle: i18n.t('pal.colorBorderSubtle'),
		userBubble: i18n.t('pal.colorYourTurn'),
		assistantBubble: i18n.t('pal.colorTheirTurn'),
		error: i18n.t('pal.colorError'),
		success: i18n.t('pal.colorSuccess'),
		warning: i18n.t('pal.colorWarning')
	});

	const GROUPS: { label: string; keys: PaletteColorKey[] }[] = $derived([
		{
			label: i18n.t('pal.groupSurfaces'),
			keys: ['bgPrimary', 'bgSecondary', 'bgTertiary', 'bgElevated', 'cardBg', 'inputBg']
		},
		{ label: i18n.t('pal.groupText'), keys: ['textPrimary', 'textSecondary', 'textMuted'] },
		{ label: i18n.t('pal.groupLines'), keys: ['border', 'borderSubtle'] },
		{ label: i18n.t('pal.groupStoryTurns'), keys: ['userBubble', 'assistantBubble'] },
		{ label: i18n.t('pal.groupStatus'), keys: ['error', 'success', 'warning'] }
	]);

	const MODES: { value: PaletteMode; label: string }[] = $derived([
		{ value: 'dark', label: i18n.t('pal.modeDark') },
		{ value: 'light', label: i18n.t('pal.modeLight') }
	]);

	/**
	 * What gets measured. Body-sized text owes 4.5:1; muted text is supporting copy and
	 * owes 3. Every pair here is ink against a surface the app genuinely puts it on, so a
	 * row that fails names a real place the story or the chrome stops being readable.
	 */
	let readings = $derived.by(() => {
		if (!palette) return [];
		const c = palette.colors;
		const checks: ContrastCheck[] = [
			{ label: i18n.t('pal.contrastWorkspace'), ink: c.textPrimary, surface: c.bgPrimary, floor: 4.5 },
			{ label: i18n.t('pal.contrastSecondary'), ink: c.textSecondary, surface: c.bgPrimary, floor: 4.5 },
			{ label: i18n.t('pal.contrastMuted'), ink: c.textMuted, surface: c.bgPrimary, floor: 3 },
			{ label: i18n.t('pal.contrastPanels'), ink: c.textPrimary, surface: c.bgSecondary, floor: 4.5 },
			{ label: i18n.t('pal.contrastYour'), ink: c.textPrimary, surface: c.userBubble, floor: 4.5 },
			{ label: i18n.t('pal.contrastTheir'), ink: c.textPrimary, surface: c.assistantBubble, floor: 4.5 }
		];
		return checks.map(readContrast);
	});

	let failing = $derived(readings.filter((r) => r.verdict !== 'pass').length);

	// One swatch popover at a time, anchored to the row that opened it.
	let openKey = $state<PaletteColorKey | null>(null);
	let popover = $state<HTMLDivElement | undefined>(undefined);
	let anchors: Partial<Record<PaletteColorKey, HTMLButtonElement>> = {};

	let confirmDelete = $state(false);
	/** Named rather than spelled out, so the message cannot drift from the actual fallback. */
	let fallbackName = $derived(
		themeStore.palettes.find((p) => p.id === DEFAULT_APPEARANCE.palette)?.name ?? i18n.t('pal.theDefault')
	);

	/**
	 * Everything this press costs, which is what the ladder asks of a confirm. Wearing the
	 * palette is the consequence that has to be said out loud: the interface repaints under
	 * the reader the moment they press.
	 */
	let deleteMessage = $derived.by(() => {
		if (!palette) return '';
		const parts = [i18n.t('pal.delHead', { name: palette.name })];
		if (themeStore.appearance.palette === paletteId) {
			parts.push(i18n.t('pal.delWearing', { name: fallbackName }));
		}
		parts.push(i18n.t('chat.cannotUndo'));
		return parts.join(' ');
	});

	function handleWindowPointerDown(event: PointerEvent) {
		if (!openKey) return;
		const target = event.target as Node;
		if (popover?.contains(target) || anchors[openKey]?.contains(target)) return;
		openKey = null;
	}

	function handleWindowKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && openKey) {
			// Consume it, or the workspace's global Escape also closes the Settings panel.
			event.preventDefault();
			event.stopPropagation();
			openKey = null;
		}
	}

	function removePalette() {
		themeStore.deletePalette(paletteId);
		confirmDelete = false;
		onclose();
	}

	/**
	 * Back out of a palette forked this session. The look moves off it BEFORE the delete,
	 * so the app never paints the house default for a frame on its way back to the palette
	 * the reader was actually wearing.
	 */
	function cancelFork() {
		if (!forkedFrom) throw new Error('[palette-editor] nothing to cancel back to');
		themeStore.update({ palette: forkedFrom });
		themeStore.deletePalette(paletteId);
		onclose();
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} onkeydown={handleWindowKeydown} />

{#if palette}
	<section class="card" data-setting="palette-editor">
		<div class="card-head">
			<span class="card-title">{i18n.t('pal.editing', { name: palette.name })}</span>
			<InfoTip
				text={i18n.t('pal.tip')}
			/>
		</div>

		<div class="card-body">
			<label class="field">
				<span class="section-label">{i18n.t('pal.nameLabel')}</span>
				<input
					class="input-base name-input"
					type="text"
					value={palette.name}
					onchange={(e) => themeStore.renamePalette(paletteId, e.currentTarget.value)}
				/>
			</label>

			<div class="field">
				<span class="section-label">{i18n.t('pal.treatAs')}</span>
				<div class="seg-pills" role="radiogroup" aria-label={i18n.t('pal.treatAs')}>
					{#each MODES as mode (mode.value)}
						<button
							type="button"
							role="radio"
							aria-checked={palette.mode === mode.value}
							class="seg-pill"
							class:active={palette.mode === mode.value}
							class:seg-lift={palette.mode === mode.value}
							onclick={() => themeStore.setPaletteMode(paletteId, mode.value)}
						>
							{mode.label}
						</button>
					{/each}
				</div>
				<p class="hint">
					{i18n.t('pal.t50')}

				</p>
			</div>

			{#each GROUPS as group (group.label)}
				<div class="field">
					<span class="section-label">{group.label}</span>
					<div class="swatch-grid">
						{#each group.keys as key (key)}
							<div class="swatch-wrap">
								<button
									type="button"
									class="swatch-row"
									class:open={openKey === key}
									bind:this={anchors[key]}
									aria-expanded={openKey === key}
									onclick={() => (openKey = openKey === key ? null : key)}
								>
									<span class="swatch-chip" style="background: {palette.colors[key]}"></span>
									<span class="swatch-label">{COLOR_LABELS[key]}</span>
									<span class="swatch-hex">{palette.colors[key]}</span>
								</button>
								{#if openKey === key}
									<div class="swatch-popover surface-float slide-up" bind:this={popover}>
										<ColorPicker
											value={palette.colors[key]}
											oninput={(value) => themeStore.updatePalette(paletteId, { [key]: value })}
										/>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/each}

			<div class="field">
				<span class="section-label">
					Readability{failing > 0 ? i18n.t('pal.belowFloor', { n: failing }) : ''}
				</span>
				<ul class="reads">
					{#each readings as reading (reading.label)}
						<li class="read" data-verdict={reading.verdict}>
							<span class="read-dot"></span>
							<span class="read-label">{reading.label}</span>
							<span class="read-ratio">{reading.ratio.toFixed(1)}:1</span>
						</li>
					{/each}
				</ul>
			</div>

			<div class="editor-actions">
				{#if forkedFrom}
					<Button variant="ghost" size="lg" class="flex-1" onclick={cancelFork}>{i18n.t('common.cancel')}</Button>
				{:else}
					<Button
						variant="ghost"
						size="lg"
						class="flex-1 palette-delete"
						onclick={() => (confirmDelete = true)}
					>
						{i18n.t('pal.t51')}
					</Button>
				{/if}
				{#if drifted}
					<Button
						variant="ghost"
						size="lg"
						class="flex-1"
						onclick={() => themeStore.restorePalette(opened)}
					>
						{i18n.t('pal.t52')}
					</Button>
				{/if}
				<Button variant="primary" size="lg" class="flex-1" onclick={onclose}>{i18n.t('common.close')}</Button>
			</div>
		</div>
	</section>

	<ConfirmDialog
		open={confirmDelete}
		title={i18n.t('pal.deleteTitle')}
		message={deleteMessage}
		confirmLabel={i18n.t('common.delete')}
		variant="danger"
		destructive
		onConfirm={removePalette}
		onCancel={() => (confirmDelete = false)}
	/>
{/if}

<style>
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.name-input {
		width: 100%;
		padding: 0.42rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--color-text-primary);
	}

	.hint {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		line-height: 1.45;
		color: var(--color-text-muted);
	}

	.swatch-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr));
		gap: 0.4rem;
	}

	.swatch-wrap {
		position: relative;
	}

	.swatch-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.4rem 0.5rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-subtle);
		background: color-mix(in srgb, var(--color-bg-tertiary) 40%, transparent);
		cursor: pointer;
		text-align: left;
		transition:
			border-color 120ms ease,
			background-color 120ms ease;
	}

	.swatch-row:hover,
	.swatch-row.open {
		border-color: var(--color-border);
		background: color-mix(in srgb, var(--color-bg-tertiary) 70%, transparent);
	}

	.swatch-chip {
		width: 1.15rem;
		height: 1.15rem;
		flex-shrink: 0;
		border-radius: var(--radius-sm);
		border: 1px solid color-mix(in srgb, var(--color-border) 70%, transparent);
	}

	.swatch-label {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--color-text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.swatch-hex {
		font-family: var(--font-mono);
		font-size: 0.64rem;
		color: var(--color-text-muted);
	}

	/* Floating popover over panel content, carrying .surface-float in markup. */
	.swatch-popover {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 30;
		padding: 0.75rem;
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
	}

	.reads {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
		gap: 0.25rem 0.9rem;
	}

	.read {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-text-secondary);
	}

	.read-dot {
		width: 0.45rem;
		height: 0.45rem;
		flex-shrink: 0;
		border-radius: var(--radius-full);
		background: var(--color-success);
	}

	.read[data-verdict='tight'] .read-dot {
		background: var(--color-warning);
	}

	.read[data-verdict='fail'] .read-dot {
		background: var(--color-error);
	}

	.read-label {
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.read-ratio {
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-text-muted);
	}

	.read[data-verdict='fail'] .read-ratio {
		color: var(--color-error);
	}

	/* The way out, at the end of a card long enough to scroll: full-height buttons
	   sharing the row, so the one that ends a session of live edits is never a link the
	   reader has to hunt for among the swatches. */
	.editor-actions {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid color-mix(in srgb, var(--color-border-subtle) 55%, transparent);
	}

	/* A full-size button that deletes has to read as one, and the solid danger variant
	   would outshout Done sitting beside it. Placed on the descendant rather than passed
	   as a utility class so it cannot lose a coin toss with the variant's own color. */
	.editor-actions :global(.palette-delete),
	.editor-actions :global(.palette-delete:hover) {
		color: var(--color-error);
	}

	/* --- Segmented pills (canonical .seg-lift active state) --- */
	.seg-pills {
		display: inline-flex;
		align-self: flex-start;
		gap: 2px;
		padding: 3px;
		background: color-mix(in srgb, var(--color-bg-tertiary) 80%, transparent);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-md);
	}

	.seg-pill {
		padding: 0.28rem 0.7rem;
		border-radius: calc(var(--radius-md) - 4px);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--color-text-muted);
		cursor: pointer;
		transition:
			background-color 130ms ease,
			color 130ms ease;
	}

	.seg-pill:hover:not(.active) {
		color: var(--color-text-primary);
	}
</style>
