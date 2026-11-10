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

	it("paints external item labels with the theme text colour, not white (#439)", () => {
		const expected: Record<string, string> = {
			default: "#222222",
			dark: "#dadada",
			pastel: "#3a342d",
			print: "#000000",
		};
		const preview = readFileSync("styles.css", "utf8");
		for (const [theme, hex] of Object.entries(expected)) {
			expect(buildExportStyles(theme)).toContain(
				`.tdsl-item-label.tdsl-item-label-external{fill:${hex}}`,
			);
			if (theme !== "default") {
				const block = preview.slice(
					preview.indexOf(
						`.tdsl-preview[data-tdsl-theme="${theme}"] .tdsl-item-label-external`,
					),
				);
				expect(block).toContain(`fill: ${hex};`);
			}
		}
		expect(preview).toContain(
			".tdsl-preview .tdsl-item-label.tdsl-item-label-external",
		);
		expect(preview).toContain(
			".tdsl-preview[data-tdsl-theme] .tdsl-item-label-external",
		);
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

describe("explicit theme lanes beat the Obsidian colour scheme (#437)", () => {
	const css = readFileSync("styles.css", "utf8");
	const laneOf = (scheme: string, theme: string): string => {
		document.head.innerHTML = "";
		const style = document.createElement("style");
		style.textContent = css;
		document.head.appendChild(style);
		document.body.className = scheme;
		document.body.innerHTML = `<div class="tdsl-preview" data-tdsl-theme="${theme}"><svg class="tdsl-root"></svg></div>`;
		const svg = document.querySelector("svg.tdsl-root");
		if (!svg) throw new Error("svg not found");
		return getComputedStyle(svg).getPropertyValue("--tdsl-lane-0").trim();
	};

	it.each([
		["theme-light", "dark", "#5ba3d8"],
		["theme-dark", "default", "#4682b4"],
		["theme-dark", "dark", "#5ba3d8"],
		["theme-light", "default", "#4682b4"],
	])("%s + %s => %s", (scheme, theme, expected) => {
		expect(laneOf(scheme, theme)).toBe(expected);
		const exported = buildExportStyles(theme).match(
			/--tdsl-lane-0:(#[0-9a-f]{6})/,
		);
		expect(exported?.[1]).toBe(expected);
	});

	it("auto still follows the colour scheme", () => {
		expect(laneOf("theme-dark", "auto")).toBe("#5ba3d8");
		expect(laneOf("theme-light", "auto")).toBe("#4682b4");
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

describe("axis day label colour beats the renderer's own CSS (#450)", () => {
	const source =
		'timeline "T" { unit day; range 2026-01-01..2026-02-05; } lane "A" as a {} span a 2026-01-01..2026-01-02 "X" {};';

	const cases = [
		["default", "#8a8d93"],
		["dark", "#7a7a7a"],
		["print", "#555555"],
		["pastel", "#968c80"],
	] as const;

	it.each(cases)(
		"%s theme paints day labels %s in real WASM output",
		async (theme, color) => {
			const wasm = await import("@keroway/tdsl-wasm");
			wasm.initSync({
				module: readFileSync(
					"node_modules/@keroway/tdsl-wasm/tdsl_wasm_bg.wasm",
				),
			});
			const opts = new wasm.JsRenderOptions();
			opts.theme = theme;
			const svg = wasm.render_svg_from_source_with_options(source, 36525, opts);
			const out = embedExportStyles(svg, theme);
			const doc = new DOMParser().parseFromString(out, "image/svg+xml");
			document.body.appendChild(document.adoptNode(doc.documentElement));
			const label = document.querySelector(".tdsl-axis-day-text");
			expect(label).not.toBeNull();
			expect(getComputedStyle(label as Element).fill).toBe(color);
			document.body.replaceChildren();
		},
	);
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

describe("data table colours follow the theme (#449)", () => {
	const css = readFileSync("styles.css", "utf8");
	const expected: Record<string, [string, string, string]> = {
		default: ["#e3e5e8", "#f5f6f8", "#222222"],
		dark: ["#3f3f3f", "#262626", "#dadada"],
		pastel: ["#e6dccd", "#f7efe4", "#3a342d"],
		print: ["#9a9a9a", "#ffffff", "#000000"],
	};

	it("emits header background, alt row and text fills in the export", () => {
		for (const [theme, [head, alt, text]] of Object.entries(expected)) {
			const out = buildExportStyles(theme);
			expect(out).toContain(`.tdsl-table-header-bg{fill:${head}}`);
			expect(out).toContain(`.tdsl-table-row-alt{fill:${alt}}`);
			expect(out).toContain(
				`.tdsl-table-header,.tdsl-table-cell{fill:${text}}`,
			);
		}
	});

	it("mirrors the same colours in the preview CSS", () => {
		for (const [theme, [head, alt, text]] of Object.entries(expected)) {
			const scope =
				theme === "default"
					? ".tdsl-preview[data-tdsl-theme]"
					: `.tdsl-preview[data-tdsl-theme="${theme}"]`;
			expect(css).toContain(
				`${scope} .tdsl-table-header-bg {\n\tfill: ${head};`,
			);
			expect(css).toContain(`${scope} .tdsl-table-row-alt {\n\tfill: ${alt};`);
			expect(css).toContain(`${scope} .tdsl-table-cell {\n\tfill: ${text};`);
		}
	});
});
