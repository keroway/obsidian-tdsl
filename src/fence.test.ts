import { describe, expect, it } from "vitest";
import { findTdslFenceAtCursor } from "./fence";

describe("findTdslFenceAtCursor", () => {
	it("finds a tdsl fence when the cursor is on a body line", () => {
		expect(
			findTdslFenceAtCursor(
				["before", "```tdsl", "timeline {}", "```", "after"],
				2,
			),
		).toEqual({ status: "found", range: { openLine: 1, closeLine: 3 } });
	});

	it("does not match normal markdown after a closed tdsl block", () => {
		expect(
			findTdslFenceAtCursor(
				["```tdsl", "timeline {}", "```", "plain markdown"],
				3,
			),
		).toEqual({ status: "not-in-block" });
	});

	it("reports a missing close fence when the cursor is inside an unclosed tdsl block", () => {
		expect(
			findTdslFenceAtCursor(["```tdsl", "timeline {}", "still body"], 2),
		).toEqual({ status: "missing-close" });
	});

	it("ignores non-tdsl code fences", () => {
		expect(
			findTdslFenceAtCursor(["```js", "console.log(1)", "```"], 1),
		).toEqual({ status: "not-in-block" });
	});

	it("does not treat the fence marker lines as block body", () => {
		const lines = ["```tdsl", "timeline {}", "```"];
		expect(findTdslFenceAtCursor(lines, 0)).toEqual({
			status: "not-in-block",
		});
		expect(findTdslFenceAtCursor(lines, 2)).toEqual({
			status: "not-in-block",
		});
	});
});
