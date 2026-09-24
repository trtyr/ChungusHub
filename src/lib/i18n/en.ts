/**
 * English UI dictionary — the reference corpus.
 *
 * Keys must mirror zh.ts. When a key is missing in the active dictionary the
 * lookup falls back to en, so an untranslated row degrades to the original
 * wording rather than a raw key. Placeholders use {name}.
 */
export const en: Record<string, string> = {
	'connection.lost': 'No connection to the server. Nothing you write now is being saved.',
	'connection.retrying': 'Reconnecting…',

	// layout · DataAheadBar
	'dataahead.message':
		'This data was last used by a newer ChungusHub. Writing with this older one can damage it.',
	'dataahead.update': 'Update this copy.',

	// layout · ImportBar
	'import.running': 'Importing SillyTavern data',
	'common.stop': 'Stop',

	// layout · DeleteGuardBar
	'guard.minutesLeft': '{mins} minutes left',
	'guard.underMinute': 'under a minute left',
	'guard.restore': 'Turn back on',
	'guard.dismissAria': 'Dismiss',
	'guard.dismissTitle': 'Dismiss until this is turned on again',

	// layout · WelcomeDialog
	'welcome.title.hello': 'Welcome to ChungusHub',
	'welcome.title.persona': 'Who are you?',
	'welcome.lede':
		'Thank you for trying ChungusHub out. I started building it only for myself, and it grew big enough that sharing it seemed like the better idea: maybe a few people like me will enjoy it too.',
	'welcome.importNote':
		'Bringing a SillyTavern setup with you? Settings → Import reads a whole folder in one pass: characters, personas, lorebooks, chats and backgrounds.',
	'welcome.getStarted': 'Get started',
	'welcome.personaLede':
		'A persona is you in the story. Name one now and every chat starts with it; you can write more in the Library later.',
	'welcome.nameLabel': 'Name',
	'welcome.namePlaceholder': 'What the story calls you',
	'welcome.aboutLabel': 'About you',
	'common.optional': 'optional',
	'welcome.aboutPlaceholder': 'Appearance, presence, how you carry yourself…',
	'welcome.createPersona': 'Create persona',

	// layout · TitleBar
	'nav.presetControls': 'Preset Controls',
	'nav.storymap': 'Story Map',
	'nav.memory': 'Memory',
	'titlebar.settings': 'Settings',
	'titlebar.closeSettings': 'Close Settings ({key})',
	'titlebar.openSettings': 'Settings ({key})',
	'common.pinned': 'Pinned open. Click to unpin',
	'common.pinOpen': 'Pin open (ignores click-away and other panels)',
	'titlebar.library': 'Library',
	'titlebar.closeLibrary': 'Close Library ({key})',
	'titlebar.openLibrary': 'Library ({key})',

	// layout · AppShell boot state cards
	'launch.unreachableTitle': "Can't reach the server",
	'launch.unreachableCopy':
		'Make sure ChungusHub is still running, then leave this page open. Retrying…',
	'launch.waitingTitle': 'Waiting for the server',
	'launch.waitingCopy': 'Starting up. This page opens on its own.',
	'launch.preparingTitle': 'Preparing workspace',
	'launch.preparingCopy': 'Loading chats, presets, providers, and UI state.',
	'launch.errorTitle': 'Initialization error',
	'launch.retry': 'Retry launch',
	'launch.deniedTitle': 'Access denied',
	'launch.deniedCopy':
		"This device isn't on the allowlist. Ask the host to allow its IP from Settings → Security.",

	// layout · WelcomeView landing
	'welcome.eyebrow': 'Story Workspace',
	'welcome.newChat': 'New chat',
	'welcome.chats': 'Chats',
	'welcome.yourStats': 'Your stats',
	'welcome.recentAria': 'Recent chats',
	'welcome.continue': 'Continue',
	'welcome.allChats': 'All chats',
	'welcome.showLess': 'Show less',
	'welcome.showMore': 'Show more',
	'welcome.emptyChats': 'No chats yet',
	'common.community': 'Community',
	'welcome.asPersona': 'as {name}'
};
