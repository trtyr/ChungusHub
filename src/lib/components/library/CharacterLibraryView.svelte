<script lang="ts">
	import { characterLibraryStore } from '$lib/stores/characterLibrary.svelte';
	import { chatStore } from '$lib/stores/chat.svelte';
	import { db } from '$lib/services/database';
	import { chatCastStore } from '$lib/stores/chatCast.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { viewport } from '$lib/stores/viewport.svelte';
	import { workspaceFocus } from '$lib/stores/workspaceFocus.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { importSillyTavernCard } from '$lib/services/sillyTavernImport';
	import { createBookIndex } from '$lib/lorebook/identity';
	import { lorebookStore } from '$lib/lorebook/store.svelte';
	import { generalSettingsStore } from '$lib/stores/general-settings.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
import { i18n } from '$lib/i18n/i18n.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Toggle from '$lib/components/ui/Toggle.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { holdMsForBlast } from '$lib/components/ui/HoldToConfirmButton.svelte';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import type { ImportResult } from '$lib/services/sillyTavernImport';
	import BrowsePopover from './BrowsePopover.svelte';
	import LibraryCompactCard from './LibraryCompactCard.svelte';
	import LibraryGalleryCard from './LibraryGalleryCard.svelte';
	import LibraryListRow from './LibraryListRow.svelte';
	import LibraryOpenChatRow from './LibraryOpenChatRow.svelte';
	import LibraryPager from './LibraryPager.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import ConvertEntryDialog from './ConvertEntryDialog.svelte';
	import {
		CHARACTER_SORT_OPTIONS,
		PER_PAGE_OPTIONS,
		CARD_SIZE_MAP,
		sortEntries,
		matchesSearch,
		rankSearchResults,
		type ChatStats,
		type SortOption,
		type ViewMode
	} from './browse';
	import { libraryViewPrefs, DEFAULTS as BROWSE_DEFAULTS } from '$lib/stores/browseViewPrefs.svelte';
	import { rangeReset } from '$lib/actions/rangeReset';

	// Characters half of the merged Library (see LibraryView): the browse list. The
	// entry editor itself opens wide and centered over the chat (LibraryEditorOverlay);
	// this view just picks which entry that is via uiStore.libraryEditorId.
	let selectedEntryId = $derived(uiStore.libraryEditorId);

	// Mirror the open entry into the workspace-focus store so the Chungus Assistant can
	// auto-attach "the character you're editing". On close (libraryEditorId → null while
	// mounted) this clears it; on unmount the effect is torn down without running:
	// uiStore releases the focus itself on every real navigation away from the Library.
	$effect(() => {
		workspaceFocus.setEntry(selectedEntryId);
	});

	// View mode (grid cards vs. detail list). Persisted via the synced settings spine.
	let viewMode = $derived(libraryViewPrefs.viewMode);
	let listTags = $derived(libraryViewPrefs.listTags);
	let listPortraits = $derived(libraryViewPrefs.listPortraits);

	function setViewMode(mode: ViewMode) {
		libraryViewPrefs.setViewMode(mode);
	}

	// Trap navigation while an unsaved brand-new entry is open: the ui store asks
	// this blocker before letting any panel switch through, and pulses guardPulse
	// when it vetoes so we can flash the panel red.
	$effect(() => {
		const blocker = () => !!selectedEntryId && characterLibraryStore.isUnconfirmedNew(selectedEntryId);
		uiStore.registerNavBlocker(blocker);
		return () => uiStore.clearNavBlocker(blocker);
	});

	let guardFlash = $state(false);
	let lastGuardPulse = uiStore.guardPulse;
	let guardFlashTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const pulse = uiStore.guardPulse;
		if (pulse === lastGuardPulse) return;
		lastGuardPulse = pulse;
		guardFlash = true;
		if (guardFlashTimer) clearTimeout(guardFlashTimer);
		guardFlashTimer = setTimeout(() => (guardFlash = false), 800);
		toastStore.error(i18n.t('t.saveOrDiscard'));
	});

	// SillyTavern import
	let importInputRef = $state<HTMLInputElement | null>(null);
	let importing = $state(false);

	// Parsed cards waiting on the embedded-lorebook decision. A card without an
	// embedded book has hasBook=false and imports its character regardless.
	type PendingImport = { result: ImportResult; hasBook: boolean; importBook: boolean };
	let pendingImports = $state<PendingImport[]>([]);
	let lorebookPromptOpen = $state(false);
	let pendingWithBooks = $derived(pendingImports.filter((p) => p.hasBook));
	let allBooksSelected = $derived(
		pendingWithBooks.length > 0 && pendingWithBooks.every((p) => p.importBook)
	);

	// Card size preference (1-5, where 3 is default). Persisted via the synced spine.
	let cardSize = $derived(libraryViewPrefs.cardSize);

	// Computed min-width for grid
	let cardMinWidth = $derived(CARD_SIZE_MAP[cardSize] ?? 160);

	function handleCardSizeChange(e: Event) {
		libraryViewPrefs.setCardSize(parseInt((e.target as HTMLInputElement).value, 10));
	}

	// Load library on mount
	$effect(() => {
		characterLibraryStore.load();
	});

	// Per-chat message stats for the chat-aware sorts. Re-fetched whenever the chat set
	// changes (not just on mount), so a bulk import that adds chats while the Library is
	// already open (docked/split view) refreshes the counts instead of reading stale ones
	// until a full page reload.
	let messageCounts = $state<Record<string, number>>({});
	let lastTalked = $state<Record<string, number>>({});

	$effect(() => {
		// Track the chat set so this effect re-runs on add/remove (import, delete), not
		// just on mount. The cleanup-guarded `cancelled` flag makes the LATEST fetch win:
		// a bulk import reassigns chatStore.chats once per chat, so several fetches can be
		// in flight at once and resolve out of order. Without the guard an earlier (staler)
		// aggregate could land after a newer one and freeze the counts mid-import.
		void chatStore.chats.length;
		let cancelled = false;
		Promise.all([db.getMessageCounts(), db.getLastUserMessageTimes()]).then(
			([counts, talked]) => {
				if (cancelled) return;
				messageCounts = counts;
				lastTalked = talked;
			}
		);
		return () => {
			cancelled = true;
		};
	});

	// Deep link from "Edit in Library" style buttons: open the requested
	// entry's editor, then consume the one-shot request so it doesn't re-fire.
	$effect(() => {
		const pending = uiStore.pendingLibraryEntryId;
		if (pending) {
			uiStore.libraryEditorId = pending;
			uiStore.pendingLibraryEntryId = null;
		}
	});

	// Sort & filter. Sort + per-page persist via the synced spine; the rest is transient.
	let searchQuery = $state('');
	let sortOption = $derived(libraryViewPrefs.sort);
	let selectedTags = $state<string[]>([]);
	let favoritesOnly = $state(false);
	let perPage = $derived(libraryViewPrefs.perPage);
	let currentPage = $state(1);

	// Progressive disclosure: the toolbar keeps search + New in the open; the power
	// features live behind these three popovers (filter / view options / more).
	let filterOpen = $state(false);
	let viewOpen = $state(false);
	let moreOpen = $state(false);

	// Random sort seed: fresh on mount and rerolled every time Random is picked, so each
	// pick reshuffles, but the order holds steady while searching/paging within a pick.
	let randomSeed = $state(Math.floor(Math.random() * 0xffffffff));

	function applySort(opt: SortOption) {
		if (opt === 'random') randomSeed = Math.floor(Math.random() * 0xffffffff);
		libraryViewPrefs.setSort(opt);
		currentPage = 1;
	}

	function applyPerPage(count: number) {
		libraryViewPrefs.setPerPage(count);
		currentPage = 1;
	}

	function handleSearchInput(e: Event) {
		searchQuery = (e.target as HTMLInputElement).value;
		currentPage = 1;
	}

	function toggleFavoritesOnly() {
		favoritesOnly = !favoritesOnly;
		currentPage = 1;
	}

	function toggleTag(tag: string) {
		if (selectedTags.includes(tag)) {
			selectedTags = selectedTags.filter(t => t !== tag);
		} else {
			selectedTags = [...selectedTags, tag];
		}
		currentPage = 1;
	}

	function clearAllFilters() {
		searchQuery = '';
		selectedTags = [];
		favoritesOnly = false;
		currentPage = 1;
	}

	// Tag filter mode + the checklist's type-ahead state (filter popover)
	type TagFilterMode = 'any' | 'all';
	let tagFilterMode = $state<TagFilterMode>('any');
	let tagSearchQuery = $state('');
	let highlightedIndex = $state(-1);

	// Reset highlight when the type-ahead query changes; reset both when the
	// popover closes so it reopens clean.
	$effect(() => {
		tagSearchQuery;
		highlightedIndex = -1;
	});

	$effect(() => {
		if (!filterOpen) {
			tagSearchQuery = '';
			highlightedIndex = -1;
		}
	});

	function handleTagInputKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			highlightedIndex = Math.min(highlightedIndex + 1, filteredAvailableTags.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlightedIndex = Math.max(highlightedIndex - 1, 0);
		} else if (e.key === 'Enter' && filteredAvailableTags.length > 0) {
			e.preventDefault();
			const idx = highlightedIndex >= 0 ? highlightedIndex : 0;
			toggleTag(filteredAvailableTags[idx].tag);
			tagSearchQuery = '';
			highlightedIndex = -1;
		}
	}

	async function handleToggleFavorite(id: string) {
		await characterLibraryStore.toggleFavorite(id);
	}

	// Entries pipeline: characters → search → tag filter → favorites filter → sort → paginate
	let sectionEntries = $derived(characterLibraryStore.characters);

	let availableTags = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const entry of sectionEntries) {
			if (entry.identity.tags) {
				for (const tag of entry.identity.tags) {
					counts.set(tag, (counts.get(tag) || 0) + 1);
				}
			}
		}
		return Array.from(counts.entries())
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count);
	});

	let filteredAvailableTags = $derived(
		availableTags.filter(t =>
			t.tag.toLowerCase().includes(tagSearchQuery.toLowerCase())
		)
	);

	// Per-character chat stats feeding the chat-aware sorts. lastActivity comes
	// from the last real user message. Creating a chat or seeding greetings does
	// NOT count as "talked", so never-talked characters sink to the bottom of Recent.
	let chatStats = $derived.by(() => {
		const map = new Map<string, ChatStats>();
		for (const chat of chatStore.chats) {
			if (!chat.characterId) continue;
			const messages = messageCounts[chat.id] ?? 0;
			const talked = lastTalked[chat.id] ?? 0;
			const cur = map.get(chat.characterId);
			if (cur) {
				cur.chats += 1;
				cur.messages += messages;
				if (talked > cur.lastActivity) cur.lastActivity = talked;
			} else {
				map.set(chat.characterId, { chats: 1, messages, lastActivity: talked });
			}
		}
		return map;
	});

	let processedEntries = $derived.by(() => {
		let entries = sectionEntries.filter((e) => matchesSearch(e, searchQuery));
		if (selectedTags.length > 0) {
			if (tagFilterMode === 'all') {
				entries = entries.filter(e => selectedTags.every(t => e.identity.tags?.includes(t)));
			} else {
				entries = entries.filter(e => e.identity.tags?.some(t => selectedTags.includes(t)));
			}
		}
		if (favoritesOnly) {
			entries = entries.filter(e => e.isFavorite);
		}
		const sorted = sortEntries(entries, sortOption, { chatStats, randomSeed });
		return rankSearchResults(sorted, searchQuery);
	});

	// Chips line + funnel badge: anything currently narrowing the list.
	let filtersActive = $derived(
		selectedTags.length > 0 || favoritesOnly || searchQuery.trim().length > 0
	);
	let activeFilterCount = $derived(selectedTags.length + (favoritesOnly ? 1 : 0));

	let totalPages = $derived(Math.max(1, Math.ceil(processedEntries.length / perPage)));
	let safePage = $derived(Math.min(currentPage, totalPages));
	let paginatedEntries = $derived(
		processedEntries.slice((safePage - 1) * perPage, safePage * perPage)
	);

	// Primary click opens the character's chat. When the library can't dock
	// beside the chat (narrow window / phone), it renders as an overlay covering
	// the chat it just opened. Close it so the chat is actually visible.
	// During the New chat flow the pick advances the flow instead (on to the
	// persona step); no chat opens or is created yet.
	async function handleSelectEntry(id: string) {
		if (uiStore.newChatStep) {
			uiStore.advanceNewChat(id);
			return;
		}
		// Picking a character while an entry editor is open exits the editor first, then
		// opens the chat like a normal browse pick. Honour the nav guard so an unsaved
		// brand-new entry isn't silently abandoned.
		if (uiStore.libraryEditorId) {
			if (uiStore.guardBlocksNav()) return;
			uiStore.libraryEditorId = null;
		}
		const latest = chatCastStore.latestChatForCharacter(id, chatStore.chats);
		if (latest) {
			await chatStore.selectChat(latest);
		} else {
			await chatStore.createChat({ characterId: id });
		}
		uiStore.closeOverlay();
		if (!viewport.canDockSettings) uiStore.closeLibrary();
	}

	// Open the editor, wired to the per-card edit button. The editor renders centered
	// over the chat (LibraryEditorOverlay); we just point it at this entry.
	function handleEditEntry(id: string) {
		uiStore.libraryEditorId = id;
	}

	// The character of the chat behind the panel, resolved against the WHOLE library rather
	// than the page on screen: a filter, a sort or a page is exactly what this steps over.
	let chatCharacter = $derived.by(() => {
		if (!generalSettingsStore.libraryOpenChatRow) return null;
		const characterId = chatStore.activeChat?.characterId;
		if (!characterId) return null;
		return (
			characterLibraryStore.entries.find((e) => e.id === characterId && e.type === 'character') ??
			null
		);
	});

	async function handleDuplicate(id: string) {
		const entry = await characterLibraryStore.duplicateEntry(id);
		if (entry) {
			toastStore.success(i18n.t('t.duplicatedNamed', { name: entry.identity.name || i18n.t('lbw.untitledEntry') }));
		}
	}

	// Export: opens the format/version dialog for the clicked card or the current selection.
	// No editor needed. Ids (not entry refs) stay live if the library reloads under the dialog.
	let exportIds = $state<string[] | null>(null);
	let exportTargets = $derived(
		exportIds
			? exportIds.flatMap((id) => {
					const entry = characterLibraryStore.entries.find((e) => e.id === id);
					return entry ? [{ entry, versions: characterLibraryStore.versionsFor(entry.id) }] : [];
				})
			: null
	);
	function handleExport(id: string) {
		exportIds = [id];
	}
	function exportSelection() {
		if (selectedCount === 0) return;
		exportIds = [...selectedIds];
	}

	// Making a persona of a character: the dialog holds the id, not the entry, so a library
	// reload under it stays consistent, the same rule the export dialog follows.
	let convertId = $state<string | null>(null);
	let convertEntry = $derived(
		convertId ? (characterLibraryStore.entries.find((e) => e.id === convertId) ?? null) : null
	);

	let deleteTargetId = $state<string | null>(null);
	let deleteTargetUsage = $state<{ chatCount: number; castCount: number } | null>(null);
	let deleteTargetName = $derived(
		deleteTargetId
			? characterLibraryStore.entries.find(e => e.id === deleteTargetId)?.identity.name || i18n.t('lbw.entryName')
			: ''
	);
	let deleteTargetMessage = $derived.by(() => {
		const base = i18n.t('clv.deleteAsk', { name: deleteTargetName });
		if (!deleteTargetUsage || deleteTargetUsage.castCount === 0) {
			return base;
		}
		return `${base} ${i18n.t('clv.delBound', { n: deleteTargetUsage.chatCount })}`;
	});

	async function handleDelete(id: string) {
		deleteTargetId = id;
		deleteTargetUsage = await characterLibraryStore.getEntryUsage(id);
	}

	async function confirmDelete() {
		if (!deleteTargetId) return;
		const id = deleteTargetId;
		deleteTargetId = null;
		deleteTargetUsage = null;
		const usage = await characterLibraryStore.deleteEntry(id);
		chatStore.unbindCharacterFromChats(usage.chatIds);
	}

	async function handleCreateNew() {
		const entry = await characterLibraryStore.createCharacter();
		uiStore.libraryEditorId = entry.id;
	}

	function handleImportClick() {
		importInputRef?.click();
	}

	async function handleImportFile(e: Event) {
		const input = e.target as HTMLInputElement;
		const files = input.files;
		if (!files || files.length === 0) return;

		importing = true;
		const parsed: PendingImport[] = [];
		for (const file of Array.from(files)) {
			try {
				const result = await importSillyTavernCard(file);
				const hasBook = !!(result.lorebook && result.lorebook.entries.length > 0);
				parsed.push({ result, hasBook, importBook: hasBook });
			} catch (error) {
				console.error(`Failed to import ${file.name}:`, error);
				toastStore.failed(i18n.t('f.importNamed3', { name: file.name }), error);
			}
		}
		input.value = '';
		importing = false;

		if (parsed.length === 0) return;

		// Any embedded lorebooks? Let the user choose which (if any) to bring in.
		if (parsed.some((p) => p.hasBook)) {
			pendingImports = parsed;
			lorebookPromptOpen = true;
			return;
		}

		await finalizeImport(parsed);
	}

	// Persist the parsed cards, importing each embedded lorebook only when its
	// importBook flag is set. Shared by the no-lorebook fast path and the dialog.
	async function finalizeImport(items: PendingImport[]) {
		lorebookPromptOpen = false;
		importing = true;
		let successCount = 0;
		let lastEntry: typeof characterLibraryStore.entries[0] | null = null;
		// Built once for the batch: a series of cards ships the same book in every one of them,
		// and one shelf row with a link from each character is what the reader asked for.
		const bookIndex = createBookIndex(lorebookStore.books);

		for (const item of items) {
			try {
				const { entry } = await characterLibraryStore.importFromSillyTavern(item.result, {
					importLorebook: item.importBook,
					bookIndex
				});
				lastEntry = entry;
				successCount++;
			} catch (error) {
				const name = item.result.character.name || 'character';
				console.error(`Failed to import ${name}:`, error);
				toastStore.failed(i18n.t('f.importNamed3', { name }), error);
			}
		}
		if (successCount > 0) {
			if (successCount === 1 && lastEntry) {
				toastStore.success(i18n.t('t.importedNamed', { name: lastEntry.identity.name || i18n.t('pcf.untitled') }));
				uiStore.libraryEditorId = lastEntry.id;
			} else {
				toastStore.success(i18n.t('t.importedChars', { n: successCount }));
			}
		}

		pendingImports = [];
		importing = false;
	}

	function toggleAllBooks() {
		const next = !allBooksSelected;
		for (const p of pendingImports) if (p.hasBook) p.importBook = next;
	}

	function importCharactersOnly() {
		for (const p of pendingImports) p.importBook = false;
		finalizeImport(pendingImports);
	}

	function cancelImport() {
		lorebookPromptOpen = false;
		pendingImports = [];
	}

	// ==================== Bulk selection ====================
	// Entered from the ⋯ menu ("Select multiple"), exited via the bar's Done.
	let selectionMode = $state(false);
	let selectedIds = $state<Set<string>>(new Set());

	let selectedEntries = $derived(sectionEntries.filter((e) => selectedIds.has(e.id)));
	// Count live entries, not raw ids: an entry deleted while selected would
	// otherwise keep inflating the "N selected" label with a stale id.
	let selectedCount = $derived(selectedEntries.length);
	let allFilteredSelected = $derived(
		processedEntries.length > 0 && processedEntries.every((e) => selectedIds.has(e.id))
	);

	// Union of tags across the current selection, which drives the "Remove tags" popover.
	let selectionTagUnion = $derived.by(() => {
		const set = new Set<string>();
		for (const e of selectedEntries) for (const t of e.identity.tags ?? []) set.add(t);
		return Array.from(set).sort((a, b) => a.localeCompare(b));
	});

	function toggleSelectionMode() {
		selectionMode = !selectionMode;
		if (!selectionMode) clearSelection();
	}

	function toggleSelect(id: string) {
		const next = new Set(selectedIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selectedIds = next;
	}

	function selectAllFiltered() {
		const next = new Set(selectedIds);
		for (const e of processedEntries) next.add(e.id);
		selectedIds = next;
	}

	function clearSelection() {
		selectedIds = new Set();
		favMenuOpen = false;
		tagsOpen = false;
	}

	// Esc leaves selection mode, but only when nothing above it (a popover or a
	// confirm dialog, which consume Esc themselves) is open.
	$effect(() => {
		if (!selectionMode) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			if (filterOpen || viewOpen || moreOpen || favMenuOpen || tagsOpen) return;
			if (bulkDeleteOpen || lorebookPromptOpen || exportIds || convertId) return;
			// Consume the press so the workspace's global Esc doesn't also close
			// the hosting Library panel.
			e.preventDefault();
			e.stopPropagation();
			toggleSelectionMode();
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	});

	// ---- Bulk delete ----
	let bulkDeleteOpen = $state(false);
	let bulkDeleteUsage = $state<{ boundCount: number; chatCount: number } | null>(null);
	let bulkDeleteMessage = $derived.by(() => {
		const n = selectedCount;
		const base = i18n.t('clv.bulkDeleteAsk', { n });
		if (!bulkDeleteUsage || bulkDeleteUsage.boundCount === 0) return base;
		const { boundCount, chatCount } = bulkDeleteUsage;
		return base + ' ' + i18n.t('clv.bulkBound', { bound: boundCount, chats: chatCount });
	});

	async function openBulkDelete() {
		if (selectedCount === 0) return;
		bulkDeleteUsage = await characterLibraryStore.getEntriesUsage([...selectedIds]);
		bulkDeleteOpen = true;
	}

	async function confirmBulkDelete() {
		const ids = [...selectedIds];
		bulkDeleteOpen = false;
		bulkDeleteUsage = null;
		const unboundChatIds = await characterLibraryStore.deleteEntries(ids);
		chatStore.unbindCharacterFromChats(unboundChatIds);
		toastStore.success(i18n.t('t.deletedChars', { n: ids.length }));
		clearSelection();
	}

	// ---- Bulk favorite ----
	async function bulkSetFavorite(isFavorite: boolean) {
		const ids = [...selectedIds];
		if (ids.length === 0) return;
		await characterLibraryStore.setFavoriteMany(ids, isFavorite);
		toastStore.success(i18n.t(isFavorite ? 't.faved' : 't.unfaved') + ' ' + i18n.t('t.favedN', { verb: '', n: ids.length }).trim());
	}

	// ---- Bulk favorite menu + tag editor popovers ----
	let favMenuOpen = $state(false);
	let tagsOpen = $state(false);
	let addTagsValue = $state('');

	async function submitAddTags() {
		const tags = addTagsValue.split(',').map((t) => t.trim()).filter(Boolean);
		if (tags.length === 0) return;
		const changed = await characterLibraryStore.addTagsMany([...selectedIds], tags);
		addTagsValue = '';
		tagsOpen = false;
		toastStore.success(i18n.t('t.tagsAdded', { n: changed }));
	}

	function handleAddTagsKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			submitAddTags();
		}
	}

	async function removeBulkTag(tag: string) {
		const changed = await characterLibraryStore.removeTagsMany([...selectedIds], [tag]);
		toastStore.success(i18n.t('t.removedTagFrom', { tag, n: changed }));
	}
