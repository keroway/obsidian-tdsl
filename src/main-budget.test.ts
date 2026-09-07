import { describe, expect, it } from "vitest";
// Vite's `?raw` gives the file's own text without pulling Node's fs types into
// the project (this repo deliberately keeps `types` free of "node", so plugin
// source cannot reach for Node APIs by accident).
import mainSource from "./main.ts?raw";

/**
 * `src/main.ts` is excluded from coverage (`vitest.config.ts`): it is the
 * Obsidian `Plugin` entry point, and every line of it is lifecycle and DOM
 * wiring that a unit test cannot reach without simulating the host app. #188
 * weighed the alternatives and kept the exclusion.
 *
 * The cost of that decision is that nothing stops main.ts from growing: logic
 * added there is invisible to the coverage gate. #219 moved four pure rules out
 * of it (`filterTemplates`, `planFenceTransform`, `populateRenderOptions`,
 * `applyRootAccessibility`), and this budget is what keeps them from drifting
 * back in.
 *
 * The number is a ratchet: when an extraction shrinks main.ts, lower it to the
 * new size. Raising it means new logic landed in the one file the coverage gate
 * cannot see — do that only with a reason in the PR, and prefer extracting the
 * logic into a testable module instead.
 */
const MAIN_TS_LINE_BUDGET = 1182;

describe("src/main.ts size budget", () => {
	const lineCount = mainSource.split("\n").length - 1;

	it("stays within the line budget", () => {
		expect(lineCount).toBeLessThanOrEqual(MAIN_TS_LINE_BUDGET);
	});

	it("keeps the budget tight enough to notice growth", () => {
		// A budget far above the real size stops being a signal. Lower it after
		// an extraction rather than banking the headroom.
		expect(MAIN_TS_LINE_BUDGET - lineCount).toBeLessThanOrEqual(50);
	});
});
