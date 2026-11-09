// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
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

	it("draws now-ended items dashed in export and preview CSS (#410)", () => {
		const preview = readFileSync("styles.css", "utf8");
		for (const theme of ["default", "dark"]) {
			const css = buildExportStyles(theme);
			expect(css).toContain(".tdsl-item-open-ended .tdsl-span");
			expect(css).toContain(".tdsl-item-open-ended .tdsl-event-range");
			expect(css).toContain("stroke-dasharray:4 2");
		}
		expect(preview).toContain(".tdsl-item-open-ended .tdsl-span");
		expect(preview).toContain(".tdsl-item-open-ended .tdsl-event-range");
		expect(preview).toContain("stroke-dasharray: 4 2");
	});

	it("differs between dark and other themes", () => {
		expect(buildExportStyles("dark")).not.toBe(buildExportStyles("default"));
		expect(buildExportStyles(undefined)).toBe(buildExportStyles("default"));
	});

	it("gives print and pastel their own palettes (#433)", () => {
		const styles = ["default", "dark", "print", "pastel"].map((t) =>
			buildExportStyles(t),
		);
		expect(new Set(styles).size).toBe(4);
	});

	it("embeds distinct SVG for print / pastel / default (#433)", () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg"><g/></svg>';
		const out = ["default", "print", "pastel"].map((t) =>
			embedExportStyles(svg, t),
		);
		expect(new Set(out).size).toBe(3);
	});

	it("mirrors print / pastel palettes in the preview CSS (#433)", () => {
		const css = readFileSync("styles.css", "utf8");
		for (const theme of ["print", "pastel"]) {
			const block = css.slice(css.indexOf(`[data-tdsl-theme="${theme}"]`));
			for (const hex of [
				...buildExportStyles(theme).matchAll(/#[0-9a-f]{6}\b/g),
			]) {
				expect(block).toContain(hex[0]);
			}
		}
	});
});

describe("preview explicit-theme CSS (#397)", () => {
	const css = readFileSync("styles.css", "utf8");
	const hexes = (theme: string) =>
		[...buildExportStyles(theme).matchAll(/#[0-9a-f]{6}\b/g)].map((m) => m[0]);

	it("carries every literal palette colour of the export styles", () => {
		for (const hex of [...hexes("default"), ...hexes("dark")]) {
			expect(css).toContain(hex);
		}
	});

	it("scopes dark colours to data-tdsl-theme=dark", () => {
		const darkBlock = css.slice(css.indexOf('[data-tdsl-theme="dark"]'));
		for (const hex of hexes("dark")) expect(darkBlock).toContain(hex);
	});
});

describe("preview lane variables reach the SVG root (#412)", () => {
	const css = readFileSync("styles.css", "utf8");

	it("defines lane variables on .tdsl-root for light and dark", () => {
		const blockFor = (selector: string) => {
			const start = css.indexOf(`${selector} {`);
			expect(start).toBeGreaterThan(-1);
			return css.slice(start, css.indexOf("}", start));
		};
		const light = blockFor(".tdsl-preview,\n.tdsl-preview .tdsl-root");
		const dark = blockFor(
			".theme-dark .tdsl-preview,\n.theme-dark .tdsl-preview .tdsl-root",
		);
		expect(light).toContain("--tdsl-lane-0: #4682b4");
		expect(dark).toContain("--tdsl-lane-0: #5ba3d8");
	});
});

describe("export lane variables follow the theme (#418)", () => {
	const css = readFileSync("styles.css", "utf8");
	const upstream =
		'<svg xmlns="http://www.w3.org/2000/svg" class="tdsl-root"><style>:where(.tdsl-root){--tdsl-lane-0:#4682B4}</style></svg>';

	it("emits themed --tdsl-lane-N on the root, before the renderer style", () => {
		expect(buildExportStyles("dark")).toContain(
			"svg.tdsl-root{--tdsl-lane-0:#5ba3d8;--tdsl-lane-1:#f0983a;",
		);
		expect(buildExportStyles("default")).toContain(
			"svg.tdsl-root{--tdsl-lane-0:#4682b4;--tdsl-lane-1:#e67e22;",
		);
		const out = embedExportStyles(upstream, "dark");
		expect(out.indexOf("--tdsl-lane-0:#5ba3d8")).toBeLessThan(
			out.indexOf(":where(.tdsl-root)"),
		);
	});

	it("matches the preview lane palette in styles.css", () => {
		for (const theme of ["default", "dark"]) {
			const vars = [
				...buildExportStyles(theme).matchAll(/--tdsl-lane-\d:#[0-9a-f]{6}/g),
			];
			expect(vars).toHaveLength(8);
			for (const [v] of vars) {
				expect(css).toContain(v.replace(":", ": "));
			}
		}
	});
});

describe("event label colour follows the theme (#413)", () => {
	const upstream =
		'<svg xmlns="http://www.w3.org/2000/svg"><style>.tdsl-event-label{fill:#333}</style><text class="tdsl-event-label">x</text></svg>';

	it("emits a rule that outranks the renderer's later .tdsl-event-label", () => {
		expect(buildExportStyles("dark")).toContain(
			"svg .tdsl-event-label{fill:#dadada}",
		);
		expect(buildExportStyles("default")).toContain(
			"svg .tdsl-event-label{fill:#222222}",
		);
		// Embedded before the upstream <style>, which therefore comes last.
		const out = embedExportStyles(upstream, "dark");
		expect(out.indexOf("svg .tdsl-event-label")).toBeLessThan(
			out.indexOf(".tdsl-event-label{fill:#333}"),
		);
	});

	it("styles the preview for explicit and variable themes", () => {
		const css = readFileSync("styles.css", "utf8");
		expect(css).toContain(".tdsl-preview .tdsl-event-label {");
		expect(css).toContain(
			'.tdsl-preview[data-tdsl-theme="dark"] .tdsl-event-label',
		);
		expect(css).toContain(".tdsl-preview[data-tdsl-theme] .tdsl-event-label");
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
