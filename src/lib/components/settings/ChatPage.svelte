<script lang="ts">
	/**
	 * Settings → Appearance → Chat: the reading column and everything drawn inside it.
	 * The column's measure, the face the story is set in, and the turns.
	 *
	 * A knob sits with the thing it dresses, which is why the story's own type is here
	 * and the interface's is not, and why the column's shade is here while the background
	 * image's dim is on Interface with the picture it acts on. Those two scrims stay
	 * deliberately independent (architecture/ui-shell-settings.md, "the two workspace
	 * scrims"): one is the app's own surface tone over the reading column, the other is
	 * plain black over a photograph, and neither offers a color to pick.
	 *
	 * Every control here writes one `appearance` field (architecture/ui-shell-settings.md,
	 * "the settings spine"); the theme store turns those into `--msg-*`/`--prose-*`
	 * custom properties that Message/StreamingIndicator/MessageAvatar/MessageMeta
	 * read. Nothing on this page touches a component directly.
	 *
	 * A control with nothing left to style is HIDDEN, not shown inert, the same rule
	 * the chat-width slider follows on phones. Manuscript draws no card and no portrait,
	 * so three whole cards drop out and a note says why; the memory ghost fade goes with
	 * the Chat Memory engine, the one gate here that comes from another page.
	 *
	 * Restore defaults is the one way back to the shipped look for this half of it, at the
	 * foot of the page and only there while something has actually moved.
	 */
	import InfoTip from '$lib/components/ui/InfoTip.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import Select from '$lib/components/ui/Select.svelte';
	import PillRow from '$lib/components/ui/PillRow.svelte';
	import ColorSwatchPicker from '$lib/components/ui/ColorSwatchPicker.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { featurePromptsStore } from '$lib/stores/featurePrompts.svelte';
	import { viewport } from '$lib/stores/viewport.svelte';
	import { DEFAULT_APPEARANCE, proseQuoteDefault } from '$lib/themes/presets';
	import { rangeReset } from '$lib/actions/rangeReset';
	import { toggleRow } from '$lib/actions/toggleRow';
	import type {
		ActionVisibility,
		AvatarShape,
		BubbleBorder,
		BubblePadding,
		BubbleShadow,
		ChatStyle,
		ClockFormat,
		MessageSpacing,
		PagerVisibility,
		ProseColorSource,
		SpeakerLabel,
		TimestampFormat
	} from '$lib/types/theme';

	let appearance = $derived(themeStore.appearance);
	// Flat IS Bubbles plus a left-aligned user turn, so every Bubbles-only knob
	// (tail, card width, portrait shape, per-role tint) applies to it identically:
	// the two styles differ only in which side a turn sits on.
	let bubbleLike = $derived(
		appearance.chatStyle === 'bubbles' || appearance.chatStyle === 'flat'
	);
	let isManuscript = $derived(appearance.chatStyle === 'manuscript');

	let confirmRestore = $state(false);

	function restoreDefaults(): void {
		themeStore.restoreDefaults('chat');
		confirmRestore = false;
	}

	const pct = (v: number) => `${Math.round(v * 100)}%`;

	import { i18n } from '$lib/i18n/i18n.svelte';

	const CHAT_STYLES: { value: ChatStyle; label: string; hint: string }[] = $derived([
		{
			value: 'bubbles',
			label: i18n.t('chatpg.styleBubbles'),
			hint: i18n.t('chatpg.styleBubblesHint')
		},
		{
			value: 'flat',
			label: i18n.t('chatpg.styleFlat'),
			hint: i18n.t('chatpg.styleFlatHint')
		},
		{
			value: 'portrait',
			label: i18n.t('chatpg.stylePortraits'),
			hint: i18n.t('chatpg.stylePortraitsHint')
		},
		{
			value: 'manuscript',
			label: i18n.t('chatpg.styleManuscript'),
			hint: i18n.t('chatpg.styleManuscriptHint')
		}
	]);

	const PADDING_OPTIONS = $derived([
		{ value: 'compact', label: i18n.t('chatpg.compact') },
		{ value: 'normal', label: i18n.t('chatpg.normal') },
		{ value: 'roomy', label: i18n.t('chatpg.roomy') }
	]);

	const BORDER_OPTIONS = $derived([
		{ value: 'none', label: i18n.t('chatpg.none'), title: i18n.t('chatpg.noneBorderTip') },
		{ value: 'hairline', label: i18n.t('chatpg.hairline'), title: i18n.t('chatpg.hairlineTip') },
		{ value: 'bold', label: i18n.t('chatpg.borderBold'), title: i18n.t('chatpg.boldTip') }
	]);

	const SHADOW_OPTIONS = $derived([
		{ value: 'none', label: i18n.t('chatpg.none') },
		{ value: 'soft', label: i18n.t('chatpg.soft') },
		{ value: 'lifted', label: i18n.t('chatpg.lifted'), title: i18n.t('chatpg.liftedTip') }
	]);

	const SPACING_OPTIONS = $derived([
		{ value: 'compact', label: i18n.t('chatpg.compact') },
		{ value: 'cozy', label: i18n.t('chatpg.cozy') },
		{ value: 'roomy', label: i18n.t('chatpg.roomy') }
	]);

	const AVATAR_SHAPES = $derived([
		{ value: 'portrait', label: i18n.t('chatpg.portraitShape'), title: i18n.t('chatpg.portraitShapeTip') },
		{ value: 'square', label: i18n.t('chatpg.square') },
		{ value: 'circle', label: i18n.t('chatpg.circle') }
	]);

	const SPEAKER_LABELS = $derived([
		{ value: 'pill', label: i18n.t('chatpg.pill'), title: i18n.t('chatpg.pillTip') },
		{ value: 'plain', label: i18n.t('chatpg.plain'), title: i18n.t('chatpg.plainTip') }
	]);

	const ACTION_OPTIONS = $derived([
		{ value: 'hover', label: i18n.t('chatpg.onHover') },
		{ value: 'always', label: i18n.t('chatpg.always') }
	]);

	const PAGER_OPTIONS = $derived([
		{ value: 'always', label: i18n.t('chatpg.always') },
		{ value: 'hover', label: i18n.t('chatpg.onHover') }
	]);

	const TIMESTAMP_FORMATS = $derived([
		{ value: 'relative', label: i18n.t('chatpg.relative'), title: i18n.t('chatpg.relativeTip') },
		{ value: 'short', label: i18n.t('chatpg.short'), title: i18n.t('chatpg.shortTip') },
		{ value: 'full', label: i18n.t('chatpg.full'), title: i18n.t('chatpg.fullTip') }
	]);

	const CLOCK_FORMATS = $derived([
		{ value: 'auto', label: i18n.t('chatpg.clockAuto'), title: i18n.t('chatpg.clockAutoTip') },
		{ value: '12', label: i18n.t('chatpg.clock12') },
		{ value: '24', label: i18n.t('chatpg.clock24') }
	]);

	// One vocabulary for all three accents, and every option carries the color it means
	// rather than only naming it: "Default" tells the reader nothing on its own, and the
	// whole point of this card is deciding what things look like. `off` is the prose's
	// own color, so its swatch is that; the other three are live theme values, resolved
	// by the browser rather than copied here (the quote default comes from presets.ts,
	// the one place that expression exists).
	const proseSources = (custom: string, shipped: string) => [
		{ value: 'off', label: i18n.t('chatpg.proseOff'), swatch: 'var(--color-text-primary)' },
		{ value: 'default', label: i18n.t('chatpg.proseDefault'), swatch: shipped },
		{ value: 'accent', label: i18n.t('chatpg.proseAccent'), swatch: 'var(--color-accent)' },
		{ value: 'custom', label: i18n.t('chatpg.proseCustom'), swatch: custom }
	];
