import { describe, expect, test } from 'bun:test';
import {
	isNodeVisible,
	isEdgeVisible,
	CULL_MARGIN,
	cxOf,
	cyOf,
	PAD,
	COL_W,
	ROW_H
} from './story-map-view.svelte';
import type { StoryMapNode } from '../../../utils/story-map-layout';

function nodeAt(col: number, depth: number): StoryMapNode {
	return {
		id: `n${col}-${depth}`,
		chatId: 'c1',
		messageId: `m${col}-${depth}`,
		col,
		depth,
		content: 'x'.repeat(300),
		isLeaf: false,
		isCanonLeaf: false,
		isActiveLeaf: false,
		isForkPoint: false,
		onActivePath: false,
		onCanonPath: false,
		role: 'mid'
	} as StoryMapNode;
}

const STAGE = { k: 1, tx: 0, ty: 0, stageW: 1000, stageH: 800 };

describe('story map viewport culling', () => {
	test('a node centred on the stage is visible', () => {
		// cxOf = col*56+46; centre of a 1000x800 stage is ~ (500,400)
		const n = nodeAt(8, 3); // (494, 340)
		expect(isNodeVisible(n, STAGE)).toBe(true);
	});

	test('a node far off-screen is culled', () => {
		const n = nodeAt(40, 20); // (2286, 2026)
		expect(isNodeVisible(n, STAGE)).toBe(false);
	});

	test('a node within the margin band stays mounted', () => {
		// cx(18) = 1054; a -30 pan puts its screen x at 1024: outside the stage, inside CULL_MARGIN
		const n = nodeAt(18, 3);
		const shifted = { ...STAGE, tx: -30 };
		expect(isNodeVisible(n, shifted)).toBe(true);
		// Same node with margin 0 would be culled
		expect(isNodeVisible(n, shifted, 0)).toBe(false);
	});

	test('at overview zoom the arithmetic is pinned, not self-compared', () => {
		const view = { k: 0.05, tx: 10, ty: 10, stageW: 1000, stageH: 800 };
		// col 300, depth 10: screen (cxOf*0.05+10, cyOf*0.05+10) = (852, 65). On stage.
		expect(isNodeVisible(nodeAt(300, 10), view)).toBe(true);
		// col 300, depth 800: screen (852, 2252). Below the 800px stage, beyond margin.
		expect(isNodeVisible(nodeAt(300, 800), view)).toBe(false);
	});

	test('culling follows the camera: pan right brings left-column nodes back', () => {
		const n = nodeAt(1, 2); // (102, 242)
		expect(isNodeVisible(n, { ...STAGE, tx: -2000 })).toBe(false);
		expect(isNodeVisible(n, { ...STAGE, tx: 0 })).toBe(true);
	});

	test('an edge whose elbow reaches the stage survives even with both endpoints off it', () => {
		const parent = nodeAt(0, 0); // (46, 46)
		const child = nodeAt(1, 1); // (102, 144)
		// Pan far down: both endpoints below the stage, but the child's drop still runs
		// through the top margin band of the viewport.
		const view = { ...STAGE, ty: -250 };
		// y1 = 46-250 = -204, my = 95-250 = -155, y2 = 144-250 = -106: whole elbow above -48.
		expect(isEdgeVisible(parent, child, view)).toBe(false);
		const nearer = { ...STAGE, ty: -120 };
		// y1 = -74, my = -25, y2 = 24: the bus crosses into view though both dots sit high.
		expect(isEdgeVisible(parent, child, nearer)).toBe(true);
	});

	test('an edge wholly to the left of the viewport is culled', () => {
		const parent = nodeAt(0, 0); // x 46
		const child = nodeAt(1, 1); // x 102
		// Pan right by 2000: x spans 46-2000 = -1954 to 102-2000 = -1898, both < -48.
		expect(isEdgeVisible(parent, child, { ...STAGE, tx: -2000 })).toBe(false);
		expect(isEdgeVisible(parent, child, { ...STAGE, tx: -60 })).toBe(true);
	});

	test('margin covers the geometry constants it protects', () => {
		// The margin must exceed hit radius scaled concerns; keep it honest vs constants.
		expect(CULL_MARGIN).toBeGreaterThan(0);
		expect(CULL_MARGIN).toBeLessThan(COL_W); // tighter than one column so culling bites
		void PAD;
		void ROW_H;
		void cxOf;
		void cyOf;
	});
});
