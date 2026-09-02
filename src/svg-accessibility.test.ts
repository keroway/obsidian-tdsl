// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { applyRootAccessibility } from "./svg-accessibility";

const SVG_NS = "http://www.w3.org/2000/svg";

/** Parses an SVG string the same way main.ts does before adopting the node. */
function parse(svg: string): { doc: Document; root: Element } {
	const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
	return { doc, root: doc.documentElement };
}

describe("applyRootAccessibility", () => {
	it("labels a bare root with role=group, aria-label and a <title>", () => {
		const { doc, root } = parse(`<svg xmlns="${SVG_NS}"><g/></svg>`);
		applyRootAccessibility(doc, root, "Meiji era");

		expect(root.getAttribute("role")).toBe("group");
		expect(root.getAttribute("aria-label")).toBe("Meiji era");
		expect(root.firstElementChild?.tagName.toLowerCase()).toBe("title");
		expect(root.firstElementChild?.textContent).toBe("Meiji era");
	});

	it("never uses role=img, which would hide the per-item roles", () => {
		// role="img" is children-presentational: it would strip the renderer's
		// own role="group" / aria-label / <title> from the accessibility tree
		// while the items stay focusable, producing silent focus stops.
		const { doc, root } = parse(`<svg xmlns="${SVG_NS}"/>`);
		applyRootAccessibility(doc, root, "Timeline");
		expect(root.getAttribute("role")).not.toBe("img");
	});

	it("keeps a role the renderer already set", () => {
		const { doc, root } = parse(`<svg xmlns="${SVG_NS}" role="figure"/>`);
		applyRootAccessibility(doc, root, "Timeline");
		expect(root.getAttribute("role")).toBe("figure");
	});

	it("keeps an aria-label the renderer already set", () => {
		const { doc, root } = parse(
			`<svg xmlns="${SVG_NS}" aria-label="Upstream label"/>`,
		);
		applyRootAccessibility(doc, root, "Fallback label");
		expect(root.getAttribute("aria-label")).toBe("Upstream label");
	});

	it("gives the inserted <title> the upstream aria-label, not the fallback", () => {
		// The two must not disagree: a screen reader reads aria-label while a
		// tooltip reads the title.
		const { doc, root } = parse(
			`<svg xmlns="${SVG_NS}" aria-label="Upstream label"/>`,
		);
		applyRootAccessibility(doc, root, "Fallback label");
		expect(root.firstElementChild?.textContent).toBe("Upstream label");
	});

	it("keeps a <title> the renderer already emitted", () => {
		const { doc, root } = parse(
			`<svg xmlns="${SVG_NS}"><title>Upstream title</title><g/></svg>`,
		);
		applyRootAccessibility(doc, root, "Fallback label");

		const titles = root.querySelectorAll("title");
		expect(titles.length).toBe(1);
		expect(titles[0]?.textContent).toBe("Upstream title");
	});

	it("inserts a <title> when one exists but is not the first child", () => {
		// Only a leading <title> describes the diagram as a whole; a later one
		// belongs to a nested item.
		const { doc, root } = parse(
			`<svg xmlns="${SVG_NS}"><g><title>An item</title></g></svg>`,
		);
		applyRootAccessibility(doc, root, "Timeline");
		expect(root.firstElementChild?.tagName.toLowerCase()).toBe("title");
		expect(root.firstElementChild?.textContent).toBe("Timeline");
	});

	it("inserts the <title> in the SVG namespace", () => {
		const { doc, root } = parse(`<svg xmlns="${SVG_NS}"/>`);
		applyRootAccessibility(doc, root, "Timeline");
		expect(root.firstElementChild?.namespaceURI).toBe(SVG_NS);
	});

	it("puts the <title> before the existing content, not after it", () => {
		// A <title> that is not the first child may be ignored by some tools.
		const { doc, root } = parse(
			`<svg xmlns="${SVG_NS}"><rect/><circle/></svg>`,
		);
		applyRootAccessibility(doc, root, "Timeline");
		expect(
			Array.from(root.children).map((c) => c.tagName.toLowerCase()),
		).toEqual(["title", "rect", "circle"]);
	});

	it("adds no scriptable content", () => {
		// The insertion path must stay innerHTML-free; nothing here may create
		// an element or attribute that could execute.
		const { doc, root } = parse(`<svg xmlns="${SVG_NS}"/>`);
		applyRootAccessibility(doc, root, "<script>alert(1)</script>");

		expect(root.querySelector("script")).toBeNull();
		expect(root.firstElementChild?.textContent).toBe(
			"<script>alert(1)</script>",
		);
	});

	it("is idempotent", () => {
		const { doc, root } = parse(`<svg xmlns="${SVG_NS}"><g/></svg>`);
		applyRootAccessibility(doc, root, "Timeline");
		applyRootAccessibility(doc, root, "Something else");

		expect(root.getAttribute("aria-label")).toBe("Timeline");
		expect(root.querySelectorAll("title").length).toBe(1);
		expect(root.firstElementChild?.textContent).toBe("Timeline");
	});
});
