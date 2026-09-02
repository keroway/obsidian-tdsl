import { describe, expect, it } from "vitest";
import {
	populateRenderOptions,
	type RenderOptionsSink,
} from "./render-options";
import type { ResolvedRender } from "./utils";

/**
 * Stand-in for the WASM `JsRenderOptions`. Records every assignment so a test
 * can assert not just the resulting value but whether the field was written at
 * all — leaving a field untouched is what preserves the renderer's own default.
 */
class FakeOptions implements RenderOptionsSink {
	readonly assigned = new Set<string>();
	freed = 0;

	private _grid = "";
	private _theme = "";
	private _orientation = "";
	private _layoutStyle = "";
	private _showEventLabels = false;
	private _showTable = false;
	private _showLegend = false;
	private _laneHeight = 0;

	get grid() {
		return this._grid;
	}
	set grid(v: string) {
		this.assigned.add("grid");
		this._grid = v;
	}

	get theme() {
		return this._theme;
	}
	set theme(v: string) {
		this.assigned.add("theme");
		this._theme = v;
	}

	get orientation() {
		return this._orientation;
	}
	set orientation(v: string) {
		this.assigned.add("orientation");
		this._orientation = v;
	}

	get layout_style() {
		return this._layoutStyle;
	}
	set layout_style(v: string) {
		this.assigned.add("layout_style");
		this._layoutStyle = v;
	}

	get show_event_labels() {
		return this._showEventLabels;
	}
	set show_event_labels(v: boolean) {
		this.assigned.add("show_event_labels");
		this._showEventLabels = v;
	}

	get show_table() {
		return this._showTable;
	}
	set show_table(v: boolean) {
		this.assigned.add("show_table");
		this._showTable = v;
	}

	get show_legend() {
		return this._showLegend;
	}
	set show_legend(v: boolean) {
		this.assigned.add("show_legend");
		this._showLegend = v;
	}

	get lane_height() {
		return this._laneHeight;
	}
	set lane_height(v: number) {
		this.assigned.add("lane_height");
		this._laneHeight = v;
	}

	free(): void {
		this.freed++;
	}
}

/** The shape `resolveRenderOptions` returns when nothing at all is configured. */
const bare: ResolvedRender = { scale: 0, fit: false, laneHeight: 0 };

describe("populateRenderOptions", () => {
	it("returns the instance the factory allocated", () => {
		const opts = new FakeOptions();
		expect(populateRenderOptions(() => opts, bare)).toBe(opts);
	});

	it("writes nothing when nothing is resolved", () => {
		const opts = populateRenderOptions(() => new FakeOptions(), bare);
		expect([...opts.assigned]).toEqual([]);
		expect(opts.freed).toBe(0);
	});

	it("copies every resolved field through", () => {
		const opts = populateRenderOptions(() => new FakeOptions(), {
			scale: 12,
			fit: false,
			grid: "decade",
			theme: "dark",
			orientation: "vertical",
			layout_style: "gantt",
			events: true,
			table: true,
			legend: true,
			laneHeight: 42,
		});
		expect({
			grid: opts.grid,
			theme: opts.theme,
			orientation: opts.orientation,
			layout_style: opts.layout_style,
			show_event_labels: opts.show_event_labels,
			show_table: opts.show_table,
			show_legend: opts.show_legend,
			lane_height: opts.lane_height,
		}).toEqual({
			grid: "decade",
			theme: "dark",
			orientation: "vertical",
			layout_style: "gantt",
			show_event_labels: true,
			show_table: true,
			show_legend: true,
			lane_height: 42,
		});
	});

	it("does not pass scale or fit through — they are not renderer options", () => {
		// `scale` is a separate argument to the render call and `fit` is a CSS
		// class on the wrapper; neither belongs on the options instance.
		const opts = populateRenderOptions(() => new FakeOptions(), {
			scale: 12,
			fit: true,
			laneHeight: 0,
		});
		expect([...opts.assigned]).toEqual([]);
	});

	it("writes the booleans even when they resolve to false", () => {
		// `false` is a meaningful value here: it turns a renderer default off.
		const opts = populateRenderOptions(() => new FakeOptions(), {
			...bare,
			events: false,
			table: false,
			legend: false,
		});
		expect([...opts.assigned].sort()).toEqual([
			"show_event_labels",
			"show_legend",
			"show_table",
		]);
		expect(opts.show_event_labels).toBe(false);
	});

	it("leaves lane_height untouched when it resolves to the 0 sentinel", () => {
		// 0 means "renderer default"; writing it would be indistinguishable but
		// pointless, and a negative value must never reach the renderer.
		for (const laneHeight of [0, -1]) {
			const opts = populateRenderOptions(() => new FakeOptions(), {
				...bare,
				laneHeight,
			});
			expect(opts.assigned.has("lane_height")).toBe(false);
		}
	});

	it("frees the instance when a setter rejects the value", () => {
		const opts = new FakeOptions();
		Object.defineProperty(opts, "theme", {
			set() {
				throw new Error("invalid theme");
			},
		});
		expect(() =>
			populateRenderOptions(() => opts, { ...bare, theme: "dark" }),
		).toThrow("invalid theme");
		expect(opts.freed).toBe(1);
	});

	it("does not free the instance it returns", () => {
		const opts = populateRenderOptions(() => new FakeOptions(), {
			...bare,
			theme: "dark",
		});
		expect(opts.freed).toBe(0);
	});

	it("allocates through the factory once per call", () => {
		let created = 0;
		const create = () => {
			created++;
			return new FakeOptions();
		};
		const first = populateRenderOptions(create, { ...bare, theme: "dark" });
		const second = populateRenderOptions(create, { ...bare, theme: "print" });
		// A shared instance would be a use-after-free: the render call consumes
		// whatever it is handed (CLAUDE.md, "WASM API シグネチャ").
		expect(created).toBe(2);
		expect(first).not.toBe(second);
	});
});
