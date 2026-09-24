/**
 * English UI dictionary — the reference corpus.
 *
 * Keys must mirror zh.ts. When a key is missing in the active dictionary the
 * lookup falls back to en, so an untranslated row degrades to the original
 * wording rather than a raw key. Placeholders use {name}.
 */
export const en: Record<string, string> = {
	'connection.lost': 'No connection to the server. Nothing you write now is being saved.',
	'connection.retrying': 'Reconnecting…'
};
