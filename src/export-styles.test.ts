// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { buildExportStyles, embedExportStyles } from "./export-styles";

const SVG =
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><style>.a{}</style><line class="tdsl-axis-baseline" x1="0" x2="10"/></svg>';

describe("buildExportStyles", () => {
	it("paints the structural classes the renderer leaves unpainted", () => {
		const css = buildExportStyles("default");
		expect(css).toContain(".tdsl-axis-baseline{stroke:");
		expect(css).toContain(".tdsl-lane-band-even{fill:");
		expect(css).toContain(".tdsl-lane-band-odd{fill:");
	});

	it("hides event hit areas and styles item labels in every theme", () => {
		for (const theme of ["default", "dark", "print", undefined]) {
			const css = buildExportStyles(theme);
			expect(css).toContain(".tdsl-event-hit{fill:transparent}");
			expect(css).toContain(".tdsl-item-label{fill:#fff;");
		}
	});

	it("differs between dark and other themes", () => {
		expect(buildExportStyles("dark")).not.toBe(buildExportStyles("default"));
		expect(buildExportStyles("print")).toBe(buildExportStyles("default"));
		expect(buildExportStyles(undefined)).toBe(buildExportStyles("default"));
	});
});

describe("embedExportStyles", () => {
	it("prepends a <style> carrying the theme palette", () => {
		const out = embedExportStyles(SVG, "dark");
		const doc = new DOMParser().parseFromString(out, "image/svg+xml");
		const first = doc.documentElement.firstElementChild;
		expect(first?.tagName).toBe("style");
		expect(first?.textContent).toBe(buildExportStyles("dark"));
		expect(doc.querySelectorAll("style")).toHaveLength(2);
	});

	it("produces different output per palette", () => {
		expect(embedExportStyles(SVG, "dark")).not.toBe(
			embedExportStyles(SVG, "default"),
		);
	});

	it("returns unparsable input unchanged", () => {
		expect(embedExportStyles("<svg", "dark")).toBe("<svg");
	});
});
