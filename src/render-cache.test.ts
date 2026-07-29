import { describe, expect, it } from "vitest";
import { renderCacheKey, SvgLruCache } from "./render-cache";
import type { ResolvedRender } from "./utils";

const resolved: ResolvedRender = {
	scale: 0,
	fit: false,
	grid: "none",
	orientation: "horizontal",
	events: false,
	table: false,
	legend: false,
	laneHeight: 0,
};

const entry = (svg: string) => ({ svg, diagnostics: [] });

describe("SvgLruCache", () => {
	it("returns a cached render for a hit", () => {
		const cache = new SvgLruCache();
		cache.set("source", entry("<svg />"));

		expect(cache.get("source")).toEqual(entry("<svg />"));
	});

	it("promotes a hit so it is not evicted before less-recent entries", () => {
		const cache = new SvgLruCache(2);
		cache.set("first", entry("first"));
		cache.set("second", entry("second"));
		cache.get("first");
		cache.set("third", entry("third"));

		expect(cache.get("first")).toEqual(entry("first"));
		expect(cache.get("second")).toBeUndefined();
		expect(cache.get("third")).toEqual(entry("third"));
	});

	it("evicts the least recently used entry at capacity", () => {
		const cache = new SvgLruCache(2);
		cache.set("first", entry("first"));
		cache.set("second", entry("second"));
		cache.set("third", entry("third"));

		expect(cache.get("first")).toBeUndefined();
		expect(cache.get("second")).toEqual(entry("second"));
		expect(cache.get("third")).toEqual(entry("third"));
	});
});

describe("renderCacheKey", () => {
	it("changes for source and every resolved renderer option", () => {
		const base = renderCacheKey("timeline {}", resolved);
		const variants: ResolvedRender[] = [
			{ ...resolved, scale: 5 },
			{ ...resolved, fit: true },
			{ ...resolved, grid: "year" },
			{ ...resolved, theme: "dark" },
			{ ...resolved, orientation: "vertical" },
			{ ...resolved, layout_style: "gantt" },
			{ ...resolved, events: true },
			{ ...resolved, table: true },
			{ ...resolved, legend: true },
			{ ...resolved, laneHeight: 60 },
		];

		expect(renderCacheKey("different source", resolved)).not.toBe(base);
		for (const variant of variants) {
			expect(renderCacheKey("timeline {}", variant)).not.toBe(base);
		}
	});

	it("distinguishes unset and explicit renderer options", () => {
		expect(renderCacheKey("timeline {}", resolved)).not.toBe(
			renderCacheKey("timeline {}", { ...resolved, theme: "default" }),
		);
	});
});
