/**
 * The settings information architecture, in ONE place: the root groups and rows
 * (a phone-style drill-down, with no icon tab rail), which page hosts each
 * assistant deep-link anchor, and the per-row live previews shown on the root.
 *
 * Hand-kept couplings:
 *  - Every `data-setting` anchor in a page component (and its twin in
 *    `server/assistant/registry/settings.ts`) needs an ANCHOR_PAGES entry, or
 *    `navigateTo` can't reach its page (architecture/chungus-assistant.md rule 1).
 *  - `TAB_FALLBACK_PAGE` covers every `SettingsTab`: the assistant's `tab` ids are
 *    the deep-link contract, and there is no rail for them to point at.
 *  - Previews read singleton stores/services; the root re-renders on every
 *    page return (keyed), so they refresh without being reactive. Soundscapes' is
 *    the exception: its row's play button changes it with the list on screen, so
 *    everything it reads has to be a rune.
 *  - A page added here needs its arm in `SettingsPageView.svelte`, or its row
 *    opens an empty panel.
 */
import { llmService } from '$lib/services/llm/provider';
import { connectionStore } from '$lib/stores/connections.svelte';
import { ENGINES } from '$lib/engines/registry';
import { backupStore } from '$lib/stores/backups.svelte';
import { advancedSettingsStore } from '$lib/stores/advanced-settings.svelte';
import { audioSettingsStore } from '$lib/stores/audio-settings.svelte';
import { soundscapeStore } from '$lib/stores/soundscape.svelte';
import { soundscapePlayer } from '$lib/services/soundscapePlayer.svelte';
import { SOUND_EVENTS } from '$lib/config/sound-events';
import { APP_VERSION } from '$lib/version';

/**
 * The assistant's deep-link tab ids. No icon rail carries them, so they exist purely
 * as the `navigate` contract, which is why they live here with the rest of the settings IA
 * rather than in the UI store. `TAB_FALLBACK_PAGE` below is typed `Record<SettingsTab, …>`,
 * which is what forces a new tab to land somewhere real. `NavTarget` (types/assistant.ts)
 * imports this union; the server's copy is asserted in `src/lib/contracts.test.ts`.
 */
export type SettingsTab =
	| 'general'
	| 'connection'
	| 'interface'
	| 'advanced'
	| 'security'
	| 'engines'
	| 'audio'
	| 'promptBuilder'
	| 'regex';

export type SettingsPage =
	// Connection
	| 'connections'
	// Appearance
	| 'interface'
	| 'language'
	| 'chat'
	// Audio
	| 'notifications'
	| 'soundscapes'
	// App
	| 'general'
	| 'engines'
	| 'security'
	| 'import'
	| 'backups'
	// Advanced
	| 'prompt-builder'
	| 'regex'
	| 'advanced'
	// About
	| 'about'
	| 'developer';

/** Literal subset of ui/Icon's IconName (not exported there), all verified members. */
export type SettingsRowIcon =
	| 'radar'
	| 'globe'
	| 'sun'
	| 'columns'
	| 'image'
	| 'settings'
	| 'bolt'
	| 'shield'
	| 'wrench'
	| 'filter'
	| 'flask'
	| 'download'
	| 'archive'
	| 'info'
	| 'bell'
	| 'music'
	| 'sliders';

export interface SettingsRow {
	page: SettingsPage;
	label: string;
	icon: SettingsRowIcon;
	/** Live value shown on the root row; omit for rows with no one-line summary. */
	preview?: () => { key: string; params?: Record<string, string | number> };
	/** A row that is not always there. Omit for the permanent ones. Read on every render of
	 *  the root list, so a row can come and go while the list is on screen (split view). */
	shown?: () => boolean;
}

export interface SettingsGroup {
	label: string;
	rows: SettingsRow[];
}

function connectionsSummary(): { key: string; params?: Record<string, string | number> } {
	const id = llmService.getPrimaryModel();
	const model = id ? (id.split('/').pop() ?? id) : '';
	const count = connectionStore.list().length;
	if (!id) return { key: 'sp.sumNoModel' };
	return count > 1 ? { key: 'sp.sumConns', params: { model, count } } : { key: 'sp.sumModel', params: { model } };
}

function enginesSummary(): { key: string; params?: Record<string, string | number> } {
	const on = ENGINES.filter((e) => e.enabled.get()).length;
	return { key: 'sp.sumEngines', params: { on, total: ENGINES.length } };
}

function notificationsSummary(): { key: string; params?: Record<string, string | number> } {
	if (!audioSettingsStore.enabled) return { key: 'sp.sumOff' };
	return { key: 'sp.sumNotifications', params: { on: audioSettingsStore.activeCount, total: SOUND_EVENTS.length } };
}

/** Counts what is audible, not what was pressed, the way the mixer's own status line does. */
function soundscapesSummary(): { key: string; params?: Record<string, string | number> } {
	if (!soundscapeStore.playing) return { key: 'sp.sumOff' };
	if (soundscapePlayer.blocked) return { key: 'sp.sumSoundBlocked' };
	const ids = soundscapeStore.activeIds;
	const heard = ids.filter((id) => soundscapePlayer.sounding.has(id)).length;
	const failures = ids.filter((id) => soundscapePlayer.failed.has(id)).length;
	if (heard === ids.length) return { key: 'sp.sumSoundHeardAll', params: { n: heard } };
	if (heard === 0 && failures < ids.length) return { key: 'sp.sumSoundStarting' };
	return { key: 'sp.sumSoundHeard', params: { heard, total: ids.length } };
}

