/**
 * Hash deep links for the workspace panels (risk-debt #11): the SPA has no URL
 * routing, so a refresh (or a shared link) used to land back on the bare
 * workspace with every panel closed. The location hash now mirrors the open
 * panel, one direction on every change, the other on load and on hashchange:
 *
 *   #chats  #preset-controls  #storymap  #memory  #stats   chat-area overlays
 *   #settings                                        settings dock
 *   #library[/characters|/personas|/lorebooks]       library dock (+ shelf)
 *   #assistant                                       assistant widget
 *
 * One value at a time, mirroring the panels' own mutual exclusion; the assistant
 * is only expressed when no other panel claims the hash. replaceState, not
 * pushState: panel shuffling must not fabricate browser history. Unknown or
 * stale values are ignored rather than corrected, so an old shared link to a
 * renamed panel degrades to the plain workspace instead of erroring.
 *
 * Pure parsing lives in url-hash.ts so tests can load it without runes.
 */
import { uiStore } from '$lib/stores/ui.svelte';
import { OVERLAY_HASHES, hashForPanels, parseHash } from '$lib/stores/url-hash';
import type { LibraryTab } from '$lib/stores/ui.svelte';

/** The hash that names the currently open panel, or '' for the plain workspace. */
export function hashForUi(): string {
	return hashForPanels({
		activeOverlay: uiStore.activeOverlay,
		settingsOpen: uiStore.settingsOpen,
		libraryOpen: uiStore.libraryOpen,
		libraryTab: uiStore.libraryTab,
		assistantOpen: uiStore.assistantOpen
	});
}

/** Push a panel target from a hash into the UI store (idempotent per panel). A cleared
 *  or unrecognised hash means the plain workspace: whatever panel stood is closed, so
 *  editing the address bar (or a back/forward step) lands where it names. */
export function applyHashToUi(): void {
	const target = parseHash(location.hash);
	switch (target.kind) {
		case 'overlay':
			uiStore.openOverlay(target.overlay);
			break;
		case 'settings':
			uiStore.openSettings();
			break;
		case 'library':
			if (!uiStore.libraryOpen) uiStore.openLibrary();
			if (target.tab) uiStore.setLibraryTab(target.tab as LibraryTab);
			break;
		case 'assistant':
			uiStore.assistantOpen = true;
			break;
		case 'none':
			if (uiStore.activeOverlay) uiStore.closeOverlay();
			if (uiStore.settingsOpen) uiStore.closeSettings();
			if (uiStore.libraryOpen) uiStore.closeLibrary();
			uiStore.assistantOpen = false;
			break;
	}
}

let installed = false;

/** Wire hash <-> UI both ways. Call once from AppShell's script (component init,
 *  so the $effect binds to that component); safe to call again. Applies the
 *  current hash first, so a deep link lands before the first paint of the
 *  panels it names.
 *
 * Panel changes are pushed as history entries, so the browser's back button
 * closes the panel that change opened (and forward reopens it): workspace
 * navigation behaves like navigation, which is the point of the deep links. */
export function installUrlSync(): void {
	if (installed) return;
	installed = true;

	applyHashToUi();
	window.addEventListener('hashchange', applyHashToUi);

	$effect(() => {
		const next = hashForUi();
		if (location.hash !== next) {
			history.pushState(null, '', next || location.pathname + location.search);
		}
	});
}
