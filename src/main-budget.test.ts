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
// Raised by 3 (issue #308): TdslPreview.renderDiagram() bails out after the
// ensureWasm() await (and in its catch) when the block was unloaded meanwhile.
// It cannot be extracted — it needs the instance's `unloaded` flag.
// Raised by 1 (issue #312): setupPanZoom() tags the wrapper `tdsl-pannable` so
// styles.css applies grab/touch-action only when pan/zoom is on. It cannot be
// extracted — setupPanZoom() itself lives in main.ts.
// Raised by 6 (issue #328): setupPanZoom() tracks the active pointerId and ends
// the drag on lostpointercapture. It cannot be extracted — the handlers close
// over setupPanZoom()'s local drag state and the SVG element.
// Raised by 17 (issue #343): addItemTooltips() wires focus/blur/Escape so the
// tooltip is reachable by keyboard. The show/hide rule itself lives in
// tooltip-visibility.ts; what remains is DOM listener wiring and anchoring to
// the focused item's rect, which closes over the wrapper and tooltip element.
// Raised by 1 (issue #349): addItemTooltips() now keeps one tooltip state per
// wrapper instead of per item. The ownership rule lives in
// tooltip-visibility.ts; what remains is DOM wiring over the shared tooltip.
// Raised by 1 (issue #358): setupPanZoom()'s wheel handler ignores deltaY === 0
// so horizontal-only input is no longer consumed as a zoom-out. It cannot be
// extracted — the handler closes over setupPanZoom()'s viewBox state.
// Raised by 7 (issue #360): addItemTooltips() wires the document-level Escape
// listener so a hover tooltip closes whatever has focus. The attach/detach and
// self-cleanup rule lives in escape-listener.ts; what remains is hooking it to
// the tooltip's visibility, which closes over the wrapper and tooltip state.
const MAIN_TS_LINE_BUDGET = 1255;

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