/**
 * Reads the settings half only. The listing is server state the page fetches when it opens,
 * and the root row must not be the thing that goes and gets it, since every return to the root
 * re-renders these previews, which would make walking around Settings poll the backup store.
 */
function backupsSummary(): { key: string; params?: Record<string, string | number> } {
	const { automatic, intervalHours } = backupStore.settings;
	if (!automatic) return { key: 'sp.sumBackupsOff' };
	if (intervalHours === 6) return { key: 'bk.every6' };
	return intervalHours === 24 ? { key: 'bk.onceDay' } : { key: 'bk.onceWeek' };
}

export const SETTINGS_GROUPS: SettingsGroup[] = [
	{
		label: 'sp.groupConnection',
		rows: [{ page: 'connections', label: 'sp.rowConnections', icon: 'radar', preview: connectionsSummary }]
	},
	{
		label: 'sp.groupApp',
		rows: [
			{ page: 'general', label: 'sp.rowGeneral', icon: 'settings' },
			{ page: 'engines', label: 'sp.rowEngines', icon: 'bolt', preview: enginesSummary },
			{ page: 'security', label: 'sp.rowSecurity', icon: 'shield' },
			{ page: 'backups', label: 'sp.rowBackups', icon: 'archive', preview: backupsSummary },
			{ page: 'import', label: 'sp.rowImport', icon: 'download' }
		]
	},
	{
		label: 'sp.groupAppearance',
		rows: [
			{ page: 'language', label: 'sp.rowLanguage', icon: 'globe' },
			{ page: 'interface', label: 'sp.rowInterface', icon: 'sun' },
			{ page: 'chat', label: 'sp.rowChat', icon: 'columns' }
		]
	},
	{
		label: 'sp.groupAudio',
		rows: [
			{ page: 'notifications', label: 'sp.rowNotifications', icon: 'bell', preview: notificationsSummary },
			{ page: 'soundscapes', label: 'sp.rowSoundscapes', icon: 'music', preview: soundscapesSummary }
		]
	},
	{
		label: 'sp.groupAdvanced',
		rows: [
			{ page: 'prompt-builder', label: 'sp.rowPromptBuilder', icon: 'wrench' },
			{ page: 'regex', label: 'sp.rowRegex', icon: 'filter' },
			{ page: 'advanced', label: 'sp.rowAdvanced', icon: 'flask' }
		]
	},
	{
		label: 'sp.groupAbout',
		rows: [
			{ page: 'about', label: 'sp.rowAbout', icon: 'info', preview: () => ({ key: 'sp.sumVersion', params: { v: APP_VERSION } }) },
			{
				page: 'developer',
				label: 'sp.rowDeveloper',
				icon: 'sliders',
				shown: () => advancedSettingsStore.developerMode
			}
		]
	}
];

/** Which page hosts each assistant deep-link `data-setting` anchor. */
export const ANCHOR_PAGES: Record<string, SettingsPage> = {
	// Connection (all live inside the Connections page / its editor)
	connections: 'connections',
	'model-routing': 'connections',
	provider: 'connections',
	'api-key': 'connections',
	'primary-model': 'connections',
	generation: 'connections',
	'response-behavior': 'connections',
	'context-size': 'connections',
	'prompt-post-processing': 'connections',
	'prompt-caching': 'connections',
	// Appearance
	palette: 'interface',
	// A conditional anchor: it exists only while a palette is open in the editor, so a deep
	// link with none open lands on the page and flashes nothing. It is routable rather than a
	// bare marker because a `data-setting` with no entry here is an anchor the app cannot
	// reach, which is the rule at the top of this file. `interface-defaults` and
	// `chat-defaults` below are the same shape.
	'palette-editor': 'interface',
	accent: 'interface',
	'interface-type': 'interface',
	surfaces: 'interface',
	'chat-scene': 'interface',
	background: 'interface',
	'ambient-effects': 'interface',
	'reading-column': 'chat',
	'story-type': 'chat',
	'chat-style': 'chat',
	'message-shape': 'chat',
	'message-colors': 'chat',
	'message-avatars': 'chat',
	'story-text': 'chat',
	'message-chrome': 'chat',
	'message-details': 'chat',
	// One of these on each Appearance page, conditional the way `palette-editor` is: a page
	// already at the shipped default carries no Restore defaults, so a link lands on the
	// page and flashes nothing.
	'interface-defaults': 'interface',
	'chat-defaults': 'chat',
	// Audio
	'notification-sounds': 'notifications',
	'sound-events': 'notifications',
	soundscape: 'soundscapes',
	// General
	'message-drafts': 'general',
	'input-history': 'general',
	'long-chats': 'general',
	autoscroll: 'general',
	reasoning: 'general',
	'assistant-button': 'general',
	'library-open-chat': 'general',
	'story-map-scroll': 'general',
	'split-view': 'general',
	// Security
	'network-access': 'security',
	'ip-allowlist': 'security',
	'password-lock': 'security',
	// Backups
	'automatic-backups': 'backups',
	'backup-history': 'backups',
	// Engines
	engines: 'engines',
	// Workshop
	'prompt-builder': 'prompt-builder',
	'regex-rules': 'regex',
	'prompt-debug-panel': 'advanced',
	'prompt-review': 'advanced',
	'delete-confirmations': 'advanced',
	thumbnails: 'advanced'
};

/** Landing page per assistant tab id, for deep links whose anchor is unknown. */
export const TAB_FALLBACK_PAGE: Record<SettingsTab, SettingsPage> = {
	general: 'general',
	connection: 'connections',
	interface: 'interface',
	security: 'security',
	engines: 'engines',
	audio: 'notifications',
	promptBuilder: 'prompt-builder',
	regex: 'regex',
	advanced: 'advanced'
};

