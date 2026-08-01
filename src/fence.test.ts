import { describe, expect, it } from "vitest";
import { findTdslFenceAtCursor, listTdslFenceRanges } from "./fence";

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

	it("finds a tdsl fence nested inside a callout (blockquote prefix)", () => {
		expect(
			findTdslFenceAtCursor(
				["> [!note]", "> ```tdsl", "> timeline {}", "> ```", "after"],
				2,
			),
		).toEqual({ status: "found", range: { openLine: 1, closeLine: 3 } });
	});

	it("finds a tdsl fence nested inside an indented list item", () => {
		expect(
			findTdslFenceAtCursor(
				["- item", "  ```tdsl", "  timeline {}", "  ```", "after"],
				2,
			),
		).toEqual({ status: "found", range: { openLine: 1, closeLine: 3 } });
	});

	it("does not pair a callout-nested open fence with a differently-nested close fence", () => {
		// The close fence here is NOT prefixed with "> ", so it belongs to a
		// different (unclosed, in this snippet) nesting level and must not be
		// treated as the closing fence of the callout-nested block.
		expect(
			findTdslFenceAtCursor(["> ```tdsl", "> timeline {}", "```", "after"], 1),
		).toEqual({ status: "missing-close" });
	});

	it("finds a tilde fence (~~~tdsl)", () => {
		expect(
			findTdslFenceAtCursor(["~~~tdsl", "timeline {}", "~~~", "after"], 1),
		).toEqual({ status: "found", range: { openLine: 0, closeLine: 2 } });
	});

	it("does not close a tilde fence with a backtick fence", () => {
		expect(findTdslFenceAtCursor(["~~~tdsl", "timeline {}", "```"], 1)).toEqual(
			{ status: "missing-close" },
		);
	});

	it("finds a fence opened with four or more backticks", () => {
		expect(
			findTdslFenceAtCursor(["````tdsl", "timeline {}", "````"], 1),
		).toEqual({ status: "found", range: { openLine: 0, closeLine: 2 } });
	});

	it("treats a shorter fence line inside a longer fence as body", () => {
		// CommonMark: the close fence must be at least as long as the open one,
		// so the ``` line is part of the block body.
		expect(
			findTdslFenceAtCursor(
				["````tdsl", "timeline {}", "```", "still body", "````"],
				3,
			),
		).toEqual({ status: "found", range: { openLine: 0, closeLine: 4 } });
	});

	it("accepts a longer close fence than the open fence", () => {
		expect(
			findTdslFenceAtCursor(["```tdsl", "timeline {}", "`````"], 1),
		).toEqual({ status: "found", range: { openLine: 0, closeLine: 2 } });
	});

	it("accepts an extra info string after the language identifier", () => {
		expect(
			findTdslFenceAtCursor(["```tdsl extra info", "timeline {}", "```"], 1),
		).toEqual({ status: "found", range: { openLine: 0, closeLine: 2 } });
	});

	it("ignores a language whose name merely starts with tdsl", () => {
		expect(
			findTdslFenceAtCursor(["```tdslx", "timeline {}", "```"], 1),
		).toEqual({ status: "not-in-block" });
	});

	it("does not treat a backtick-containing info string as a tdsl fence", () => {
		// CommonMark forbids backticks in a backtick fence's info string.
		expect(
			findTdslFenceAtCursor(["```tdsl `x`", "timeline {}", "```"], 1),
		).toEqual({ status: "not-in-block" });
	});

	it("finds a tilde fence nested inside a callout", () => {
		expect(
			findTdslFenceAtCursor(
				["> [!note]", "> ~~~tdsl", "> timeline {}", "> ~~~", "after"],
				2,
			),
		).toEqual({ status: "found", range: { openLine: 1, closeLine: 3 } });
	});

	it("treats a nested shorter tdsl fence as body of the outer block", () => {
		// The inner ```tdsl line is body text of the ````tdsl block, so the
		// outer fence pair is the one to format.
		expect(
			findTdslFenceAtCursor(["````tdsl", "```tdsl", "body", "````"], 2),
		).toEqual({ status: "found", range: { openLine: 0, closeLine: 3 } });
	});

	it("does not treat a tdsl fence inside another language's block as a block", () => {
		expect(
			findTdslFenceAtCursor(
				["````md", "```tdsl", "timeline {}", "```", "````"],
				2,
			),
		).toEqual({ status: "not-in-block" });
	});

	it("finds a tdsl block that follows another closed block", () => {
		expect(
			findTdslFenceAtCursor(
				["```js", "console.log(1)", "```", "```tdsl", "timeline {}", "```"],
				4,
			),
		).toEqual({ status: "found", range: { openLine: 3, closeLine: 5 } });
	});

	it("reports not-in-block when the cursor is inside an unclosed non-tdsl block", () => {
		expect(findTdslFenceAtCursor(["```js", "console.log(1)"], 1)).toEqual({
			status: "not-in-block",
		});
	});
});

describe("listTdslFenceRanges", () => {
	it("returns an empty list when the document has no fences", () => {
		expect(listTdslFenceRanges(["plain markdown", "more text"])).toEqual([]);
	});

	it("lists a single closed tdsl block", () => {
		expect(
			listTdslFenceRanges(["before", "```tdsl", "timeline {}", "```", "after"]),
		).toEqual([{ openLine: 1, closeLine: 3 }]);
	});

	it("lists every closed tdsl block in the document", () => {
		expect(
			listTdslFenceRanges([
				"```tdsl",
				"timeline {}",
				"```",
				"between",
				"```tdsl",
				"timeline {}",
				"```",
			]),
		).toEqual([
			{ openLine: 0, closeLine: 2 },
			{ openLine: 4, closeLine: 6 },
		]);
	});

	it("ignores non-tdsl code fences", () => {
		expect(listTdslFenceRanges(["```js", "console.log(1)", "```"])).toEqual([]);
	});

	it("omits an unclosed trailing tdsl block instead of erroring", () => {
		expect(
			listTdslFenceRanges(["```tdsl", "timeline {}", "still open"]),
		).toEqual([]);
	});

	it("still lists a closed tdsl block that precedes an unclosed trailing block", () => {
		expect(
			listTdslFenceRanges([
				"```tdsl",
				"timeline {}",
				"```",
				"```tdsl",
				"still open",
			]),
		).toEqual([{ openLine: 0, closeLine: 2 }]);
	});

	it("lists a tdsl block nested inside a callout", () => {
		expect(
			listTdslFenceRanges([
				"> [!note]",
				"> ```tdsl",
				"> timeline {}",
				"> ```",
				"after",
			]),
		).toEqual([{ openLine: 1, closeLine: 3 }]);
	});

	it("does not treat a tdsl fence inside another language's block as a block", () => {
		expect(
			listTdslFenceRanges(["````md", "```tdsl", "timeline {}", "```", "````"]),
		).toEqual([]);
	});

	it("lists a tilde fence (~~~tdsl)", () => {
		expect(
			listTdslFenceRanges(["~~~tdsl", "timeline {}", "~~~", "after"]),
		).toEqual([{ openLine: 0, closeLine: 2 }]);
	});

	it("accepts a longer close fence than the open fence", () => {
		expect(listTdslFenceRanges(["````tdsl", "timeline {}", "`````"])).toEqual([
			{ openLine: 0, closeLine: 2 },
		]);
	});
});