</script>

<!-- The letters ARE the control, the way every text editor spells this: a bold B and a
     slanted I, pressed or not. Two independent switches rather than one four-value face,
     so nothing on screen has to spend a pill naming "neither". -->
{#snippet faceToggle(t: { kind: 'bold' | 'italic'; on: boolean; onchange: (on: boolean) => void })}
	<button
		type="button"
		class="face-btn"
		class:face-italic={t.kind === 'italic'}
		class:is-active-tint={t.on}
		aria-pressed={t.on}
		aria-label={t.kind === 'bold' ? i18n.t('chatpg.bold') : i18n.t('chatpg.italic')}
		title={t.kind === 'bold' ? i18n.t('chatpg.bold') : i18n.t('chatpg.italic')}
		onclick={() => t.onchange(!t.on)}
	>
		{t.kind === 'bold' ? 'B' : 'I'}
	</button>
{/snippet}

<!-- One line per story accent: its name, then its three answers riding the card's right
     edge, the same line every toggle row on this page draws. Three identical rows the eye
     learns once, instead of a grid of pills it has to read on every line. The color's four
     sources live inside the swatch, since a source and the color it produces are one
     question and the swatch is the only part worth keeping on screen. -->
{#snippet proseAccent(row: {
	label: string;
	live: string;
	source: string;
	color: string;
	shipped: string;
	bold: boolean;
	italic: boolean;
	onsource: (value: string) => void;
	oncolor: (hex: string) => void;
	onbold: (on: boolean) => void;
	onitalic: (on: boolean) => void;
})}
	<div class="accent-row" role="group" aria-label={row.label}>
		<span class="accent-name">{row.label}</span>
		<div class="accent-controls">
			<ColorSwatchPicker
				value={row.color}
				chip="var({row.live})"
				oninput={row.oncolor}
				label="{row.label} color"
				sources={proseSources(row.color, row.shipped)}
				source={row.source}
				onsource={row.onsource}
			/>
			{@render faceToggle({ kind: 'bold', on: row.bold, onchange: row.onbold })}
			{@render faceToggle({ kind: 'italic', on: row.italic, onchange: row.onitalic })}
		</div>
	</div>
{/snippet}

