import { describe, expect, it } from "vitest";
import {
	replaceEmbeddedSvg,
	resolveStandaloneHtmlRender,
} from "./standalone-html";
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

describe("replaceEmbeddedSvg", () => {
	const page = (svg: string) =>
		`<html><head><style>.a{}</style></head><body><div class="tdsl-timeline">${svg}</div></body></html>`;

	it("swaps the embedded SVG and keeps the surrounding template", () => {
		const out = replaceEmbeddedSvg(
			page('<svg width="590"><g/></svg>'),
			'<svg width="950"><g/></svg>\n',
		);
		expect(out).toBe(page('<svg width="950"><g/></svg>'));
	});

	it("is not confused by `$` patterns in the replacement SVG", () => {
		const out = replaceEmbeddedSvg(page("<svg/></svg>"), "<svg>$&$1</svg>");
		expect(out).toContain("<svg>$&$1</svg>");
	});

	it("returns the document unchanged when it embeds no SVG", () => {
		const html = "<html><body>no diagram</body></html>";
		expect(replaceEmbeddedSvg(html, "<svg/>")).toBe(html);
	});
});
