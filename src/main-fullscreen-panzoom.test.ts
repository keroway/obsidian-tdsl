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
	addItemTooltips: (wrapper: HTMLElement) => void;
} {
	const panZoomSource = panZoomSourceRaw.split("export ").join("");
	// This slice also picks up `addItemTooltips`, which sits between
	// `TdslFullscreenModal` and `ZOOM_WHEEL_FACTOR` (see #238: the modal calls
	// it directly, so the regression test needs the same function under test).
	const modalSource = mainSource.slice(
		mainSource.indexOf("class TdslFullscreenModal"),
		mainSource.indexOf("export default class TimelineDslPlugin"),
	);
	const body = `${panZoomSource}\n${modalSource}\nreturn { TdslFullscreenModal, addItemTooltips };`;
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
	proto.setText = function (text: string) {
		this.textContent = text;
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

function makeSvg(viewBox: string, inner = ""): SVGSVGElement {
	const doc = new DOMParser().parseFromString(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${inner}</svg>`,
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

describe("TdslFullscreenModal item tooltips (#238)", () => {
	it("re-attaches a tooltip element and listeners onto the cloned SVG", () => {
		const { TdslFullscreenModal, addItemTooltips } = loadFullscreenModal();

		const source = makeSvg(
			"0 0 800 400",
			'<g data-tdsl-tooltip="example note"><title>example note</title><rect width="100" height="50" /></g>',
		);
		const inlineWrapper = document.createElement("div");
		inlineWrapper.append(source);
		// The inline preview always wires tooltips before Fullscreen can open
		// (`renderDiagram()` calls `addItemTooltips(wrapper)`), which is also
		// what strips the native `<title>` — reproduce that ordering here.
		addItemTooltips(inlineWrapper);

		const modal = new TdslFullscreenModal({}, source);
		modal.onOpen();
		const clone = modal.contentEl.querySelector("svg") as SVGSVGElement;
		const item = clone.querySelector("g") as SVGGElement;

		item.dispatchEvent(new Event("pointerenter"));

		const tooltip = modal.contentEl.querySelector(
			'[role="tooltip"]',
		) as HTMLElement;
		expect(tooltip).not.toBeNull();
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(true);
		expect(tooltip.textContent).toBe("example note");

		item.dispatchEvent(new Event("pointerleave"));
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(false);
	});

	it("does not add a tooltip element when the clone has no tooltip items", () => {
		const { TdslFullscreenModal } = loadFullscreenModal();

		const source = makeSvg("0 0 800 400", "<rect width='100' height='50' />");
		const modal = new TdslFullscreenModal({}, source);
		modal.onOpen();

		expect(modal.contentEl.querySelector('[role="tooltip"]')).toBeNull();
	});
});

describe("addItemTooltips scroll offset (#243)", () => {
	it("keeps the tooltip anchored to the pointer after horizontal/vertical scroll", () => {
		const { addItemTooltips } = loadFullscreenModal();

		const source = makeSvg(
			"0 0 800 400",
			'<g data-tdsl-tooltip="example note"><title>example note</title><rect width="100" height="50" /></g>',
		);
		const wrapper = document.createElement("div");
		wrapper.append(source);
		Object.defineProperty(wrapper, "getBoundingClientRect", {
			value: () => ({ left: 100, top: 50, width: 500, height: 400 }),
		});
		Object.defineProperty(wrapper, "scrollLeft", { value: 300 });
		Object.defineProperty(wrapper, "scrollTop", { value: 20 });

		addItemTooltips(wrapper);
		const item = wrapper.querySelector("g") as SVGGElement;

		item.dispatchEvent(new Event("pointerenter"));
		item.dispatchEvent(
			new PointerEvent("pointermove", { clientX: 200, clientY: 100 }),
		);

		const tooltip = wrapper.querySelector('[role="tooltip"]') as HTMLElement;
		expect(tooltip.style.left).toBe("412px");
		expect(tooltip.style.top).toBe("82px");
	});
});
