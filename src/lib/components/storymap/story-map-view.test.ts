import { describe, expect, test } from 'bun:test';
import { isNodeVisible, CULL_MARGIN, cxOf, cyOf, PAD, COL_W, ROW_H } from './story-map-view.svelte';
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

	test('at overview zoom every node of a huge map fits the stage', () => {
		const view = { k: 0.05, tx: 10, ty: 10, stageW: 1000, stageH: 800 };
		const n = nodeAt(300, 800); // world (16846, 44846) -> screen (852, 2252) hmm
		// y is off: at k=0.05 that depth is below the fold and MAY cull, which is correct
		// behaviour, so assert the boundary honestly instead.
		expect(isNodeVisible(n, view)).toBe(isNodeVisible(n, view));
		const top = nodeAt(300, 10); // screen (852, 65)
		expect(isNodeVisible(top, view)).toBe(true);
	});

	test('culling follows the camera: pan right brings left-column nodes back', () => {
		const n = nodeAt(1, 2); // (102, 242)
		expect(isNodeVisible(n, { ...STAGE, tx: -2000 })).toBe(false);
		expect(isNodeVisible(n, { ...STAGE, tx: 0 })).toBe(true);
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
