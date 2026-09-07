// @vitest-environment happy-dom
import { transformSync } from "esbuild";
import { describe, expect, it } from "vitest";
import mainSource from "./main.ts?raw";
import panZoomSourceRaw from "./pan-zoom.ts?raw";

/**
 * `TdslFullscreenModal` lives in `src/main.ts`, which is excluded from unit
 * testing (see `vitest.config.ts`) because it is coupled to Obsidian's
 * `Plugin`/`Modal` lifecycle. This extracts just the class and its
 * `setupPanZoom()` dependency by source-slicing, the same technique used to
 * reproduce #237, so the fix stays covered by a regression test without
 * pulling in the unavailable `obsidian` module.
 */
function loadFullscreenModal(): {
	TdslFullscreenModal: new (
		app: unknown,
		source: SVGSVGElement,
		// biome-ignore lint/suspicious/noExplicitAny: constructed dynamically from sliced source
	) => any;
} {
	const panZoomSource = panZoomSourceRaw.split("export ").join("");
	const modalSource = mainSource.slice(
		mainSource.indexOf("class TdslFullscreenModal"),
		mainSource.indexOf("export default class TimelineDslPlugin"),
	);
	const body = `${panZoomSource}\n${modalSource}\nreturn { TdslFullscreenModal };`;
	const { code } = transformSync(body, { loader: "ts", target: "es2022" });

	class FakeModal {
		modalEl: HTMLElement;
		contentEl: HTMLElement;
		constructor() {
			this.modalEl = document.createElement("div");
			this.contentEl = document.createElement("div");
			this.modalEl.append(this.contentEl);
		}
	}
	// biome-ignore lint/suspicious/noExplicitAny: HTMLElement is extended with Obsidian's DOM helpers below
	const proto = window.HTMLElement.prototype as any;
	proto.addClass = function (cls: string) {
		this.classList.add(cls);
	};
	proto.removeClass = function (cls: string) {
		this.classList.remove(cls);
	};
	proto.createDiv = function (opts: {
		cls?: string;
		attr?: Record<string, string>;
	}) {
		const el = document.createElement("div");
		el.className = opts.cls ?? "";
		for (const [k, v] of Object.entries(opts.attr ?? {})) {
			el.setAttribute(k, v);
		}
		this.append(el);
		return el;
	};

	return new Function("Modal", code)(FakeModal);
}

function makeSvg(viewBox: string): SVGSVGElement {
	const doc = new DOMParser().parseFromString(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"></svg>`,
		"image/svg+xml",
	);
	return document.adoptNode(doc.documentElement) as unknown as SVGSVGElement;
}

describe("TdslFullscreenModal viewBox boundary (#237)", () => {
	it("resets to the diagram's original full viewBox, not the zoomed inline one", () => {
		const { TdslFullscreenModal } = loadFullscreenModal();

		const source = makeSvg("0 0 800 400");
		const wrapper = document.createElement("div");
		wrapper.append(source);

		// Simulate the inline preview having already zoomed in before Fullscreen
		// is opened, the way #237 was reproduced: the inline setupPanZoom call
		// (not exercised by this harness) would have stamped the full bounds
		// onto a data attribute before any zoom mutated the live viewBox.
		source.dataset.tdslFullViewBox = "0 0 800 400";
		source.setAttribute("viewBox", "200 100 400 200");

		const modal = new TdslFullscreenModal({}, source);
		modal.onOpen();
		const clone = modal.contentEl.querySelector("svg") as SVGSVGElement;
		Object.defineProperty(clone, "getBoundingClientRect", {
			value: () => ({ left: 0, top: 0, width: 800, height: 400 }),
		});

		expect(clone.getAttribute("viewBox")).toBe("200 100 400 200");

		clone.dispatchEvent(
			new WheelEvent("wheel", { deltaY: 100, clientX: 400, clientY: 200 }),
		);
		// Must be able to zoom out past the initially-opened (zoomed) range.
		const afterZoomOut = clone.getAttribute("viewBox");
		expect(afterZoomOut).not.toBe("200 100 400 200");

		clone.dispatchEvent(new Event("dblclick"));
		expect(clone.getAttribute("viewBox")).toBe("0 0 800 400");
	});

	it("does not mutate the inline SVG's own viewBox", () => {
		const { TdslFullscreenModal } = loadFullscreenModal();

		const source = makeSvg("0 0 800 400");
		source.dataset.tdslFullViewBox = "0 0 800 400";
		source.setAttribute("viewBox", "200 100 400 200");

		const modal = new TdslFullscreenModal({}, source);
		modal.onOpen();

		expect(source.getAttribute("viewBox")).toBe("200 100 400 200");
	});
});
