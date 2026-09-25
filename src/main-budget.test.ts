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
// Raised by 5 (issue #268): saveSettings() wraps this.saveData() in a
// try/catch that surfaces a Notice on failure, matching every other async
// entry point in this file. It cannot be extracted — it needs `this.saveData`
// and `this.app.workspace`, both only available on the live Plugin instance.
// Raised by 10 (issue #270): the format/lint-fix editorCallbacks now wrap
// ensureWasm() in try/catch + Notice, matching every other ensureWasm() call
// site in this file. It cannot be extracted — editorCallback needs the live
// Editor instance and the module-level ensureWasm() closure.
// Raised by 14 (issue #276): saveSettings() now counts Markdown leaves and
// surfaces a console.error + Notice when previewMode is unavailable, instead
// of silently leaving previews stale. It cannot be extracted — it needs
// `this.app.workspace.iterateAllLeaves`, only available on the live Plugin
// instance.
const MAIN_TS_LINE_BUDGET = 1219;

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
