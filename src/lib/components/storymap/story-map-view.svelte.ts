/**
 * The story map's camera: pan/zoom state, fit and focus arithmetic, the pointer
 * gesture router (drag vs. click vs. pinch), and the wheel. Extracted from
 * StoryMapView (risk-debt #6, W4b) so the geometry lives in one testable place;
 * the component keeps hover preview, selection and inspector, handing the camera
 * three callbacks instead of sharing mutable state with them.
 *
 * All reactive inputs arrive as getters so the factory reads live values; the DOM
 * elements arrive as `{ current }` boxes because bind:this must stay in the
 * component's template.
 */
import type { StoryMapNode } from '$lib/utils/story-map-layout';

// ===== Geometry (world coordinates) =====

export const PAD = 46;
export const COL_W = 56;
export const ROW_H = 98;
export const HIT_R = 22;
export const MIN_K = 0.05;
export const MAX_K = 2.6;
/** Below this the canvas is an overview, not a document: dots are specks, and a reader
 *  can't tell which one they are standing on. */
export const DETAIL_K = 0.35;
/** Zoom band a focus jump settles into (see centerOn). */
const FOCUS_K_MIN = 0.7;
const FOCUS_K_MAX = 1.3;

export const cxOf = (n: StoryMapNode): number => n.col * COL_W + PAD;
export const cyOf = (n: StoryMapNode): number => n.depth * ROW_H + PAD;

/** Screen-space slack around the viewport for node culling: covers the dot radius, the
 *  halo ring and the oversized hit disc, so a node just off-screen is still mounted when
 *  its edge or its neighbour's ring pokes into view. */
export const CULL_MARGIN = 48;

/** Viewport culling for the map canvas: whether a node's screen position falls inside the
 *  stage (plus margin). Pure arithmetic so a pan/zoom frame can afford one test per node
 *  even at several thousand nodes; the DOM then only carries what is on screen. */
export function isNodeVisible(
	n: StoryMapNode,
	view: { k: number; tx: number; ty: number; stageW: number; stageH: number },
	margin = CULL_MARGIN
): boolean {
	const sx = cxOf(n) * view.k + view.tx;
	const sy = cyOf(n) * view.k + view.ty;
	return (
		sx >= -margin &&
		sx <= view.stageW + margin &&
		sy >= -margin &&
		sy <= view.stageH + margin
	);
}

const R_MIN = 10;
const R_MAX = 19;
/** Square root, not linear: turns run from a dozen characters to several thousand. */
const R_FULL_AT = 2000;
export const rOf = (n: StoryMapNode): number =>
	R_MIN + (R_MAX - R_MIN) * Math.min(1, Math.sqrt(n.content.length / R_FULL_AT));

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The `[data-node]` element an event landed on, by its node id. */
export function nodeIdFromEvent(e: Event): string | null {
	const el = (e.target as HTMLElement | null)?.closest?.('[data-node]') as HTMLElement | null;
	return el?.getAttribute('data-node') ?? null;
}

function reducedMotion(): boolean {
	return (
		document.documentElement.getAttribute('data-motion') === 'reduced' ||
		window.matchMedia('(prefers-reduced-motion: reduce)').matches
	);
}

/** Wheel deltas are pixels on a trackpad, lines on a Firefox mouse wheel and pages on a
 *  page-scroll device. Same conversion as the chat column's margin wheel. */
export function wheelPixels(delta: number, mode: number, pageExtent: number): number {
	return delta * (mode === 1 ? 16 : mode === 2 ? pageExtent : 1);
}

export interface StoryMapViewDeps {
	stageEl: { readonly current: HTMLDivElement | undefined };
	canvasEl: { readonly current: HTMLDivElement | undefined };
	inspEl: { readonly current: HTMLDivElement | undefined };
	worldWidth: () => number;
	worldHeight: () => number;
	nodeCount: () => number;
	nodeById: () => Map<string, StoryMapNode>;
	activeLeafId: () => string | null;
	chatId: () => string | null;
	/** Whether a plain wheel pans (false: wheel zooms unless ctrl/pinch). */
	wheelPans: () => boolean;
	/** A tap that was not a drag, resolved to the node it landed on (null = empty canvas). */
	onNodeClick: (nodeId: string | null) => void;
	/** Plain mouse travel over the canvas (hover preview card). */
	onHoverMove: (e: PointerEvent) => void;
	/** A drag or pinch began: any hover preview must go. */
	onDragStart: () => void;
}

