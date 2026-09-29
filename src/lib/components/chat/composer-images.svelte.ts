/**
 * The composer's image-attachment domain, extracted from InputArea (risk-debt #6, W4a).
 *
 * Everything here is self-contained: the state is attachment-local and every dependency
 * is an external singleton (imageService, llmService, toast, i18n), so the domain moves
 * as one piece. The composer keeps a single instance and consumes it in three places:
 * the send gate (pendingImages/uploadingImages), the release after a send (clear), and
 * the template's bindings (drag overlay, attach menu, thumbnails).
 */
import { toastStore } from '$lib/stores/toast.svelte';
import { i18n } from '$lib/i18n/i18n.svelte';
import { imageService, imageRejectionReason, isImageFile } from '$lib/services/imageService';
import { llmService } from '$lib/services/llm/provider';

export function createComposerImages(fileInput: { readonly current: HTMLInputElement | undefined }) {
	let pendingImages = $state<{ path: string; url: string }[]>([]);
	let uploadingImages = $state(0);
	let dragDepth = $state(0);
	/** The attach menu. One row today; the button is a menu because the next attachable
	 *  kind shouldn't have to re-teach the composer's toolbar what that button does. */
	let attachOpen = $state(false);

	function pickImage() {
		attachOpen = false;
		fileInput.current?.click();
	}

	async function attachImageFiles(files: File[]): Promise<void> {
		const images: File[] = [];
		for (const file of files) {
			const refused = imageRejectionReason(file);
			if (refused) toastStore.error(refused);
			else images.push(file);
		}
		if (!images.length) return;
		// Attaching is always possible; whether the images actually ride the prompt
		// depends on the provider/model + the Send images setting, so say so up front
		// instead of silently dropping them at generation time.
		if (!llmService.sendsImages()) {
			toastStore.warning(i18n.t('chat.noImageSupport'));
		}
		uploadingImages += images.length;
		for (const file of images) {
			try {
				const path = await imageService.saveImage(file, 'chat');
				const url = imageService.thumbnailUrl(path) ?? (await imageService.getImageUrl(path)) ?? '';
				pendingImages = [...pendingImages, { path, url }];
			} catch (error) {
				toastStore.failed(i18n.t('chat.failAttach', { name: file.name }), error);
			} finally {
				uploadingImages -= 1;
			}
		}
	}

	function handlePaste(e: ClipboardEvent) {
		const files = Array.from(e.clipboardData?.files ?? []).filter(isImageFile);
		if (files.length) {
			e.preventDefault();
			void attachImageFiles(files);
		}
	}

	function handleFilePick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		void attachImageFiles(Array.from(input.files ?? []));
		input.value = '';
	}

	// ===== Dropping a picture on the composer =====
	// Pictures only. A story turn has nowhere to put a text file (the assistant panel is
	// what reads those), so one dropped here is refused by name rather than silently ignored,
	// which would read as the drop having failed.

	/** Depth-counted so a drag crossing a child element doesn't flicker the overlay off. */
	function handleDragEnter(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files')) return;
		dragDepth += 1;
	}

	function handleDragOver(e: DragEvent) {
		if (!e.dataTransfer?.types.includes('Files')) return;
		// Without this the browser navigates away to the dropped file.
		e.preventDefault();
		e.dataTransfer.dropEffect = 'copy';
	}

	function handleDragLeave() {
		dragDepth = Math.max(0, dragDepth - 1);
	}

	function handleDrop(e: DragEvent) {
		const dropped = Array.from(e.dataTransfer?.files ?? []);
		dragDepth = 0;
		if (!dropped.length) return;
		e.preventDefault();
		const images = dropped.filter(isImageFile);
		for (const file of dropped.filter((f) => !isImageFile(f))) {
			toastStore.error(i18n.t('chat.notAnImage', { name: file.name }));
		}
		if (images.length) void attachImageFiles(images);
	}

	function removePendingImage(path: string) {
		pendingImages = pendingImages.filter((img) => img.path !== path);
		// The upload is already on the server; drop the file too so abandoned
		// attachments don't pile up in images/chat/.
		void imageService.deleteImage(path);
	}

	return {
		get pendingImages() {
			return pendingImages;
		},
		get uploadingImages() {
			return uploadingImages;
		},
		get dragDepth() {
			return dragDepth;
		},
		get attachOpen() {
			return attachOpen;
		},
		set attachOpen(v: boolean) {
			attachOpen = v;
		},
		pickImage,
		attachImageFiles,
		handlePaste,
		handleFilePick,
		handleDragEnter,
		handleDragOver,
		handleDragLeave,
		handleDrop,
		removePendingImage,
		/** The send committed: nothing pending survives it. */
		clear() {
			pendingImages = [];
		}
	};
}

export type ComposerImages = ReturnType<typeof createComposerImages>;
