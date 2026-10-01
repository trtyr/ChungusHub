import { untrack } from 'svelte';

/**
 * Throttled mirror of a fast-moving stream (EN-21, 2026-10-01).
 *
 * The streaming display pipeline (display-scope regex → markdown → tokenizer) is
 * O(content length) per recomputation. Recomputing it per streamed token made the
 * work O(n²) over a reply: by a few thousand characters the paint fell minutes
 * behind the server, which is exactly the "服务端已经 5000 字、屏幕才 1000 字"
 * report — the server accumulates at full speed while the UI crawls.
 *
 * Slice the stream instead: the raw state still updates per token, while anything
 * reading `.value` recomputes at most once per slice (trailing edge guaranteed, so
 * the final tail always lands). The slice widens with length, trading a
 * sub-perceptual paint delay for a bounded recomputation cost on long replies.
 *
 * Call once from component init (the $effect binds to that component, same pattern
 * as installUrlSync).
 */
export function streamSlice(get: () => string, baseSliceMs = 150): { readonly value: string } {
	let tick = $state(0);
	let lastFire = 0;
	let timer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		get(); // track the raw stream; the timer does the rest
		const now = performance.now();
		const len = untrack(get).length;
		const sliceMs = Math.max(baseSliceMs, Math.min(400, len / 25));
		const fire = () => {
			lastFire = performance.now();
			timer = null;
			tick += 1;
		};
		if (now - lastFire >= sliceMs) {
			fire();
		} else if (timer === null) {
			timer = setTimeout(fire, sliceMs - (now - lastFire));
		}
	});

	return {
		get value() {
			void tick; // recompute only when the slice fires
			return untrack(get);
		}
	};
}