export function createStoryMapView(deps: StoryMapViewDeps) {
	let tx = $state(0);
	let ty = $state(0);
	let k = $state(1);
	let stageW = $state(0);
	let stageH = $state(0);
	let pct = $derived(Math.round(k * 100));
	let lastFitKey = '';
	/** True once the user pans/zooms by hand, after which a resize keeps their framing. */
	let userMovedView = false;

	let animId: number | null = null;
	function cancelAnim() {
		if (animId !== null) {
			cancelAnimationFrame(animId);
			animId = null;
		}
	}

	/** One rule for every camera move: how long it takes follows how far it actually goes. */
	function moveDuration(dx: number, dy: number, kRatio: number): number {
		return clamp(150 + Math.hypot(dx, dy) * 0.16 + Math.abs(Math.log2(kRatio)) * 90, 150, 420);
	}

	/** Camera tween. Scale interpolates geometrically (perceived zoom is logarithmic) and
	 *  the pan is derived from the world point under the stage centre, so the target's
	 *  screen path runs straight instead of bowing. Both endpoints stay exact. */
	function animateView(toTx: number, toTy: number, toK = k, dur?: number) {
		cancelAnim();
		const kRatio = toK / k;
		const ms = dur ?? moveDuration(toTx - tx, toTy - ty, kRatio);
		if (reducedMotion() || ms <= 0) {
			tx = toTx;
			ty = toTy;
			k = toK;
			return;
		}
		const px = stageW / 2;
		const py = stageH / 2;
		const k0 = k;
		const fromCx = (px - tx) / k0;
		const fromCy = (py - ty) / k0;
		const toCx = (px - toTx) / toK;
		const toCy = (py - toTy) / toK;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / ms);
			const e = 1 - Math.pow(1 - t, 3);
			const nk = k0 * Math.pow(kRatio, e);
			k = nk;
			tx = px - (fromCx + (toCx - fromCx) * e) * nk;
			ty = py - (fromCy + (toCy - fromCy) * e) * nk;
			animId = t < 1 ? requestAnimationFrame(step) : null;
		};
		animId = requestAnimationFrame(step);
	}

	function computeFit(): { tx: number; ty: number; k: number } | null {
		if (deps.nodeCount() === 0 || stageW === 0 || stageH === 0) return null;
		const ww = deps.worldWidth();
		const wh = deps.worldHeight();
		const nk = clamp(Math.min((stageW - 48) / ww, (stageH - 48) / wh, 1), MIN_K, MAX_K);
		return {
			tx: (stageW - ww * nk) / 2,
			ty: Math.max(20, (stageH - wh * nk) / 2),
			k: nk
		};
	}

	/** How the map arrives, which is NOT the same question as what Fit answers. A story
	 *  that only fits as specks opens on the reader's own position at a readable size. */
	function computeOpeningView(): { tx: number; ty: number; k: number } | null {
		const f = computeFit();
		if (!f || f.k >= DETAIL_K) return f;
		const leaf = deps.activeLeafId();
		const byId = deps.nodeById();
		const focusId = leaf && byId.has(leaf) ? leaf : deps.nodeCount() > 0 ? [...byId.values()][0]?.id : null;
		const n = focusId ? byId.get(focusId) : null;
		if (!n) return f;
		const nk = FOCUS_K_MIN;
		return { tx: stageW / 2 - cxOf(n) * nk, ty: stageH / 2 - cyOf(n) * nk, k: nk };
	}

	function openView(): boolean {
		const f = computeOpeningView();
		if (!f) return false;
		cancelAnim();
		tx = f.tx;
		ty = f.ty;
		k = f.k;
		userMovedView = false;
		return true;
	}

	function fitAnimated() {
		const f = computeFit();
		if (!f) return;
		animateView(f.tx, f.ty, f.k);
		userMovedView = false;
	}

	/** The stage area the inspector card/sheet doesn't cover, i.e. where nodes are readable. */
	function safeBox(): { left: number; top: number; right: number; bottom: number } {
		let left = 24;
		let top = 24;
		let right = stageW - 24;
		let bottom = stageH - 24;
		const insp = deps.inspEl.current;
		const stage = deps.stageEl.current;
		if (insp && stage) {
			const stageRect = stage.getBoundingClientRect();
			const r = insp.getBoundingClientRect();
			if (r.width > 0 && r.height > 0) {
				const sheetLike = r.top - stageRect.top > stageH * 0.5;
				if (sheetLike) bottom = Math.min(bottom, r.top - stageRect.top - 16);
				else right = Math.min(right, r.left - stageRect.left - 16);
			}
		}
		return { left, top, right, bottom };
	}

	function centerOn(id: string) {
		const n = deps.nodeById().get(id);
		if (!n) return;
		const b = safeBox();
		if (b.right - b.left < 80 || b.bottom - b.top < 80) return;
		const nk = clamp(k, FOCUS_K_MIN, FOCUS_K_MAX);
		animateView((b.left + b.right) / 2 - cxOf(n) * nk, (b.top + b.bottom) / 2 - cyOf(n) * nk, nk);
		// Jumping to a branch IS a framing choice, so a later resize must keep it.
		userMovedView = true;
	}

	/** Minimap navigation: instant, it tracks the dragging finger 1:1. */
	function centerWorld(wx: number, wy: number) {
		cancelAnim();
		tx = stageW / 2 - wx * k;
		ty = stageH / 2 - wy * k;
		userMovedView = true;
	}

	function zoomAt(px: number, py: number, factor: number) {
		const nk = clamp(k * factor, MIN_K, MAX_K);
		tx = px - (px - tx) * (nk / k);
		ty = py - (py - ty) * (nk / k);
		k = nk;
		userMovedView = true;
	}

	function zoomBy(factor: number) {
		cancelAnim();
		zoomAt(stageW / 2, stageH / 2, factor);
	}

	function onWheel(e: WheelEvent) {
		const canvas = deps.canvasEl.current;
		if (!canvas) return;
		e.preventDefault();
		cancelAnim();
		// A trackpad pinch reaches the page as ctrl+wheel, so the zoom modifier IS the pinch
		// gesture and has to keep zooming whichever way the plain wheel is set.
		const zooming = e.ctrlKey || e.metaKey || !deps.wheelPans();
		if (zooming && !e.shiftKey) {
			const rect = canvas.getBoundingClientRect();
			const dy = wheelPixels(e.deltaY, e.deltaMode, stageH);
			const factor = Math.exp(-dy * (Math.abs(dy) < 25 ? 0.012 : 0.0019));
			zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
			return;
		}
		const dx = wheelPixels(e.deltaX, e.deltaMode, stageW);
		const dy = wheelPixels(e.deltaY, e.deltaMode, stageH);
		tx -= e.shiftKey && dx === 0 ? dy : dx;
		if (!e.shiftKey) ty -= dy;
		userMovedView = true;
	}

	// ===== Pointer: pan vs. click vs. pinch =====

	const pointers = new Map<number, { x: number; y: number }>();
	let panning = $state(false);
	let moved = false;
	let pinching = false;
	let pinch0: { d: number; k: number; wx: number; wy: number } | null = null;
	let downX = 0;
	let downY = 0;
	let downTx = 0;
	let downTy = 0;
	let downNodeId: string | null = null;
	let lastPointerType = 'mouse';

	function nodeIdFromEvent(e: Event): string | null {
		const el = (e.target as HTMLElement | null)?.closest?.('[data-node]') as HTMLElement | null;
		return el?.getAttribute('data-node') ?? null;
	}

	/** Chromium arms its middle-click autoscroll on mousedown, and the middle-drag pan needs it gone. */
	function onMouseDown(e: MouseEvent) {
		if (e.button === 1) e.preventDefault();
	}

	function onPointerDown(e: PointerEvent) {
		// Left is drag-or-click; middle is a pure pan (never selects, never opens a turn).
		const middlePan = e.pointerType === 'mouse' && e.button === 1;
		if (e.pointerType === 'mouse' && e.button !== 0 && !middlePan) return;
		lastPointerType = e.pointerType;
		cancelAnim();
		deps.onDragStart();
		const canvas = deps.canvasEl.current;
		canvas?.setPointerCapture(e.pointerId);
		pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
		if (pointers.size === 1) {
			downX = e.clientX;
			downY = e.clientY;
			downTx = tx;
			downTy = ty;
			downNodeId = middlePan ? null : nodeIdFromEvent(e);
			moved = middlePan;
			panning = true;
		} else if (pointers.size === 2 && canvas) {
			const [p1, p2] = [...pointers.values()];
			const rect = canvas.getBoundingClientRect();
			const midX = (p1.x + p2.x) / 2 - rect.left;
			const midY = (p1.y + p2.y) / 2 - rect.top;
			pinch0 = {
				d: Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y)),
				k,
				wx: (midX - tx) / k,
				wy: (midY - ty) / k
			};
			pinching = true;
			moved = true; // a second finger is never a click
			downNodeId = null;
		}
	}

	function onPointerMove(e: PointerEvent) {
		if (pointers.has(e.pointerId)) {
			pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
			const canvas = deps.canvasEl.current;
			if (pinching && pointers.size >= 2 && pinch0 && canvas) {
				const [p1, p2] = [...pointers.values()];
				const rect = canvas.getBoundingClientRect();
				const midX = (p1.x + p2.x) / 2 - rect.left;
				const midY = (p1.y + p2.y) / 2 - rect.top;
				const d = Math.max(1, Math.hypot(p1.x - p2.x, p1.y - p2.y));
				const nk = clamp(pinch0.k * (d / pinch0.d), MIN_K, MAX_K);
				k = nk;
				tx = midX - pinch0.wx * nk;
				ty = midY - pinch0.wy * nk;
				userMovedView = true;
				return;
			}
			if (!panning) return;
			const dx = e.clientX - downX;
			const dy = e.clientY - downY;
			if (!moved && Math.hypot(dx, dy) > 4) moved = true;
			if (moved) {
				tx = downTx + dx;
				ty = downTy + dy;
				userMovedView = true;
			}
			return;
		}
		// No captured pointer: plain mouse travel drives the hover preview.
		if (e.pointerType === 'mouse') deps.onHoverMove(e);
	}

	function onPointerUp(e: PointerEvent) {
		if (!pointers.has(e.pointerId)) return;
		pointers.delete(e.pointerId);
		deps.canvasEl.current?.releasePointerCapture?.(e.pointerId);
		if (pinching) {
			if (pointers.size < 2) {
				pinching = false;
				pinch0 = null;
				if (pointers.size === 1) {
					// One finger stays down, so hand over to panning without a jump.
					const [p] = [...pointers.values()];
					downX = p.x;
					downY = p.y;
					downTx = tx;
					downTy = ty;
				} else {
					panning = false;
				}
			}
			return;
		}
		if (pointers.size > 0) return;
		panning = false;
		if (moved) return; // it was a drag, not a click
		deps.onNodeClick(downNodeId);
	}

	// Stage size drives fit, the minimap and the hover card clamping. A resize keeps the
	// user's framing when they've moved by hand, otherwise re-fits.
	$effect(() => {
		const el = deps.stageEl.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			stageW = el.clientWidth;
			stageH = el.clientHeight;
			if (!userMovedView) openView();
		});
		ro.observe(el);
		stageW = el.clientWidth;
		stageH = el.clientHeight;
		return () => ro.disconnect();
	});

	// Reset the view once per chat (keyed on chat + has-nodes), the first time the stage has
	// a real size. Navigation within the same chat keeps the key stable, so the user's pan
	// / zoom survives jumping between branches.
	$effect(() => {
		const key = `${deps.chatId() ?? ''}:${deps.nodeCount() > 0}`;
		if (key === lastFitKey || !deps.stageEl.current || deps.nodeCount() === 0) return;
		requestAnimationFrame(() => {
			if (openView()) lastFitKey = key;
		});
	});

	return {
		get tx() {
			return tx;
		},
		get ty() {
			return ty;
		},
		get k() {
			return k;
		},
		get pct() {
			return pct;
		},
		get stageW() {
			return stageW;
		},
		get stageH() {
			return stageH;
		},
		get panning() {
			return panning;
		},
		get moved() {
			return moved;
		},
		get lastPointerType() {
			return lastPointerType;
		},
		openView,
		fitAnimated,
		animateView,
		centerOn,
		centerWorld,
		zoomBy,
		safeBox,
		onWheel,
		onMouseDown,
		onPointerDown,
		onPointerMove,
		onPointerUp
	};
}

export type StoryMapView = ReturnType<typeof createStoryMapView>;