</script>

<div class="brw" class:guard-flash={guardFlash}>
	<!-- Browse list only. The entry editor pops out centered over the chat
	     (LibraryEditorOverlay), so it isn't rendered here. -->

	<!-- The character of the open story, one press from its editor. It stands down while the
	     New chat flow or a selection owns the top of the panel: both are tasks of their own,
	     and a door out of them here would read as part of the task. -->
	{#if chatCharacter && !uiStore.newChatStep && !selectionMode}
		<LibraryOpenChatRow entry={chatCharacter} label={i18n.t('lbl.inThisChat')} onOpen={handleEditEntry} />
	{/if}

	{#if sectionEntries.length > 0}
		<!-- Toolbar: search front and center, three quiet disclosures, one primary action.
		     The entry count lives in the search placeholder. -->
		<div class="brw-bar">
			<div class="brw-search">
				<Icon name="search" class="brw-search-icon w-3.5 h-3.5" />
				<input
					type="text"
					value={searchQuery}
					oninput={handleSearchInput}
					placeholder={i18n.t('clv.searchPlaceholder', { n: sectionEntries.length })}
					aria-label={i18n.t('clv.searchAria')}
					class="input-base"
				/>
			</div>

			<!-- Filter & sort -->
			<BrowsePopover bind:open={filterOpen}>
				{#snippet trigger({ toggle, open })}
					<button
						type="button"
						class="brw-btn"
						class:is-active={open || activeFilterCount > 0}
						onclick={toggle}
						aria-haspopup="true"
						aria-expanded={open}
						aria-label={i18n.t('clv.filterSort')}
						title={i18n.t('clv.filterSort')}
					>
						<Icon name="filter" class="w-4 h-4" />
						{#if activeFilterCount > 0}
							<span class="brw-btn-badge">{activeFilterCount}</span>
						{/if}
					</button>
				{/snippet}

				<div class="brw-sec">
					<div class="brw-sec-head">
						<span class="brw-sec-title">{i18n.t('clv.sortBy')}</span>
					</div>
					<div class="brw-opts">
						{#each CHARACTER_SORT_OPTIONS as opt}
							<button
								type="button"
								class="brw-opt"
								class:is-active={sortOption === opt.id}
								onclick={() => applySort(opt.id)}
							>
								{i18n.t(opt.label)}
							</button>
						{/each}
					</div>
				</div>

				<div class="brw-sec">
					<div class="brw-sec-head">
						<span class="brw-sec-title">{i18n.t('clv.show')}</span>
					</div>
					<button
						type="button"
						class="brw-opt brw-opt--full"
						class:is-active={favoritesOnly}
						onclick={toggleFavoritesOnly}
						aria-pressed={favoritesOnly}
					>
						<Icon name="heart" class="w-3.5 h-3.5 {favoritesOnly ? 'fill-current' : ''}" />
						{i18n.t('clv.t73')}
					</button>
				</div>

				{#if availableTags.length > 0}
					<div class="brw-sec">
						<div class="brw-sec-head">
							<span class="brw-sec-title">{i18n.t('clv.tags')}</span>
							{#if selectedTags.length > 1}
								<div class="brw-mini-seg" role="group" aria-label={i18n.t('clv.tagMatchMode')}>
									<button
										type="button"
										class:is-active={tagFilterMode === 'any'}
										onclick={() => { tagFilterMode = 'any'; currentPage = 1; }}
										title={i18n.t('clv.anyTags')}
									>
										ANY
									</button>
									<button
										type="button"
										class:is-active={tagFilterMode === 'all'}
										onclick={() => { tagFilterMode = 'all'; currentPage = 1; }}
										title={i18n.t('clv.allTags')}
									>
										ALL
									</button>
								</div>
							{/if}
						</div>
						{#if availableTags.length > 6}
							<input
								type="text"
								bind:value={tagSearchQuery}
								onkeydown={handleTagInputKeydown}
								placeholder={i18n.t('clv.findTag')}
								role="combobox"
								aria-label={i18n.t('clv.findTag')}
								aria-autocomplete="list"
								aria-expanded="true"
								aria-controls="tag-filter-options"
								class="input-base w-full h-7 px-2.5 text-xs font-ui text-text-primary placeholder:text-text-muted"
							/>
						{/if}
						<div id="tag-filter-options" role="listbox" class="brw-tag-list">
							{#each filteredAvailableTags as { tag, count }, i}
								<button
									type="button"
									role="option"
									aria-selected={selectedTags.includes(tag)}
									class="brw-tag-row"
									class:is-checked={selectedTags.includes(tag)}
									class:is-highlighted={i === highlightedIndex}
									onclick={() => toggleTag(tag)}
								>
									<span class="brw-tag-check">
										<Icon name="check" class="w-2.5 h-2.5" />
									</span>
									<span class="brw-tag-name">{tag}</span>
									<span class="brw-tag-count">{count}</span>
								</button>
							{:else}
								<p class="px-1 py-1.5 text-xs font-ui text-text-muted">{i18n.t('clv.noTagMatch')}</p>
							{/each}
						</div>
					</div>
				{/if}
			</BrowsePopover>

			<!-- View options -->
			<BrowsePopover bind:open={viewOpen}>
				{#snippet trigger({ toggle, open })}
					<button
						type="button"
						class="brw-btn"
						class:is-active={open}
						onclick={toggle}
						aria-haspopup="true"
						aria-expanded={open}
						aria-label={i18n.t('clv.viewOptions')}
						title={i18n.t('clv.viewOptions')}
					>
						<Icon name="sliders" class="w-4 h-4" />
					</button>
				{/snippet}

				<div class="brw-sec">
					<div class="brw-sec-head">
						<span class="brw-sec-title">{i18n.t('clv.layout')}</span>
					</div>
					<div class="brw-opts brw-opts--3" role="group" aria-label={i18n.t('clv.viewOptions')}>
						<button
							type="button"
							class="brw-opt"
							class:is-active={viewMode === 'grid'}
							onclick={() => setViewMode('grid')}
							aria-pressed={viewMode === 'grid'}
						>
							<Icon name="grid" class="w-3.5 h-3.5" />
							{i18n.t('clv.viewGrid')}
						</button>
						<button
							type="button"
							class="brw-opt"
							class:is-active={viewMode === 'gallery'}
							onclick={() => setViewMode('gallery')}
							aria-pressed={viewMode === 'gallery'}
						>
							<Icon name="gallery" class="w-3.5 h-3.5" />
							{i18n.t('clv.viewGallery')}
						</button>
						<button
							type="button"
							class="brw-opt"
							class:is-active={viewMode === 'list'}
							onclick={() => setViewMode('list')}
							aria-pressed={viewMode === 'list'}
						>
							<Icon name="list" class="w-3.5 h-3.5" />
							{i18n.t('clv.viewList')}
						</button>
					</div>
				</div>

				{#if viewMode === 'list'}
					<div class="brw-sec space-y-2.5">
						<div class="flex items-center justify-between gap-2">
							<span class="brw-sec-title">{i18n.t('clv.showPortraits')}</span>
							<Toggle
								size="sm"
								checked={listPortraits}
								onchange={(v) => libraryViewPrefs.setListPortraits(v)}
								label={i18n.t('lbl.portraitsRow')}
							/>
						</div>
						<div class="flex items-center justify-between gap-2">
							<span class="brw-sec-title">{i18n.t('clv.showTags')}</span>
							<Toggle
								size="sm"
								checked={listTags}
								onchange={(v) => libraryViewPrefs.setListTags(v)}
								label={i18n.t('lbl.tagsRow')}
							/>
						</div>
					</div>
				{/if}

				{#if viewMode === 'grid'}
					<div class="brw-sec">
						<div class="brw-sec-head">
							<span class="brw-sec-title">{i18n.t('clv.cardSize')}</span>
						</div>
						<div class="flex items-center gap-2.5">
							<Icon name="image" class="w-4 h-4 text-text-muted shrink-0" />
							<input
								type="range"
								min="1"
								max="5"
								value={cardSize}
								oninput={handleCardSizeChange}
								use:rangeReset={{ defaultValue: BROWSE_DEFAULTS.cardSize, apply: (v) => libraryViewPrefs.setCardSize(v) }}
								class="brw-range"
								aria-label={i18n.t('clv.cardSize')}
							/>
						</div>
					</div>
				{/if}

				<div class="brw-sec">
					<div class="brw-sec-head">
						<span class="brw-sec-title">{i18n.t('clv.perPage')}</span>
					</div>
					<div class="brw-opts brw-opts--3">
						{#each PER_PAGE_OPTIONS as count}
							<button
								type="button"
								class="brw-opt"
								class:is-active={perPage === count}
								onclick={() => applyPerPage(count)}
							>
								{count}
							</button>
						{/each}
					</div>
				</div>
			</BrowsePopover>

			<!-- More: import + bulk selection -->
			<BrowsePopover bind:open={moreOpen} variant="menu">
				{#snippet trigger({ toggle, open })}
					<button
						type="button"
						class="brw-btn"
						class:is-active={open}
						onclick={toggle}
						aria-haspopup="menu"
						aria-expanded={open}
						aria-label={i18n.t('clv.more')}
						title={i18n.t('clv.more')}
					>
						{#if importing}
							<Spinner size="sm" />
						{:else}
							<Icon name="dotsVertical" class="w-4 h-4" />
						{/if}
					</button>
				{/snippet}

				<button
					type="button"
					role="menuitem"
					class="brw-menu-item"
					disabled={importing}
					onclick={() => { moreOpen = false; handleImportClick(); }}
				>
					<Icon name="upload" class="w-3.5 h-3.5" />
					{i18n.t('clv.t74')}
				</button>
				<button
					type="button"
					role="menuitem"
					class="brw-menu-item"
					onclick={() => { moreOpen = false; toggleSelectionMode(); }}
				>
					<Icon name="check" class="w-3.5 h-3.5" />
					{i18n.t(selectionMode ? 'clv.exitSelection' : 'clv.selectMultiple')}
				</button>
			</BrowsePopover>

			<button type="button" class="brw-new" onclick={handleCreateNew} title={i18n.t('clv.newCharacter')}>
				<Icon name="plus" class="w-4 h-4" />
				<span class="brw-new-label">{i18n.t('clv.new')}</span>
			</button>
		</div>

		<!-- Active filters: a summary line that only exists while something narrows the list -->
		{#if filtersActive}
			<div class="brw-chips">
				<span class="brw-chips-count">{i18n.t('clv.countOf', { n: processedEntries.length, m: sectionEntries.length })}</span>
				{#if selectedTags.length > 1}
					<button
						type="button"
						class="brw-chip-mode"
						onclick={() => { tagFilterMode = tagFilterMode === 'any' ? 'all' : 'any'; currentPage = 1; }}
						title={tagFilterMode === 'any' ? i18n.t('clv.anyShowing') : i18n.t('clv.allShowing')}
					>
						{tagFilterMode === 'any' ? i18n.t('lb.anyOf') : i18n.t('lb.allOf')}
					</button>
				{/if}
				{#each selectedTags as tag}
					<span class="brw-chip">
						{tag}
						<button type="button" class="brw-chip-x" onclick={() => toggleTag(tag)} aria-label={i18n.t('clv.removeTag', { tag })}>
							<Icon name="close" class="w-2.5 h-2.5" />
						</button>
					</span>
				{/each}
				{#if favoritesOnly}
					<span class="brw-chip">
						<Icon name="heart" class="w-2.5 h-2.5 fill-current" />
						{i18n.t('svc.favorites')}
						<button type="button" class="brw-chip-x" onclick={toggleFavoritesOnly} aria-label={i18n.t('clv.removeFavFilter')}>
							<Icon name="close" class="w-2.5 h-2.5" />
						</button>
					</span>
				{/if}
				<button type="button" class="brw-chips-clear" onclick={clearAllFilters}>{i18n.t('clv.clear')}</button>
			</div>
		{/if}

		<!-- Bulk selection bar: exit + count + scope links on the left, three actions
		     on the right (favorite menu, tag editor, delete). Labels appear when the
		     container has room; Esc leaves the mode. -->
		{#if selectionMode}
			<div class="brw-bulk">
				<button
					type="button"
					class="brw-bulk-x"
					onclick={toggleSelectionMode}
					aria-label={i18n.t('clv.exitSelection')}
					title={i18n.t('clv.exitSelectionTip')}
				>
					<Icon name="close" class="w-4 h-4" />
				</button>
				<span class="brw-bulk-count"><b>{selectedCount}</b> {i18n.t('clv.selected')}</span>
				<button
					type="button"
					class="brw-bulk-link"
					onclick={selectAllFiltered}
					disabled={allFilteredSelected}
				>
					{i18n.t('clv.allN', { n: processedEntries.length })}
				</button>
				<button
					type="button"
					class="brw-bulk-link"
					onclick={clearSelection}
					disabled={selectedCount === 0}
				>
					{i18n.t('common.none')}
				</button>
				<div class="brw-bulk-spacer"></div>

				<BrowsePopover bind:open={favMenuOpen} variant="menu">
					{#snippet trigger({ toggle, open })}
						<button
							type="button"
							class="brw-bulk-btn"
							onclick={toggle}
							disabled={selectedCount === 0}
							aria-haspopup="menu"
							aria-expanded={open}
							title={i18n.t('clv.favorite')}
						>
							<Icon name="heart" class="w-3.5 h-3.5" />
							<span class="brw-bulk-label">{i18n.t('clv.favorite')}</span>
							<Icon name="chevronDown" class="w-3 h-3" />
						</button>
					{/snippet}
					<button
						type="button"
						role="menuitem"
						class="brw-menu-item"
						onclick={() => { favMenuOpen = false; bulkSetFavorite(true); }}
					>
						<Icon name="heart" class="w-3.5 h-3.5 fill-current" />
						{i18n.t('sb.favoriteN', { n: selectedCount })}
					</button>
					<button
						type="button"
						role="menuitem"
						class="brw-menu-item"
						onclick={() => { favMenuOpen = false; bulkSetFavorite(false); }}
					>
						<Icon name="heart" class="w-3.5 h-3.5" />
						{i18n.t('sb.unfavoriteN', { n: selectedCount })}
					</button>
				</BrowsePopover>

				<BrowsePopover bind:open={tagsOpen}>
					{#snippet trigger({ toggle, open })}
						<button
							type="button"
							class="brw-bulk-btn"
							onclick={toggle}
							disabled={selectedCount === 0}
							aria-haspopup="true"
							aria-expanded={open}
							title={i18n.t('clv.bulkTags')}
						>
							<Icon name="tag" class="w-3.5 h-3.5" />
							<span class="brw-bulk-label">{i18n.t('clv.bulkTags')}</span>
						</button>
					{/snippet}
					<div class="brw-sec">
						<div class="brw-sec-head">
							<span class="brw-sec-title">{i18n.t('clv.addTags')}</span>
						</div>
						<div class="flex items-center gap-1.5">
							<!-- svelte-ignore a11y_autofocus -->
							<input
								type="text"
								bind:value={addTagsValue}
								onkeydown={handleAddTagsKeydown}
								placeholder={i18n.t('clv.tagsPlaceholder')}
								autofocus
								class="input-base flex-1 min-w-0 px-2.5 py-1.5 text-xs font-ui text-text-primary placeholder:text-text-muted"
							/>
							<Button
								variant="primary"
								size="sm"
								class="!px-2.5 !py-1.5 !text-xs"
								onclick={submitAddTags}
								disabled={!addTagsValue.trim()}
							>
								{i18n.t('common.add')}
							</Button>
						</div>
					</div>
					<div class="brw-sec">
						<div class="brw-sec-head">
							<span class="brw-sec-title">{i18n.t('clv.onSelection')}</span>
						</div>
						{#if selectionTagUnion.length === 0}
							<p class="px-1 py-1 text-xs font-ui text-text-muted">{i18n.t('clv.noTagsOnSelection')}</p>
						{:else}
							<div class="brw-tag-list">
								{#each selectionTagUnion as tag}
									<button
										type="button"
										class="brw-tag-row"
										onclick={() => removeBulkTag(tag)}
										title={i18n.t('clv.removeTagFrom', { tag })}
									>
										<span class="brw-tag-name">{tag}</span>
										<Icon name="close" class="w-3 h-3 shrink-0 text-text-muted" />
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</BrowsePopover>

				<button
					type="button"
					class="brw-bulk-btn"
					onclick={exportSelection}
					disabled={selectedCount === 0}
					title={i18n.t('clv.exportCards')}
				>
					<Icon name="download" class="w-3.5 h-3.5" />
					<span class="brw-bulk-label">{i18n.t('clv.export')}</span>
				</button>

				<button
					type="button"
					class="brw-bulk-btn brw-bulk-btn--danger"
					onclick={openBulkDelete}
					disabled={selectedCount === 0}
				>
					<Icon name="trash" class="w-3.5 h-3.5" />
					<span class="brw-bulk-label">{i18n.t('clv.delete')}</span>
				</button>
			</div>
		{/if}
	{/if}

	<!-- Browse area -->
	<div id="library-panel" role="region" aria-label={i18n.t('clv.charactersRegion')} class="brw-content">
		{#if characterLibraryStore.loading}
			<div class="flex items-center justify-center h-full">
				<div class="flex flex-col items-center gap-3 text-text-muted">
					<Spinner size="lg" />
					<span class="text-sm font-ui">{i18n.t('clv.loading')}</span>
				</div>
			</div>
		{:else if sectionEntries.length === 0}
			<div class="grid place-items-center h-full">
				<EmptyState icon="users" title={i18n.t('clv.noCharacters')}>
					{i18n.t('clv.noCharactersHint')}
					{#snippet actions()}
						<Button variant="primary" size="sm" onclick={handleCreateNew}>
							<Icon name="plus" class="w-4 h-4" />
							{i18n.t('clv.t75')}
						</Button>
						<Button variant="secondary" size="sm" onclick={handleImportClick} disabled={importing}>
							{#if importing}
								<Spinner size="sm" />
							{:else}
								<Icon name="upload" class="w-4 h-4" />
							{/if}
							{i18n.t('common.import')}
						</Button>
					{/snippet}
				</EmptyState>
			</div>
		{:else if processedEntries.length === 0}
			<div class="grid place-items-center h-full">
				<EmptyState icon="search" size="sm" title={i18n.t('clv.noMatches')}>
					{i18n.t('clv.noMatchesHint')}
					{#snippet actions()}
						<Button variant="ghost" size="sm" onclick={clearAllFilters}>
							{i18n.t('clv.t76')}
						</Button>
					{/snippet}
				</EmptyState>
			</div>
		{:else}
			{#if viewMode === 'grid'}
				<div
					class="brw-grid"
					style="grid-template-columns: repeat(auto-fill, minmax({cardMinWidth}px, 1fr));"
				>
					{#each paginatedEntries as entry (entry.id)}
						<LibraryCompactCard
							{entry}
							{selectionMode}
							selected={selectedIds.has(entry.id)}
							onToggleSelect={toggleSelect}
							onSelect={handleSelectEntry}
							onEdit={handleEditEntry}
							onDuplicate={handleDuplicate}
							onDelete={handleDelete}
							onToggleFavorite={handleToggleFavorite}
							onExport={handleExport}
							onConvert={(id) => (convertId = id)}
						/>
					{/each}
				</div>
			{:else if viewMode === 'gallery'}
				<div
					class="brw-grid"
					style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));"
				>
					{#each paginatedEntries as entry (entry.id)}
						<LibraryGalleryCard
							{entry}
							{selectionMode}
							selected={selectedIds.has(entry.id)}
							onToggleSelect={toggleSelect}
							onSelect={handleSelectEntry}
							onEdit={handleEditEntry}
							onDuplicate={handleDuplicate}
							onDelete={handleDelete}
							onToggleFavorite={handleToggleFavorite}
							onExport={handleExport}
							onConvert={(id) => (convertId = id)}
						/>
					{/each}
				</div>
			{:else}
				<div class="flex flex-col divide-y divide-border-subtle">
					{#each paginatedEntries as entry (entry.id)}
						<LibraryListRow
							{entry}
							{selectionMode}
							selected={selectedIds.has(entry.id)}
							onToggleSelect={toggleSelect}
							onSelect={handleSelectEntry}
							onEdit={handleEditEntry}
							onDuplicate={handleDuplicate}
							onDelete={handleDelete}
							onToggleFavorite={handleToggleFavorite}
							onExport={handleExport}
							onConvert={(id) => (convertId = id)}
							onTagClick={toggleTag}
							showTags={listTags}
							showPortrait={listPortraits}
						/>
					{/each}
				</div>
			{/if}

			<!-- Pagination -->
			{#if totalPages > 1}
				<div class="brw-pager">
					<span class="brw-pager-count">
						{i18n.t('clv.showingOf', { a: (safePage - 1) * perPage + 1, b: Math.min(safePage * perPage, processedEntries.length), m: processedEntries.length })}
					</span>
					<LibraryPager page={safePage} {totalPages} onPage={(p) => (currentPage = p)} />
				</div>
			{/if}
		{/if}
	</div>
</div>

<!-- Hidden file input for SillyTavern import -->
<input
	bind:this={importInputRef}
	type="file"
	accept=".png,.json"
	multiple
	onchange={handleImportFile}
	class="hidden"
/>

<ConfirmDialog
	open={deleteTargetId !== null}
	title={i18n.t('clv.deleteTitle')}
	message={deleteTargetMessage}
	confirmLabel={i18n.t('common.delete')}
	variant="danger"
	destructive
	onConfirm={confirmDelete}
	onCancel={() => deleteTargetId = null}
/>

{#if exportTargets && exportTargets.length > 0}
	<ExportDialog open targets={exportTargets} onClose={() => (exportIds = null)} />
{/if}

{#if convertEntry}
	<ConvertEntryDialog open entry={convertEntry} onClose={() => (convertId = null)} />
{/if}

<ConfirmDialog
	open={bulkDeleteOpen}
	title={i18n.t('clv.deleteBulk', { n: selectedCount })}
	message={bulkDeleteMessage}
	confirmLabel={i18n.t('clv.deleteBulk', { n: selectedCount })}
	variant="danger"
	destructive
	holdMs={holdMsForBlast(selectedCount)}
	onConfirm={confirmBulkDelete}
	onCancel={() => { bulkDeleteOpen = false; bulkDeleteUsage = null; }}
/>

<Dialog
	open={lorebookPromptOpen}
	onClose={cancelImport}
	title={i18n.t('clv.importLorebooks')}
	size="lg"
>
	<div class="space-y-4">
		<p class="text-sm text-text-secondary">
			{i18n.t('clv.ofImported', { n: pendingWithBooks.length })}
			{pendingWithBooks.length === 1 ? i18n.t('clv.embedded1') : i18n.t('clv.embeddedN')}
			
		</p>

		<div class="flex items-center justify-between">
			<button type="button" class="text-sm text-accent hover:underline" onclick={toggleAllBooks}>
				{i18n.t(allBooksSelected ? 'common.deselectAll' : 'common.selectAll')}
			</button>
			<span class="text-xs text-text-tertiary">
				{pendingWithBooks.filter((p) => p.importBook).length} {i18n.t('clv.selected')}
			</span>
		</div>

		<ul class="space-y-2 max-h-[50dvh] overflow-y-auto">
			{#each pendingWithBooks as item (item.result)}
				<li>
					<label class="flex items-start gap-3 p-3 rounded-[var(--radius-lg)] border border-border-subtle hover:bg-bg-tertiary cursor-pointer">
						<input type="checkbox" bind:checked={item.importBook} class="mt-1" />
						<span class="min-w-0">
							<span class="block text-sm font-medium text-text-primary truncate">
								{item.result.character.name || i18n.t('setup.unnamedPersona')}
							</span>
							<span class="block text-xs text-text-secondary truncate">
								{i18n.t(item.result.lorebook?.name || 'st.gLorebooks')} · {i18n.t('lbw.nEntries', { n: item.result.lorebook?.entries.length ?? 0 })}
							</span>
						</span>
					</label>
				</li>
			{/each}
		</ul>

		<div class="flex justify-end gap-2 pt-1">
			<Button variant="ghost" onclick={cancelImport}>{i18n.t('common.cancel')}</Button>
			<Button variant="secondary" onclick={importCharactersOnly}>{i18n.t('clv.charactersOnly')}</Button>
			<Button variant="primary" onclick={() => finalizeImport(pendingImports)}>{i18n.t('clv.import')}</Button>
		</div>
	</div>
</Dialog>