<div class="chat-page">
	<section class="card" data-setting="reading-column">
		<div class="card-head">
			<span class="card-title">{i18n.t('chatpg.readingColumn')}</span>
			<InfoTip
				text={i18n.t('chatpg.readingTip')}
			/>
		</div>

		<div class="card-body">
			<!-- Chat width multiplies the chat column's screen share and the content
			     and reading measures under it (--chat-col-max, --chat-content-max,
			     --reading-measure). On a ≤640px screen even the narrowest setting
			     stays wider than the viewport (the 94% width clamp always wins), so the
			     knob is mathematically inert there and must not pretend it works. -->
			{#if !viewport.isMobile}
				<div class="slider-block">
					<div class="slider-top">
						<label for="chat-width" class="slider-label">{i18n.t('chatpg.chatWidth')}</label>
						<span class="slider-value">{pct(appearance.chatWidth)}</span>
					</div>
					<input
						id="chat-width"
						type="range"
						class="slider"
						min="0.75"
						max="1.2"
						step="0.01"
						value={appearance.chatWidth}
						oninput={(e) => themeStore.update({ chatWidth: parseFloat(e.currentTarget.value) })}
						use:rangeReset={{
							defaultValue: DEFAULT_APPEARANCE.chatWidth,
							apply: (v) => themeStore.update({ chatWidth: v })
						}}
					/>
				</div>
			{/if}

			<div class="slider-block">
				<div class="slider-top">
					<div class="slider-label-wrap">
						<label for="shade-opacity" class="slider-label">{i18n.t('chatpg.columnShade')}</label>
						<InfoTip
							text={i18n.t('chatpg.columnShadeTip')}
						/>
					</div>
					<span class="slider-value">{pct(appearance.shadeOpacity)}</span>
				</div>
				<input
					id="shade-opacity"
					type="range"
					class="slider"
					min="0"
					max="1"
					step="0.01"
					value={appearance.shadeOpacity}
					oninput={(e) => themeStore.update({ shadeOpacity: parseFloat(e.currentTarget.value) })}
					use:rangeReset={{
						defaultValue: DEFAULT_APPEARANCE.shadeOpacity,
						apply: (v) => themeStore.update({ shadeOpacity: v })
					}}
				/>
			</div>

			<div class="sub-block">
				<span class="section-label">{i18n.t('chatpg.spaceBetween')}</span>
				<PillRow
					options={SPACING_OPTIONS}
					current={appearance.messageSpacing}
					onpick={(v) => themeStore.update({ messageSpacing: v as MessageSpacing })}
					label={i18n.t('lbl.spaceBetween')}
				/>
			</div>
		</div>
	</section>

	<section class="card" data-setting="story-type">
		<div class="card-head">
			<span class="card-title">{i18n.t('chatpg.storyType')}</span>
			<InfoTip text={i18n.t('chatpg.storyTypeTip')} />
		</div>

		<div class="card-body">
			<div class="slider-block">
				<label for="story-font" class="slider-label">{i18n.t('chatpg.storyFont')}</label>
				<Select
					id="story-font"
					variant="compact"
					class="w-full"
					value={appearance.bodyFont}
					onchange={(e) => themeStore.update({ bodyFont: (e.target as HTMLSelectElement).value })}
				>
					{#each themeStore.bodyFonts as font (font.id)}
						<option value={font.id}>{font.label}</option>
					{/each}
				</Select>
			</div>

			<div class="slider-block">
				<div class="slider-top">
					<label for="text-size" class="slider-label">{i18n.t('chatpg.textSize')}</label>
					<span class="slider-value">{pct(appearance.fontScale)}</span>
				</div>
				<input
					id="text-size"
					type="range"
					class="slider"
					min="0.85"
					max="1.25"
					step="0.01"
					value={appearance.fontScale}
					oninput={(e) => themeStore.update({ fontScale: parseFloat(e.currentTarget.value) })}
					use:rangeReset={{
						defaultValue: DEFAULT_APPEARANCE.fontScale,
						apply: (v) => themeStore.update({ fontScale: v })
					}}
				/>
			</div>

			<div class="slider-block">
				<div class="slider-top">
					<label for="line-height" class="slider-label">{i18n.t('chatpg.lineHeight')}</label>
					<span class="slider-value">{appearance.lineHeight.toFixed(2)}</span>
				</div>
				<input
					id="line-height"
					type="range"
					class="slider"
					min="1.4"
					max="2.1"
					step="0.02"
					value={appearance.lineHeight}
					oninput={(e) => themeStore.update({ lineHeight: parseFloat(e.currentTarget.value) })}
					use:rangeReset={{
						defaultValue: DEFAULT_APPEARANCE.lineHeight,
						apply: (v) => themeStore.update({ lineHeight: v })
					}}
				/>
			</div>

			<div class="slider-block">
				<div class="slider-top">
					<label for="paragraph-gap" class="slider-label">{i18n.t('chatpg.paragraphGap')}</label>
					<span class="slider-value">{appearance.paragraphSpacing.toFixed(2)}em</span>
				</div>
				<input
					id="paragraph-gap"
					type="range"
					class="slider"
					min="0.4"
					max="1.8"
					step="0.05"
					value={appearance.paragraphSpacing}
					oninput={(e) =>
						themeStore.update({ paragraphSpacing: parseFloat(e.currentTarget.value) })}
					use:rangeReset={{
						defaultValue: DEFAULT_APPEARANCE.paragraphSpacing,
						apply: (v) => themeStore.update({ paragraphSpacing: v })
					}}
				/>
			</div>
		</div>
	</section>

	<section class="card" data-setting="chat-style">
		<div class="card-head">
			<span class="card-title">{i18n.t('chatpg.chatStyleTitle')}</span>
			<InfoTip text={i18n.t('chatpg.chatStyleTip')} />
		</div>
		<div class="style-grid" role="radiogroup" aria-label={i18n.t('chatpg.chatStyleAria')}>
			{#each CHAT_STYLES as style (style.value)}
				<button
					type="button"
					role="radio"
					aria-checked={appearance.chatStyle === style.value}
					class="style-card"
					class:active={appearance.chatStyle === style.value}
					onclick={() => themeStore.update({ chatStyle: style.value })}
				>
					<span class="style-preview style-preview-{style.value}" aria-hidden="true">
						{#if style.value === 'bubbles'}
							<span class="sp-bubble"></span>
							<span class="sp-bubble sp-right sp-user"></span>
							<span class="sp-bubble sp-wide"></span>
						{:else if style.value === 'flat'}
							<span class="sp-bubble"></span>
							<span class="sp-bubble sp-user"></span>
							<span class="sp-bubble sp-wide"></span>
						{:else if style.value === 'portrait'}
							<span class="sp-card">
								<span class="sp-portrait"></span>
								<span class="sp-lines">
									<span class="sp-line sp-name"></span>
									<span class="sp-line"></span>
									<span class="sp-line sp-short"></span>
								</span>
							</span>
							<span class="sp-card">
								<span class="sp-portrait"></span>
								<span class="sp-lines">
									<span class="sp-line sp-name"></span>
									<span class="sp-line sp-short"></span>
								</span>
							</span>
						{:else}
							<span class="sp-line sp-name"></span>
							<span class="sp-line"></span>
							<span class="sp-line"></span>
							<span class="sp-line sp-short"></span>
						{/if}
					</span>
					<span class="style-name">{style.label}</span>
					<span class="style-hint">{style.hint}</span>
				</button>
			{/each}
		</div>
	</section>

	{#if isManuscript}
		<p class="style-note">
			Manuscript draws no cards and no portraits, so the shape, color and portrait
			settings have nothing to style and are hidden until you pick another style.
		</p>
	{:else}
		<section class="card" data-setting="message-shape">
			<div class="card-head">
				<span class="card-title">{i18n.t('chatpg.messageShape')}</span>
				<InfoTip text={i18n.t('chatpg.messageShapeTip')} />
			</div>

			<div class="card-body">
				<div class="slider-block">
					<div class="slider-top">
						<label for="bubble-radius" class="slider-label">{i18n.t('chatpg.cardCorners')}</label>
						<span class="slider-value">{pct(appearance.bubbleRadius)}</span>
					</div>
					<input
						id="bubble-radius"
						type="range"
						class="slider"
						min="0"
						max="1.6"
						step="0.05"
						value={appearance.bubbleRadius}
						oninput={(e) => themeStore.update({ bubbleRadius: parseFloat(e.currentTarget.value) })}
						use:rangeReset={{
							defaultValue: DEFAULT_APPEARANCE.bubbleRadius,
							apply: (v) => themeStore.update({ bubbleRadius: v })
						}}
					/>
				</div>

				<div class="sub-block">
					<span class="section-label">{i18n.t('chatpg.innerPadding')}</span>
					<PillRow
						options={PADDING_OPTIONS}
						current={appearance.bubblePadding}
						onpick={(v) => themeStore.update({ bubblePadding: v as BubblePadding })}
						label={i18n.t('lbl.innerPadding')}
					/>
				</div>

				<div class="sub-block">
					<span class="section-label">{i18n.t('chatpg.outline')}</span>
					<PillRow
						options={BORDER_OPTIONS}
						current={appearance.bubbleBorder}
						onpick={(v) => themeStore.update({ bubbleBorder: v as BubbleBorder })}
						label={i18n.t('lbl.outline')}
					/>
				</div>

				<div class="sub-block">
					<span class="section-label">{i18n.t('chatpg.shadow')}</span>
					<PillRow
						options={SHADOW_OPTIONS}
						current={appearance.bubbleShadow}
						onpick={(v) => themeStore.update({ bubbleShadow: v as BubbleShadow })}
						label={i18n.t('lbl.shadow')}
					/>
				</div>

				<!-- Lives here rather than under Message Colors: it decides whether there
				     is a card at all, which is shape's business, and the outline and
				     shadow above it fade along with the fill. -->
				<div class="slider-block">
					<div class="slider-top">
						<label for="bubble-opacity" class="slider-label">{i18n.t('chatpg.cardOpacity')}</label>
						<span class="slider-value">{pct(appearance.bubbleOpacity)}</span>
					</div>
					<input
						id="bubble-opacity"
						type="range"
						class="slider"
						min="0"
						max="1"
						step="0.01"
						value={appearance.bubbleOpacity}
						oninput={(e) => themeStore.update({ bubbleOpacity: parseFloat(e.currentTarget.value) })}
						use:rangeReset={{
							defaultValue: DEFAULT_APPEARANCE.bubbleOpacity,
							apply: (v) => themeStore.update({ bubbleOpacity: v })
						}}
					/>
					<p class="field-hint">
						Fill, outline and shadow fade together, so the whole card dissolves at zero
						and comes back as you set it. Rides on top of the Glass setting.
					</p>
				</div>

				<!-- Portraits cards are always full width by design. -->
				{#if bubbleLike}
					<div class="slider-block">
						<div class="slider-top">
							<label for="bubble-width" class="slider-label">{i18n.t('chatpg.cardWidth')}</label>
							<span class="slider-value">{pct(appearance.bubbleWidth)}</span>
						</div>
						<input
							id="bubble-width"
							type="range"
							class="slider"
							min="0.55"
							max="1"
							step="0.01"
							value={appearance.bubbleWidth}
							oninput={(e) => themeStore.update({ bubbleWidth: parseFloat(e.currentTarget.value) })}
							use:rangeReset={{
								defaultValue: DEFAULT_APPEARANCE.bubbleWidth,
								apply: (v) => themeStore.update({ bubbleWidth: v })
							}}
						/>
					</div>
				{/if}
			</div>
		</section>

		<section class="card" data-setting="message-colors">
			<div class="card-head">
				<span class="card-title">{i18n.t('chatpg.messageColors')}</span>
				<InfoTip text={i18n.t('chatpg.messageColorsTip')} />
			</div>

			<div class="card-body">
				<div class="slider-block">
					<div class="slider-top">
						<label for="user-tint" class="slider-label">{i18n.t('chatpg.yourTint')}</label>
						<!-- Swatch rides the right rail beside the amount, not the end of the
						     label: label lengths differ, so there it landed at a different x on
						     every row and read as something dropped in the gap. Here the two
						     rows line up and the pair says "this color, this much". -->
						<span class="slider-trailing">
							<ColorSwatchPicker
								value={appearance.userBubbleTint}
								oninput={(hex) => themeStore.update({ userBubbleTint: hex })}
								label={i18n.t('lbl.yourTint')}
							/>
							<span class="slider-value">{pct(appearance.userBubbleTintStrength)}</span>
						</span>
					</div>
					<input
						id="user-tint"
						type="range"
						class="slider"
						min="0"
						max="1"
						step="0.01"
						value={appearance.userBubbleTintStrength}
						oninput={(e) =>
							themeStore.update({ userBubbleTintStrength: parseFloat(e.currentTarget.value) })}
						use:rangeReset={{
							defaultValue: DEFAULT_APPEARANCE.userBubbleTintStrength,
							apply: (v) => themeStore.update({ userBubbleTintStrength: v })
						}}
					/>
				</div>

				<div class="slider-block">
					<div class="slider-top">
						<label for="assistant-tint" class="slider-label">{i18n.t('chatpg.charTint')}</label>
						<span class="slider-trailing">
							<ColorSwatchPicker
								value={appearance.assistantBubbleTint}
								oninput={(hex) => themeStore.update({ assistantBubbleTint: hex })}
								label={i18n.t('lbl.charTint')}
							/>
							<span class="slider-value">{pct(appearance.assistantBubbleTintStrength)}</span>
						</span>
					</div>
					<input
						id="assistant-tint"
						type="range"
						class="slider"
						min="0"
						max="1"
						step="0.01"
						value={appearance.assistantBubbleTintStrength}
						oninput={(e) =>
							themeStore.update({ assistantBubbleTintStrength: parseFloat(e.currentTarget.value) })}
						use:rangeReset={{
							defaultValue: DEFAULT_APPEARANCE.assistantBubbleTintStrength,
							apply: (v) => themeStore.update({ assistantBubbleTintStrength: v })
						}}
					/>
				</div>

			</div>
		</section>

		<section class="card" data-setting="message-avatars">
			<div class="card-head">
				<span class="card-title">{i18n.t('chatpg.portraitsTitle')}</span>
				<InfoTip text={i18n.t('chatpg.portraitsTip')} />
			</div>

			<div class="card-body">
				<div class="toggle-row" use:toggleRow>
					<span class="slider-label">{i18n.t('chatpg.showPortraits')}</span>
					<Toggle
						checked={appearance.showAvatars}
						label={i18n.t('lbl.showPortraits')}
						onchange={(on) => themeStore.update({ showAvatars: on })}
					/>
				</div>

				{#if appearance.showAvatars}
					<!-- The Portraits chat style owns its in-card 2:3 frame; only size applies there. -->
					{#if bubbleLike}
						<div class="sub-block">
							<span class="section-label">{i18n.t('chatpg.shape')}</span>
							<PillRow
								options={AVATAR_SHAPES}
								current={appearance.avatarShape}
								onpick={(v) => themeStore.update({ avatarShape: v as AvatarShape })}
								label={i18n.t('lbl.portraitShape')}
							/>
						</div>
					{/if}

					<div class="slider-block">
						<div class="slider-top">
							<label for="avatar-size" class="slider-label">{i18n.t('chatpg.size')}</label>
							<span class="slider-value">{pct(appearance.avatarSize)}</span>
						</div>
						<input
							id="avatar-size"
							type="range"
							class="slider"
							min="0.7"
							max="1.6"
							step="0.05"
							value={appearance.avatarSize}
							oninput={(e) => themeStore.update({ avatarSize: parseFloat(e.currentTarget.value) })}
							use:rangeReset={{
								defaultValue: DEFAULT_APPEARANCE.avatarSize,
								apply: (v) => themeStore.update({ avatarSize: v })
							}}
						/>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	<section class="card" data-setting="story-text">
		<div class="card-head">
			<span class="card-title">{i18n.t('chatpg.storyText')}</span>
			<InfoTip text={i18n.t('chatpg.storyTextTip')} />
		</div>

		<div class="card-body">
			<!-- Live sample rather than a drawn mockup: these colors and faces ride the same
			     global --prose-* properties and data-*-face attributes the transcript reads,
			     so real .prose markup here IS the preview. Without it the only way to judge a
			     pick is to leave Settings, open a chat, and hope the visible turns happen to
			     contain all three. Two paragraphs, and dialogue in both: the second is what
			     shows quoted speech carrying a line on its own. -->
			<div class="prose story-preview">
				<p>
					<span class="quoted-text">&ldquo;You came back,&rdquo;</span> she said, and the words
					landed <em>softer</em> than she meant them to. <strong>Nothing</strong> in the room
					had moved since.
				</p>
				<p>
					He set the lamp down between them.
					<span class="quoted-text">&ldquo;I never really left.&rdquo;</span>
				</p>
			</div>

			<div class="accent-list">
				{@render proseAccent({
					label: i18n.t('chatpg.quotedSpeech'),
					live: '--prose-quote-color',
					source: appearance.quoteColorSource,
					color: appearance.quoteColor,
					shipped: proseQuoteDefault('var(--color-text-primary)'),
					bold: appearance.quoteBold,
					italic: appearance.quoteItalic,
					onsource: (v) => themeStore.update({ quoteColorSource: v as ProseColorSource }),
					oncolor: (hex) => themeStore.update({ quoteColor: hex }),
					onbold: (on) => themeStore.update({ quoteBold: on }),
					onitalic: (on) => themeStore.update({ quoteItalic: on })
				})}

				{@render proseAccent({
					label: i18n.t('chatpg.emphasis'),
					live: '--prose-em-color',
					source: appearance.emphasisColorSource,
					color: appearance.emphasisColor,
					shipped: 'var(--color-text-secondary)',
					bold: appearance.emphasisBold,
					italic: appearance.emphasisItalic,
					onsource: (v) => themeStore.update({ emphasisColorSource: v as ProseColorSource }),
					oncolor: (hex) => themeStore.update({ emphasisColor: hex }),
					onbold: (on) => themeStore.update({ emphasisBold: on }),
					onitalic: (on) => themeStore.update({ emphasisItalic: on })
				})}

				{@render proseAccent({
					label: i18n.t('chatpg.strongText'),
					live: '--prose-strong-color',
					source: appearance.strongColorSource,
					color: appearance.strongColor,
					shipped: 'var(--color-text-primary)',
					bold: appearance.strongBold,
					italic: appearance.strongItalic,
					onsource: (v) => themeStore.update({ strongColorSource: v as ProseColorSource }),
					oncolor: (hex) => themeStore.update({ strongColor: hex }),
					onbold: (on) => themeStore.update({ strongBold: on }),
					onitalic: (on) => themeStore.update({ strongItalic: on })
				})}
			</div>

			<!-- Card-wide rather than per-accent: it is the whole story being lifted off
			     whatever sits behind it, not one run being decorated. -->
			<div class="slider-block">
				<div class="slider-top">
					<label for="prose-shadow" class="slider-label">{i18n.t('chatpg.textShadow')}</label>
					<span class="slider-value">{pct(appearance.proseShadow)}</span>
				</div>
				<input
					id="prose-shadow"
					type="range"
					class="slider"
					min="0"
					max="1"
					step="0.01"
					value={appearance.proseShadow}
					oninput={(e) => themeStore.update({ proseShadow: parseFloat(e.currentTarget.value) })}
					use:rangeReset={{
						defaultValue: DEFAULT_APPEARANCE.proseShadow,
						apply: (v) => themeStore.update({ proseShadow: v })
					}}
				/>
				<p class="field-hint">
					Lifts the story off a background showing through a faded card. Dark behind light
					text, light behind dark, so it never becomes a color to pick.
				</p>
			</div>
		</div>
	</section>

	<section class="card" data-setting="message-chrome">
		<div class="card-head">
			<span class="card-title">{i18n.t('chatpg.speakerControls')}</span>
			<InfoTip text={i18n.t('chatpg.speakerControlsTip')} />
		</div>

		<div class="card-body">
			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.showSpeaker')}</span>
				<Toggle
					checked={appearance.showSpeakerName}
					label={i18n.t('lbl.showSpeaker')}
					onchange={(on) => themeStore.update({ showSpeakerName: on })}
				/>
			</div>

			{#if appearance.showSpeakerName}
				<div class="sub-block">
					<span class="section-label">{i18n.t('chatpg.nameStyle')}</span>
					<PillRow
						options={SPEAKER_LABELS}
						current={appearance.speakerLabel}
						onpick={(v) => themeStore.update({ speakerLabel: v as SpeakerLabel })}
						label={i18n.t('lbl.nameStyle')}
					/>
				</div>

				<!-- Casing is its own switch, not a third pill: it combines with either
				     chrome, and an enum made "pill in small caps" unreachable. -->
				<div class="toggle-row" use:toggleRow>
					<span class="slider-label">{i18n.t('chatpg.smallCaps')}</span>
					<Toggle
						checked={appearance.speakerCaps}
						label={i18n.t('lbl.smallCaps')}
						onchange={(on) => themeStore.update({ speakerCaps: on })}
					/>
				</div>
			{/if}

			<div class="sub-block">
				<span class="section-label">{i18n.t('chatpg.messageActions')}</span>
				<PillRow
					options={ACTION_OPTIONS}
					current={appearance.messageActions}
					onpick={(v) => themeStore.update({ messageActions: v as ActionVisibility })}
					label={i18n.t('lbl.messageActions')}
				/>
			</div>

			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.compactActions')}</span>
				<Toggle
					checked={appearance.compactActions}
					label={i18n.t('lbl.compactActions')}
					onchange={(on) => themeStore.update({ compactActions: on })}
				/>
			</div>

			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.keepInView')}</span>
				<Toggle
					checked={appearance.floatingActions}
					label={i18n.t('lbl.keepInView')}
					onchange={(on) => themeStore.update({ floatingActions: on })}
				/>
			</div>

			<div class="sub-block">
				<span class="section-label">{i18n.t('chatpg.branchArrows')}</span>
				<PillRow
					options={PAGER_OPTIONS}
					current={appearance.branchPager}
					onpick={(v) => themeStore.update({ branchPager: v as PagerVisibility })}
					label={i18n.t('lbl.branchArrows')}
				/>
			</div>

			<!-- With Chat Memory switched off nothing is ever archived, so there is no ghost
			     for this to fade, the same "hidden, not inert" rule the chat-width slider
			     follows on phones. The stored value is untouched and returns with the engine. -->
			{#if featurePromptsStore.memoryEnabled}
				<div class="slider-block">
					<div class="slider-top">
						<label for="archived-opacity" class="slider-label">{i18n.t('chatpg.memoryGhost')}</label>
						<span class="slider-value">{pct(appearance.archivedOpacity)}</span>
					</div>
					<input
						id="archived-opacity"
						type="range"
						class="slider"
						min="0.25"
						max="1"
						step="0.01"
						value={appearance.archivedOpacity}
						oninput={(e) => themeStore.update({ archivedOpacity: parseFloat(e.currentTarget.value) })}
						use:rangeReset={{
							defaultValue: DEFAULT_APPEARANCE.archivedOpacity,
							apply: (v) => themeStore.update({ archivedOpacity: v })
						}}
					/>
					<p class="field-hint">
						How faint a turn goes once it has been folded into chat memory. Hovering one
						always brings it back to full.
					</p>
				</div>
			{/if}
		</div>
	</section>

	<section class="card" data-setting="message-details">
		<div class="card-head">
			<span class="card-title">{i18n.t('chatpg.messageDetails')}</span>
			<InfoTip text={i18n.t('chatpg.messageDetailsTip')} />
		</div>

		<div class="card-body">
			<!-- Positional, not stable ids: deleting a turn renumbers everything below it. -->
			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.showNumbers')}</span>
				<Toggle
					checked={appearance.showMessageNumbers}
					label={i18n.t('lbl.showNumbers')}
					onchange={(on) => themeStore.update({ showMessageNumbers: on })}
				/>
			</div>

			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.showTimestamps')}</span>
				<Toggle
					checked={appearance.showTimestamps}
					label={i18n.t('lbl.showTimestamps')}
					onchange={(on) => themeStore.update({ showTimestamps: on })}
				/>
			</div>

			{#if appearance.showTimestamps}
				<div class="sub-block">
					<span class="section-label">{i18n.t('chatpg.timestampFormat')}</span>
					<PillRow
						options={TIMESTAMP_FORMATS}
						current={appearance.timestampFormat}
						onpick={(v) => themeStore.update({ timestampFormat: v as TimestampFormat })}
						label={i18n.t('lbl.timestampFormat')}
					/>
				</div>

				{#if appearance.timestampFormat !== 'relative'}
					<div class="sub-block">
						<span class="section-label">{i18n.t('chatpg.clock')}</span>
						<PillRow
							options={CLOCK_FORMATS}
							current={appearance.clockFormat}
							onpick={(v) => themeStore.update({ clockFormat: v as ClockFormat })}
							label={i18n.t('lbl.clock')}
						/>
					</div>
				{/if}
			{/if}

			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.showModel')}</span>
				<Toggle
					checked={appearance.showModelName}
					label={i18n.t('lbl.showModel')}
					onchange={(on) => themeStore.update({ showModelName: on })}
				/>
			</div>

			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.showTokens')}</span>
				<Toggle
					checked={appearance.showTokenCount}
					label={i18n.t('lbl.showTokens')}
					onchange={(on) => themeStore.update({ showTokenCount: on })}
				/>
			</div>

			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.showReasoningTokens')}</span>
				<Toggle
					checked={appearance.showReasoningTokenCount}
					label={i18n.t('lbl.showReasoningTokens')}
					onchange={(on) => themeStore.update({ showReasoningTokenCount: on })}
				/>
			</div>

			<div class="toggle-row" use:toggleRow>
				<span class="slider-label">{i18n.t('chatpg.showGenTime')}</span>
				<Toggle
					checked={appearance.showGenerationTime}
					label={i18n.t('lbl.showGenTime')}
					onchange={(on) => themeStore.update({ showGenerationTime: on })}
				/>
			</div>
		</div>
	</section>

	{#if themeStore.isModified('chat')}
		<div class="page-reset" data-setting="chat-defaults">
			<button type="button" class="link-btn" onclick={() => (confirmRestore = true)}>
				{i18n.t('if.restoreConfirm')}
			</button>
		</div>
	{/if}
</div>

<ConfirmDialog
	open={confirmRestore}
	title={i18n.t('chatpg.restoreTitle')}
	message={i18n.t('chatpg.restoreMsg')}
	confirmLabel={i18n.t('if.restoreConfirm')}
	variant="danger"
	destructive
	onConfirm={restoreDefaults}
	onCancel={() => (confirmRestore = false)}
/>

<style>
	.chat-page {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	/* At the foot of the page, past everything it undoes, and out of the cards: it acts on
	   all of them at once and belongs to none. */
	.page-reset {
		display: flex;
		justify-content: flex-end;
		font-size: 0.72rem;
	}

	/* Labeled sub-group inside a card (the pill rows and color rows). */
	.sub-block {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	/* Swatch + value as one trailing group on a slider's top line. The readout gets
	   a fixed width so "0%" and "100%" don't shove the swatch sideways as you drag.
	   That reserved space is the whole reason the gap can stay this tight. */
	.slider-trailing {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		flex-shrink: 0;
	}

	.slider-trailing :global(.slider-value) {
		min-width: 2.4rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	/* The three story accents. Tighter than the card's own 0.9rem body gap on purpose:
	   they are three readings of one question, so they group as a block rather than
	   sitting as far apart as the sample and the shadow slider around them. */
	.accent-list {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	/* Name left, answers flush on the card's right edge, the line every toggle row on
	   this page already draws, so the accents join the card's rhythm instead of
	   inventing a grid of their own. */
	.accent-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		min-height: 2.1rem;
	}

	.accent-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--color-text-primary);
	}

	.accent-controls {
		display: flex;
		align-items: center;
		gap: 0.28rem;
		flex-shrink: 0;
	}

	/* Sized and toned to the swatch button beside it, so the three read as one cluster.
	   The letters carry their own meaning: the B is set in the interface font's bold and
	   the I in the story font's italic, which is the very thing each one turns on. */
	.face-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid color-mix(in srgb, var(--color-border) 88%, transparent);
		background: color-mix(in srgb, var(--color-bg-tertiary) 80%, transparent);
		color: var(--color-text-muted);
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 750;
		line-height: 1;
		cursor: pointer;
		transition: color 120ms ease, border-color 120ms ease, background-color 120ms ease;
	}

	.face-btn.face-italic {
		font-family: var(--font-body);
		font-style: italic;
		font-weight: 600;
	}

	.face-btn:hover {
		color: var(--color-text-secondary);
		border-color: color-mix(in srgb, var(--color-accent) 55%, var(--color-border) 45%);
	}

	.face-btn:focus-visible {
		outline: 0;
		border-color: color-mix(in srgb, var(--color-accent) 85%, white 15%);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-accent-muted) 70%, transparent);
	}

	/* Scoped mirror of the canonical .is-active-tint recipe: that one lives in a cascade
	   layer, so this unlayered scoped base would otherwise outrank it. After :hover, so
	   a pressed button stays tinted while the pointer is on it. */
	.face-btn.is-active-tint {
		color: var(--color-accent);
		background: color-mix(in srgb, var(--color-accent) 13%, transparent);
		border-color: color-mix(in srgb, var(--color-accent) 33%, transparent);
	}

	/* Reads as a scrap of transcript, not as another control: the palette's own
	   message surface, story font, no border chrome competing with the rows below.
	   Large enough to judge a slant and a weight by, which a caption size is not. */
	.story-preview {
		padding: 0.8rem 0.9rem;
		border-radius: var(--radius-md);
		background: var(--color-assistant-bubble);
		font-size: 0.88rem;
		line-height: 1.62;
		color: var(--color-text-primary);
	}

	.field-hint {
		margin: 0.3rem 0 0;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		line-height: 1.4;
		color: var(--color-text-muted);
	}

	.style-note {
		margin: 0;
		padding: 0.7rem 0.85rem;
		border-radius: var(--radius-md);
		border: 1px dashed color-mix(in srgb, var(--color-border) 70%, transparent);
		background: color-mix(in srgb, var(--color-bg-tertiary) 35%, transparent);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--color-text-muted);
	}

	/* --- Chat style cards --- */
	.style-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
		gap: 0.5rem;
	}

	.style-card {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0.4rem;
		padding: 0.55rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border-subtle);
		background: color-mix(in srgb, var(--color-bg-tertiary) 40%, transparent);
		cursor: pointer;
		text-align: left;
		transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
	}

	.style-card:hover {
		border-color: var(--color-border);
		transform: translateY(-1px);
	}

	.style-card.active {
		border-color: color-mix(in srgb, var(--color-accent) 55%, transparent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--color-accent) 40%, transparent);
	}

	.style-preview {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.3rem;
		height: 3.4rem;
		padding: 0.45rem 0.5rem;
		border-radius: calc(var(--radius-md) - 2px);
		border: 1px solid var(--color-border-subtle);
		background: var(--color-bg-primary);
		overflow: hidden;
	}

	.sp-bubble {
		display: block;
		height: 0.7rem;
		width: 52%;
		border-radius: 0.4rem;
		background: color-mix(in srgb, var(--color-text-muted) 40%, transparent);
	}

	/* Side and role are separate: Flat wears the user tint without the right edge. */
	.sp-bubble.sp-right {
		align-self: flex-end;
	}

	.sp-bubble.sp-user {
		background: color-mix(in srgb, var(--color-accent) 55%, transparent);
	}

	.sp-bubble.sp-wide {
		width: 64%;
	}

	.sp-card {
		display: flex;
		gap: 0.32rem;
		align-items: stretch;
	}

	.sp-portrait {
		flex: 0 0 0.85rem;
		border-radius: 0.2rem;
		background: color-mix(in srgb, var(--color-accent) 45%, var(--color-text-muted) 30%);
	}

	.sp-lines {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.22rem;
	}

	.sp-line {
		display: block;
		height: 0.18rem;
		width: 82%;
		border-radius: 999px;
		background: color-mix(in srgb, var(--color-text-muted) 45%, transparent);
	}

	.sp-line.sp-name {
		width: 38%;
		height: 0.24rem;
		background: color-mix(in srgb, var(--color-text-secondary) 75%, transparent);
	}

	.sp-line.sp-short {
		width: 55%;
	}

	.style-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 650;
		color: var(--color-text-primary);
	}

	.style-card.active .style-name {
		color: var(--color-accent);
	}

	.style-hint {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		line-height: 1.35;
		color: var(--color-text-muted);
	}
</style>
