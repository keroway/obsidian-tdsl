// @vitest-environment happy-dom
import { transformSync } from "esbuild";
import { afterEach, describe, expect, it, vi } from "vitest";
import escapeListenerSourceRaw from "./escape-listener.ts?raw";
import mainSource from "./main.ts?raw";
import panZoomSourceRaw from "./pan-zoom.ts?raw";
import tooltipVisibilitySourceRaw from "./tooltip-visibility.ts?raw";

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
	const escapeListenerSource = escapeListenerSourceRaw
		.split("export ")
		.join("");
	const tooltipVisibilitySource = tooltipVisibilitySourceRaw
		.split("export ")
		.join("");
	const body = `${panZoomSource}\n${tooltipVisibilitySource}\n${escapeListenerSource}\n${modalSource}\nreturn { TdslFullscreenModal, addItemTooltips };`;
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

		// happy-dom's WheelEvent ignores clientX/clientY (see #244 below), so set
		// them explicitly; otherwise the focus is NaN and this assertion passed
		// vacuously on a NaN viewBox (#317).
		const wheelEvent = new WheelEvent("wheel", { deltaY: 100 });
		Object.defineProperty(wheelEvent, "clientX", { value: 400 });
		Object.defineProperty(wheelEvent, "clientY", { value: 200 });
		clone.dispatchEvent(wheelEvent);
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

afterEach(() => {
	vi.useRealTimers();
});

