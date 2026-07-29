import { describe, expect, it } from "vitest";
import { resolveStandaloneHtmlRender } from "./standalone-html";
import type { ResolvedRender } from "./utils";

const autoThemeRender: ResolvedRender = {
	scale: 0,
	fit: false,
	grid: "none",
	orientation: "horizontal",
	events: false,
	table: false,
	legend: false,
	laneHeight: 0,
};

describe("resolveStandaloneHtmlRender", () => {
	it("uses a concrete default theme when the host is light", () => {
		expect(resolveStandaloneHtmlRender(autoThemeRender, false).theme).toBe(
			"default",
		);
	});

	it("uses a concrete dark theme when the host is dark", () => {
		expect(resolveStandaloneHtmlRender(autoThemeRender, true).theme).toBe(
			"dark",
		);
	});

	it("preserves an explicit directive or setting theme", () => {
		expect(
			resolveStandaloneHtmlRender({ ...autoThemeRender, theme: "pastel" }, true)
				.theme,
		).toBe("pastel");
	});
});
