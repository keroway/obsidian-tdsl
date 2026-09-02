import type { ResolvedRender } from "./utils";

/**
 * The subset of `JsRenderOptions` this plugin writes to.
 *
 * Declared structurally rather than importing the WASM class so the population
 * rules below can be unit-tested against a plain object — instantiating the
 * real class would require initializing the WASM module first.
 *
 * The field names are the WASM-side names and must stay in sync with
 * `@keroway/tdsl-wasm`; CLAUDE.md documents them as a breaking-change surface.
 */
export interface RenderOptionsSink {
	grid: string;
	theme: string;
	orientation: string;
	layout_style: string;
	show_event_labels: boolean;
	show_table: boolean;
	show_legend: boolean;
	lane_height: number;
	free(): void;
}

/**
 * Allocates an options instance and populates it from a resolved render config.
 *
 * Only fields the caller actually resolved are assigned: an unset directive and
 * an unset setting must leave the renderer on its own default, and writing a
 * placeholder (`""` / `0`) would override that default instead. `lane_height`
 * follows the same rule via its `> 0` guard, since `0` *is* the renderer's
 * "auto" sentinel.
 *
 * `create` allocates on the WASM heap, so a setter that rejects a value would
 * otherwise leak the instance — hence the `free()` on the throwing path. The
 * caller owns the returned instance and must either hand it to a render call
 * (which consumes it) or free it.
 */
export function populateRenderOptions<T extends RenderOptionsSink>(
	create: () => T,
	r: ResolvedRender,
): T {
	const opts = create();
	try {
		if (r.grid) opts.grid = r.grid;
		if (r.theme) opts.theme = r.theme;
		if (r.orientation) opts.orientation = r.orientation;
		if (r.layout_style) opts.layout_style = r.layout_style;
		if (r.events !== undefined) opts.show_event_labels = r.events;
		// show_table / show_legend render natively into the SVG (upstream 1.23.0+).
		if (r.table !== undefined) opts.show_table = r.table;
		if (r.legend !== undefined) opts.show_legend = r.legend;
		if (r.laneHeight > 0) opts.lane_height = r.laneHeight;
		return opts;
	} catch (error) {
		opts.free();
		throw error;
	}
}
