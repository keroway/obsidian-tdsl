import { describe, expect, it } from "vitest";
import {
	createTooltipVisibility,
	type TooltipTarget,
} from "./tooltip-visibility";

function setup() {
	const log: (TooltipTarget<string> | null)[] = [];
	const v = createTooltipVisibility<string>((t) => log.push(t));
	return { v, last: () => log[log.length - 1] };
}

describe("createTooltipVisibility", () => {
	it("is visible while either pointer or focus is active", () => {
		const { v, last } = setup();
		v.setPointer("a", true);
		v.setFocus("a", true);
		v.setPointer("a", false);
		expect(last()).toEqual({ item: "a", source: "focus" });
		v.setFocus("a", false);
		expect(last()).toBeNull();
	});

	it("dismiss hides regardless of state until the next event", () => {
		const { v, last } = setup();
		v.setFocus("a", true);
		v.dismiss();
		expect(last()).toBeNull();
		v.setFocus("a", true);
		expect(last()).toEqual({ item: "a", source: "focus" });
	});

	it("restores the focused item when the pointer leaves another item (#349)", () => {
		const { v, last } = setup();
		v.setFocus("a", true);
		v.setPointer("b", true);
		expect(last()).toEqual({ item: "b", source: "pointer" });
		v.setPointer("b", false);
		expect(last()).toEqual({ item: "a", source: "focus" });
	});

	describe("grace period (#364)", () => {
		function graceSetup() {
			const log: (TooltipTarget<string> | null)[] = [];
			let fire: (() => void) | null = null;
			const v = createTooltipVisibility<string>((t) => log.push(t), {
				graceMs: 200,
				setTimer: (fn) => {
					fire = fn;
					return 1;
				},
				clearTimer: () => {
					fire = null;
				},
			});
			return { v, last: () => log[log.length - 1], flush: () => fire?.() };
		}

		it("keeps the tooltip when the pointer moves onto its body", () => {
			const { v, last, flush } = graceSetup();
			v.setPointer("a", true);
			v.setPointer("a", false);
			v.setTooltipHover(true);
			flush();
			expect(last()).toEqual({ item: "a", source: "pointer" });
		});

		it("hides after the grace period when nothing takes over", () => {
			const { v, last, flush } = graceSetup();
			v.setPointer("a", true);
			v.setPointer("a", false);
			expect(last()).toEqual({ item: "a", source: "pointer" });
			flush();
			expect(last()).toBeNull();
		});

		it("hides after the pointer leaves the tooltip body", () => {
			const { v, last, flush } = graceSetup();
			v.setPointer("a", true);
			v.setPointer("a", false);
			v.setTooltipHover(true);
			v.setTooltipHover(false);
			flush();
			expect(last()).toBeNull();
		});

		it("dismiss closes it even while the tooltip body is hovered", () => {
			const { v, last } = graceSetup();
			v.setPointer("a", true);
			v.setPointer("a", false);
			v.setTooltipHover(true);
			v.dismiss();
			expect(last()).toBeNull();
		});
	});

	it("ignores a leave from an item that is not the current owner", () => {
		const { v, last } = setup();
		v.setPointer("b", true);
		v.setPointer("a", false);
		expect(last()).toEqual({ item: "b", source: "pointer" });
	});
});
