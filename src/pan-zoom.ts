/** A parsed SVG `viewBox`: `min-x min-y width height`. */
export interface ViewBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 8;

/** Parses an SVG `viewBox` attribute value into its four numeric components. */
export function parseViewBox(raw: string): ViewBox | null {
	const parts = raw.trim().split(/\s+/).map(Number);
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
	const [x, y, width, height] = parts;
	if (width <= 0 || height <= 0) return null;
	return { x, y, width, height };
}

/** Serializes a `ViewBox` back into the attribute string format. */
export function formatViewBox(box: ViewBox): string {
	return `${box.x} ${box.y} ${box.width} ${box.height}`;
}

/**
 * Zooms `current` around a fixed point (in viewBox coordinates), scaled relative
 * to `original` (the viewBox the diagram was first rendered with).
 *
 * `factor` > 1 zooms in, < 1 zooms out. The resulting zoom level (original.width
 * / next.width) is clamped to [MIN_SCALE, MAX_SCALE] so the diagram can never be
 * panned/zoomed out past its natural size, nor zoomed in indefinitely.
 */
export function zoomViewBox(
	current: ViewBox,
	original: ViewBox,
	factor: number,
	focus: { x: number; y: number },
): ViewBox {
	const currentScale = original.width / current.width;
	const nextScale = Math.min(
		MAX_SCALE,
		Math.max(MIN_SCALE, currentScale * factor),
	);
	if (nextScale === currentScale) return current;

	const width = original.width / nextScale;
	const height = original.height / nextScale;

	// Keep the point under the cursor stationary: it sits at the same relative
	// offset within the viewBox before and after the resize.
	const ratioX = (focus.x - current.x) / current.width;
	const ratioY = (focus.y - current.y) / current.height;
	const x = focus.x - ratioX * width;
	const y = focus.y - ratioY * height;

	return clampViewBox({ x, y, width, height }, original);
}

/**
 * Pans `current` by a delta given in screen pixels, converting it into viewBox
 * units via `current.width / elementWidthPx` (and the height equivalent).
 */
export function panViewBox(
	current: ViewBox,
	original: ViewBox,
	deltaPx: { x: number; y: number },
	elementSizePx: { width: number; height: number },
): ViewBox {
	if (elementSizePx.width <= 0 || elementSizePx.height <= 0) return current;
	const x = current.x - (deltaPx.x / elementSizePx.width) * current.width;
	const y = current.y - (deltaPx.y / elementSizePx.height) * current.height;
	return clampViewBox(
		{ x, y, width: current.width, height: current.height },
		original,
	);
}

/** Returns the original viewBox, undoing any zoom/pan applied to it. */
export function resetViewBox(original: ViewBox): ViewBox {
	return original;
}

/**
 * Clamps a zoomed/panned viewBox so it never shows area outside the diagram's
 * natural bounds (`original`) — panning stops at the edge instead of revealing
 * empty space.
 */
function clampViewBox(box: ViewBox, original: ViewBox): ViewBox {
	const maxX = original.x + original.width - box.width;
	const maxY = original.y + original.height - box.height;
	// When the zoomed box is larger than the original on an axis (can't happen
	// given MIN_SCALE = 1, but guarded for safety), center it instead of clamping
	// into an inverted range.
	const x =
		maxX >= original.x
			? Math.min(Math.max(box.x, original.x), maxX)
			: original.x;
	const y =
		maxY >= original.y
			? Math.min(Math.max(box.y, original.y), maxY)
			: original.y;
	return { x, y, width: box.width, height: box.height };
}
