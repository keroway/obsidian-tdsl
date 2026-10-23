import { describe, expect, it } from "vitest";
import { createTooltipVisibility } from "./tooltip-visibility";

function setup() {
	const log: boolean[] = [];
	const v = createTooltipVisibility((visible) => log.push(visible));
	return { v, last: () => log[log.length - 1] };
}

describe("createTooltipVisibility", () => {
	it("is visible while either pointer or focus is active", () => {
		const { v, last } = setup();
		v.setPointer(true);
		v.setFocus(true);
		v.setPointer(false);
		expect(last()).toBe(true);
		v.setFocus(false);
		expect(last()).toBe(false);
	});

	it("dismiss hides regardless of state until the next event", () => {
		const { v, last } = setup();
		v.setFocus(true);
		v.dismiss();
		expect(last()).toBe(false);
		v.setFocus(true);
		expect(last()).toBe(true);
	});
});
