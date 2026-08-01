import { describe, expect, it } from "vitest";
import {
	formatViewBox,
	panViewBox,
	parseViewBox,
	resetViewBox,
	type ViewBox,
	zoomViewBox,
} from "./pan-zoom";

const original: ViewBox = { x: 0, y: 0, width: 800, height: 400 };

describe("parseViewBox", () => {
	it("parses a well-formed viewBox string", () => {
		expect(parseViewBox("0 0 800 400")).toEqual(original);
	});

	it("tolerates extra whitespace between numbers", () => {
		expect(parseViewBox("  0   0  800   400 ")).toEqual(original);
	});

	it("returns null for the wrong number of components", () => {
		expect(parseViewBox("0 0 800")).toBeNull();
	});

	it("returns null for non-numeric components", () => {
		expect(parseViewBox("0 0 800 auto")).toBeNull();
	});

	it("returns null for a non-positive width or height", () => {
		expect(parseViewBox("0 0 0 400")).toBeNull();
		expect(parseViewBox("0 0 800 -1")).toBeNull();
	});
});

describe("formatViewBox", () => {
	it("round-trips through parseViewBox", () => {
		const box: ViewBox = { x: 10, y: -5, width: 200, height: 100 };
		expect(parseViewBox(formatViewBox(box))).toEqual(box);
	});
});

describe("zoomViewBox", () => {
	it("shrinks the viewBox when zooming in (factor > 1)", () => {
		const next = zoomViewBox(original, original, 2, { x: 400, y: 200 });
		expect(next.width).toBeCloseTo(400);
		expect(next.height).toBeCloseTo(200);
	});

	it("keeps the focus point stationary within the viewBox", () => {
		const focus = { x: 200, y: 100 };
		const next = zoomViewBox(original, original, 2, focus);
		// focus sits at 25% across / down the original box; it must stay there.
		expect((focus.x - next.x) / next.width).toBeCloseTo(
			(focus.x - original.x) / original.width,
		);
		expect((focus.y - next.y) / next.height).toBeCloseTo(
			(focus.y - original.y) / original.height,
		);
	});

	it("clamps zoom-in at MAX_SCALE instead of shrinking indefinitely", () => {
		let box = original;
		for (let i = 0; i < 20; i++) {
			box = zoomViewBox(box, original, 2, { x: 400, y: 200 });
		}
		const again = zoomViewBox(box, original, 2, { x: 400, y: 200 });
		expect(again).toEqual(box);
	});

	it("never zooms out past the original viewBox (MIN_SCALE = 1)", () => {
		const zoomedOut = zoomViewBox(original, original, 0.5, { x: 400, y: 200 });
		expect(zoomedOut).toEqual(original);
	});

	it("is a no-op when the clamped scale does not change", () => {
		const next = zoomViewBox(original, original, 0.9, { x: 400, y: 200 });
		expect(next).toEqual(original);
	});
});

describe("panViewBox", () => {
	it("moves the viewBox origin opposite to a positive screen-pixel delta", () => {
		const zoomed = zoomViewBox(original, original, 2, { x: 400, y: 200 });
		const panned = panViewBox(
			zoomed,
			original,
			{ x: 40, y: 0 },
			{ width: 400, height: 200 },
		);
		// zoomed viewBox is 400x200 over a 400x200px element: 1:1 px-to-unit ratio.
		expect(panned.x).toBeCloseTo(zoomed.x - 40);
		expect(panned.y).toBeCloseTo(zoomed.y);
	});

	it("clamps panning at the original viewBox's edges", () => {
		const zoomed = zoomViewBox(original, original, 2, { x: 0, y: 0 });
		const panned = panViewBox(
			zoomed,
			original,
			{ x: -10000, y: -10000 },
			{ width: 400, height: 200 },
		);
		expect(panned.x).toBeGreaterThanOrEqual(original.x);
		expect(panned.y).toBeGreaterThanOrEqual(original.y);
		expect(panned.x + panned.width).toBeLessThanOrEqual(
			original.x + original.width + 1e-6,
		);
		expect(panned.y + panned.height).toBeLessThanOrEqual(
			original.y + original.height + 1e-6,
		);
	});

	it("returns the input unchanged when the element has zero size", () => {
		expect(
			panViewBox(original, original, { x: 10, y: 10 }, { width: 0, height: 0 }),
		).toEqual(original);
	});
});

describe("resetViewBox", () => {
	it("returns the original viewBox", () => {
		expect(resetViewBox(original)).toEqual(original);
	});
});