describe("TdslFullscreenModal item tooltips (#238)", () => {
	it("re-attaches a tooltip element and listeners onto the cloned SVG", () => {
		vi.useFakeTimers();
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
		vi.advanceTimersByTime(200);
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

describe("addItemTooltips keyboard focus (#343)", () => {
	function setup() {
		const { addItemTooltips } = loadFullscreenModal();
		const source = makeSvg(
			"0 0 800 400",
			'<g tabindex="0" data-tdsl-tooltip="example note"><title>example note</title><rect width="100" height="50" /></g>',
		);
		const wrapper = document.createElement("div");
		wrapper.append(source);
		document.body.append(wrapper);
		addItemTooltips(wrapper);
		const item = wrapper.querySelector("g") as SVGGElement;
		const tooltip = wrapper.querySelector('[role="tooltip"]') as HTMLElement;
		return { item, tooltip };
	}

	it("shows the tooltip on focus and hides it on blur", () => {
		const { item, tooltip } = setup();

		item.dispatchEvent(new Event("focus"));
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(true);
		expect(tooltip.textContent).toBe("example note");

		item.dispatchEvent(new Event("blur"));
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(false);
	});

	it("dismisses on Escape without waiting for blur", () => {
		const { item, tooltip } = setup();

		item.dispatchEvent(new Event("focus"));
		item.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(false);
	});

	it("dismisses a hover tooltip on Escape while focus is outside the diagram (#360)", () => {
		const { item, tooltip } = setup();

		item.dispatchEvent(new Event("pointerenter"));
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(true);

		document.body.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(false);
	});

	it("stops listening for Escape once the wrapper is detached (#360)", () => {
		const { item, tooltip } = setup();
		const wrapper = item.closest("div") as HTMLElement;

		item.dispatchEvent(new Event("pointerenter"));
		wrapper.remove();
		document.body.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
		);

		// The listener bailed out instead of acting on a torn-down preview.
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(true);
	});

	it("keeps the tooltip while the pointer moves from the item onto the tooltip (#364)", () => {
		vi.useFakeTimers();
		const { item, tooltip } = setup();

		item.dispatchEvent(new Event("pointerenter"));
		item.dispatchEvent(new Event("pointerleave"));
		tooltip.dispatchEvent(new Event("pointerenter"));
		vi.advanceTimersByTime(1000);
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(true);

		tooltip.dispatchEvent(new Event("pointerleave"));
		vi.advanceTimersByTime(200);
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(false);
	});

	it("keeps the tooltip while focused after the pointer leaves", () => {
		vi.useFakeTimers();
		const { item, tooltip } = setup();

		item.dispatchEvent(new Event("focus"));
		item.dispatchEvent(new Event("pointerenter"));
		item.dispatchEvent(new Event("pointerleave"));
		vi.advanceTimersByTime(200);
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(true);

		item.dispatchEvent(new Event("blur"));
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(false);
	});

	it("keeps the tooltip while hovered after focus is lost", () => {
		vi.useFakeTimers();
		const { item, tooltip } = setup();

		item.dispatchEvent(new Event("pointerenter"));
		item.dispatchEvent(new Event("focus"));
		item.dispatchEvent(new Event("blur"));
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(true);

		item.dispatchEvent(new Event("pointerleave"));
		vi.advanceTimersByTime(200);
		expect(tooltip.classList.contains("tdsl-tooltip-visible")).toBe(false);
	});
});

describe("TdslFullscreenModal zoom center drift (#244)", () => {
	it("keeps the diagram point under the cursor fixed when the element's aspect ratio (800x800, Fullscreen's width:100%;height:100%) differs from the viewBox's (800x400)", () => {
		const { TdslFullscreenModal } = loadFullscreenModal();
		const source = makeSvg("0 0 800 400");
		const modal = new TdslFullscreenModal({}, source);
		modal.onOpen();
		const clone = modal.contentEl.querySelector("svg") as SVGSVGElement;
		Object.defineProperty(clone, "getBoundingClientRect", {
			value: () => ({ left: 0, top: 0, width: 800, height: 800 }),
		});

		// Independently re-derives the diagram-space point under screen (400,
		// 300) from a `viewBox` attribute, assuming `xMidYMid meet` letterboxing
		// against the fixed 800x800 element rect above.
		const diagramPointUnderCursor = (viewBoxAttr: string) => {
			const [, y, w, h] = viewBoxAttr.split(" ").map(Number);
			const scale = Math.min(800 / w, 800 / h);
			const marginY = (800 - h * scale) / 2;
			return y + (300 - marginY) / scale;
		};

		const before = diagramPointUnderCursor(
			clone.getAttribute("viewBox") as string,
		);
		// happy-dom's WheelEvent constructor does not apply `clientX`/`clientY`
		// from the init dict (unlike PointerEvent, used elsewhere in this file),
		// so they are set directly on the instance instead.
		const wheelEvent = new WheelEvent("wheel", { deltaY: -100 });
		Object.defineProperty(wheelEvent, "clientX", { value: 400 });
		Object.defineProperty(wheelEvent, "clientY", { value: 300 });
		clone.dispatchEvent(wheelEvent);
		const after = diagramPointUnderCursor(
			clone.getAttribute("viewBox") as string,
		);

		expect(after).toBeCloseTo(before, 5);
	});
});

describe("horizontal-only wheel input (#358)", () => {
	it("leaves the viewBox untouched and does not preventDefault when deltaY is 0", () => {
		const { TdslFullscreenModal } = loadFullscreenModal();
		const source = makeSvg("0 0 800 400");
		source.dataset.tdslFullViewBox = "0 0 800 400";
		source.setAttribute("viewBox", "200 100 400 200");
		const modal = new TdslFullscreenModal({}, source);
		modal.onOpen();
		const clone = modal.contentEl.querySelector("svg") as SVGSVGElement;
		Object.defineProperty(clone, "getBoundingClientRect", {
			value: () => ({ left: 0, top: 0, width: 800, height: 400 }),
		});

		const wheelEvent = new WheelEvent("wheel", {
			deltaX: 100,
			deltaY: 0,
			cancelable: true,
		});
		Object.defineProperty(wheelEvent, "clientX", { value: 400 });
		Object.defineProperty(wheelEvent, "clientY", { value: 200 });
		clone.dispatchEvent(wheelEvent);

		expect(clone.getAttribute("viewBox")).toBe("200 100 400 200");
		expect(wheelEvent.defaultPrevented).toBe(false);
	});
});

describe("pan/zoom CSS gating (#312)", () => {
	it("marks the fullscreen wrapper pannable once pan/zoom is wired", () => {
		const { TdslFullscreenModal } = loadFullscreenModal();
		const modal = new TdslFullscreenModal({}, makeSvg("0 0 800 400"));
		modal.onOpen();

		expect(modal.contentEl.querySelector(".tdsl-pannable")).not.toBeNull();
	});
});

describe("pan drag state after pointer capture loss (#328)", () => {
	function openClone() {
		const { TdslFullscreenModal } = loadFullscreenModal();
		const source = makeSvg("0 0 800 400");
		source.dataset.tdslFullViewBox = "0 0 800 400";
		source.setAttribute("viewBox", "200 100 400 200");
		const modal = new TdslFullscreenModal({}, source);
		modal.onOpen();
		const clone = modal.contentEl.querySelector("svg") as SVGSVGElement;
		Object.defineProperty(clone, "getBoundingClientRect", {
			value: () => ({ left: 0, top: 0, width: 800, height: 400 }),
		});
		Object.defineProperty(clone, "setPointerCapture", { value: () => {} });
		Object.defineProperty(clone, "releasePointerCapture", {
			value: () => {},
		});
		Object.defineProperty(clone, "hasPointerCapture", { value: () => false });
		return { modal, clone };
	}

	function pointer(type: string, init: PointerEventInit) {
		return new PointerEvent(type, { button: 0, ...init });
	}

	it("stops panning on lostpointercapture", () => {
		const { modal, clone } = openClone();
		clone.dispatchEvent(
			pointer("pointerdown", { pointerId: 1, clientX: 400, clientY: 200 }),
		);
		expect(modal.contentEl.querySelector(".tdsl-panning")).not.toBeNull();

		clone.dispatchEvent(pointer("lostpointercapture", { pointerId: 1 }));
		expect(modal.contentEl.querySelector(".tdsl-panning")).toBeNull();

		const before = clone.getAttribute("viewBox");
		clone.dispatchEvent(
			pointer("pointermove", {
				pointerId: 1,
				buttons: 0,
				clientX: 500,
				clientY: 200,
			}),
		);
		expect(clone.getAttribute("viewBox")).toBe(before);
	});

	it("ignores moves from a different pointerId while dragging", () => {
		const { clone } = openClone();
		clone.dispatchEvent(
			pointer("pointerdown", { pointerId: 1, clientX: 400, clientY: 200 }),
		);
		const before = clone.getAttribute("viewBox");
		clone.dispatchEvent(
			pointer("pointermove", { pointerId: 2, clientX: 500, clientY: 200 }),
		);
		expect(clone.getAttribute("viewBox")).toBe(before);
	});
});
