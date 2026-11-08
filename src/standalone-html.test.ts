import { describe, expect, it } from "vitest";
import {
	embedEventLabelStyle,
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

describe("embedEventLabelStyle", () => {
	const html = "<html><head><style>.a{}</style></head><body></body></html>";

	it("adds the dark event-label rule inside the head", () => {
		const out = embedEventLabelStyle(html, "dark");
		expect(out).toContain("svg .tdsl-event-label{fill:#dadada}</style></head>");
	});

	it("adds the dark lane colour variables for the dark theme (#428)", () => {
		const out = embedEventLabelStyle(html, "dark");
		expect(out).toContain("svg.tdsl-root{--tdsl-lane-0:#5ba3d8;");
	});

	it("adds the light lane colour variables for non-dark themes (#428)", () => {
		const out = embedEventLabelStyle(html, "default");
		expect(out).toContain("svg.tdsl-root{--tdsl-lane-0:#4682b4;");
	});

	it("uses the light colour for non-dark themes", () => {
		expect(embedEventLabelStyle(html, "default")).toContain("fill:#222222");
	});

	it("returns the document unchanged without a head", () => {
		expect(embedEventLabelStyle("<p>x</p>", "dark")).toBe("<p>x</p>");
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
