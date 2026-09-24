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
	'guard.dismissTitle': 'Dismiss until this is turned on again'
};
