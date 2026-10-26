import { describe, expect, it } from "vitest";
import { findTdslFenceAtCursor, listTdslFenceRanges } from "./fence";

describe("findTdslFenceAtCursor", () => {
	it("finds a tdsl fence when the cursor is on a body line", () => {
		expect(
			findTdslFenceAtCursor(
				["before", "```tdsl", "timeline {}", "```", "after"],
				2,
			),
		).toEqual({
			status: "found",
			range: { openLine: 1, closeLine: 3, prefix: "" },
		});
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
		).toEqual({
			status: "found",
			range: { openLine: 1, closeLine: 3, prefix: "> " },
		});
	});

	it("finds a tdsl fence nested inside an indented list item", () => {
		expect(
			findTdslFenceAtCursor(
				["- item", "  ```tdsl", "  timeline {}", "  ```", "after"],
				2,
			),
		).toEqual({
			status: "found",
			range: { openLine: 1, closeLine: 3, prefix: "  " },
		});
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
		).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 2, prefix: "" },
		});
	});

	it("does not close a tilde fence with a backtick fence", () => {
		expect(findTdslFenceAtCursor(["~~~tdsl", "timeline {}", "```"], 1)).toEqual(
			{ status: "missing-close" },
		);
	});

	it("finds a fence opened with four or more backticks", () => {
		expect(
			findTdslFenceAtCursor(["````tdsl", "timeline {}", "````"], 1),
		).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 2, prefix: "" },
		});
	});

	it("treats a shorter fence line inside a longer fence as body", () => {
		// CommonMark: the close fence must be at least as long as the open one,
		// so the ``` line is part of the block body.
		expect(
			findTdslFenceAtCursor(
				["````tdsl", "timeline {}", "```", "still body", "````"],
				3,
			),
		).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 4, prefix: "" },
		});
	});

	it("accepts a longer close fence than the open fence", () => {
		expect(
			findTdslFenceAtCursor(["```tdsl", "timeline {}", "`````"], 1),
		).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 2, prefix: "" },
		});
	});

	it("accepts an extra info string after the language identifier", () => {
		expect(
			findTdslFenceAtCursor(["```tdsl extra info", "timeline {}", "```"], 1),
		).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 2, prefix: "" },
		});
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
		).toEqual({
			status: "found",
			range: { openLine: 1, closeLine: 3, prefix: "> " },
		});
	});

	it("treats a nested shorter tdsl fence as body of the outer block", () => {
		// The inner ```tdsl line is body text of the ````tdsl block, so the
		// outer fence pair is the one to format.
		expect(
			findTdslFenceAtCursor(["````tdsl", "```tdsl", "body", "````"], 2),
		).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 3, prefix: "" },
		});
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
		).toEqual({
			status: "found",
			range: { openLine: 3, closeLine: 5, prefix: "" },
		});
	});

	it("reports not-in-block when the cursor is inside an unclosed non-tdsl block", () => {
		expect(findTdslFenceAtCursor(["```js", "console.log(1)"], 1)).toEqual({
			status: "not-in-block",
		});
	});
});

describe("closing fence indentation (CommonMark: up to 3 spaces)", () => {
	for (const indent of [1, 2, 3]) {
		it(`closes a top-level block with a close fence indented ${indent} space(s)`, () => {
			const lines = [
				"```tdsl",
				"timeline {}",
				`${" ".repeat(indent)}\`\`\``,
				"",
				"```tdsl",
				"timeline {}",
				"```",
			];
			expect(listTdslFenceRanges(lines)).toEqual([
				{ openLine: 0, closeLine: 2, prefix: "" },
				{ openLine: 4, closeLine: 6, prefix: "" },
			]);
			expect(findTdslFenceAtCursor(lines, 5)).toEqual({
				status: "found",
				range: { openLine: 4, closeLine: 6, prefix: "" },
			});
		});
	}

	for (const [openIndent, closeIndent] of [
		[2, 0],
		[3, 1],
		[3, 0],
	] as const) {
		it(`closes an open fence indented ${openIndent} with a shallower close indented ${closeIndent} (#306)`, () => {
			const lines = [
				`${" ".repeat(openIndent)}~~~tdsl`,
				`${" ".repeat(openIndent)}timeline {}`,
				`${" ".repeat(closeIndent)}~~~`,
				"",
				"~~~tdsl",
				"timeline {}",
				"~~~",
			];
			expect(listTdslFenceRanges(lines)).toEqual([
				{ openLine: 0, closeLine: 2, prefix: " ".repeat(openIndent) },
				{ openLine: 4, closeLine: 6, prefix: "" },
			]);
			expect(findTdslFenceAtCursor(lines, 5)).toEqual({
				status: "found",
				range: { openLine: 4, closeLine: 6, prefix: "" },
			});
		});
	}

	for (const [openIndent, bodyIndent] of [
		[1, 4],
		[3, 6],
		[3, 4],
	] as const) {
		it(`does not close a top-level fence indented ${openIndent} on a body fence indented ${bodyIndent} (#362)`, () => {
			const lines = [
				`${" ".repeat(openIndent)}~~~tdsl`,
				`${" ".repeat(openIndent)}timeline "Title"`,
				`${" ".repeat(bodyIndent)}~~~`,
				`${" ".repeat(openIndent)}continued "x" { unit year; range 1..10; }`,
				"~~~",
			];
			expect(listTdslFenceRanges(lines)).toEqual([
				{ openLine: 0, closeLine: 4, prefix: " ".repeat(openIndent) },
			]);
			expect(findTdslFenceAtCursor(lines, 3)).toEqual({
				status: "found",
				range: { openLine: 0, closeLine: 4, prefix: " ".repeat(openIndent) },
			});
		});
	}

	it("does not treat a 4-space indented fence as a close fence", () => {
		expect(
			listTdslFenceRanges(["```tdsl", "timeline {}", "    ```", "```"]),
		).toEqual([{ openLine: 0, closeLine: 3, prefix: "" }]);
	});
});

describe("unclosed fence inside a blockquote (#304)", () => {
	const lines = [
		"> ~~~js",
		"> example",
		"",
		"~~~tdsl",
		'timeline "Real" { unit year; range 1..10; }',
		"~~~",
	];
	const range = { openLine: 3, closeLine: 5, prefix: "" };

	it("lists a later top-level tdsl block", () => {
		expect(listTdslFenceRanges(lines)).toEqual([range]);
	});

	it("finds a later top-level tdsl block at the cursor", () => {
		expect(findTdslFenceAtCursor(lines, 4)).toEqual({
			status: "found",
			range,
		});
	});

	it("keeps an unclosed quoted tdsl block scoped to its container", () => {
		const quoted = ["> ```tdsl", "> timeline {}", "", "```tdsl", "x", "```"];
		expect(findTdslFenceAtCursor(quoted, 1)).toEqual({
			status: "missing-close",
		});
		expect(findTdslFenceAtCursor(quoted, 4)).toEqual({
			status: "found",
			range: { openLine: 3, closeLine: 5, prefix: "" },
		});
		expect(listTdslFenceRanges(quoted)).toEqual([
			{ openLine: 3, closeLine: 5, prefix: "" },
		]);
	});

	it("does not leave a nested quote when the depth is unchanged", () => {
		expect(
			listTdslFenceRanges(["> > ```tdsl", "> > timeline {}", "> > ```"]),
		).toEqual([{ openLine: 0, closeLine: 2, prefix: "> > " }]);
	});
});

describe("unclosed fence inside a list item (#316)", () => {
	const lines = [
		"- item",
		"  ~~~text",
		"  example",
		"",
		"outside list",
		"~~~tdsl",
		"timeline {}",
		"~~~",
	];
	const range = { openLine: 5, closeLine: 7, prefix: "" };

	it("lists a later top-level tdsl block", () => {
		expect(listTdslFenceRanges(lines)).toEqual([range]);
	});

	it("finds a later top-level tdsl block at the cursor", () => {
		expect(findTdslFenceAtCursor(lines, 6)).toEqual({ status: "found", range });
	});

	it("keeps blank lines and deeper-indented lines inside the fence", () => {
		const inside = ["- item", "  ~~~tdsl", "  a", "", "    b", "  ~~~"];
		expect(listTdslFenceRanges(inside)).toEqual([
			{ openLine: 1, closeLine: 5, prefix: "  " },
		]);
	});
});

describe("indented top-level fence without a list (#320)", () => {
	it.each([2, 3])("detects a fence opened with %i spaces", (n) => {
		const lines = [`${" ".repeat(n)}~~~tdsl`, "timeline {}", "~~~"];
		expect(listTdslFenceRanges(lines)).toEqual([
			{ openLine: 0, closeLine: 2, prefix: " ".repeat(n) },
		]);
		expect(findTdslFenceAtCursor(lines, 1)).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 2, prefix: " ".repeat(n) },
		});
	});

	it("detects an indented fence after a plain paragraph", () => {
		const lines = ["paragraph", "", "  ~~~tdsl", "timeline {}", "  ~~~"];
		expect(listTdslFenceRanges(lines)).toEqual([
			{ openLine: 2, closeLine: 4, prefix: "  " },
		]);
	});
});

describe("fence opened on the list marker line (#324)", () => {
	it.each([
		["bullet", ["- ~~~tdsl", "  timeline {}", "  ~~~"], "  "],
		["numbered", ["1. ~~~tdsl", "   timeline {}", "   ~~~"], "   "],
		["quoted list", ["> - ```tdsl", ">   timeline {}", ">   ```"], ">   "],
	])("detects a %s item", (_name, lines, prefix) => {
		const range = { openLine: 0, closeLine: 2, prefix };
		expect(listTdslFenceRanges(lines)).toEqual([range]);
		expect(findTdslFenceAtCursor(lines, 1)).toEqual({
			status: "found",
			range,
		});
	});

	it("ends an unclosed fence at the item boundary", () => {
		const lines = ["- ```tdsl", "  timeline {}", "next", "```tdsl", "t", "```"];
		expect(findTdslFenceAtCursor(lines, 1)).toEqual({
			status: "missing-close",
		});
		expect(listTdslFenceRanges(lines)).toEqual([
			{ openLine: 3, closeLine: 5, prefix: "" },
		]);
	});

	it("does not treat a marker without a fence as a block", () => {
		expect(listTdslFenceRanges(["- item", "  text"])).toEqual([]);
	});
});

describe("list-marker fence line in the body is not a close fence (#341)", () => {
	it.each([
		["bullet", "- ~~~"],
		["numbered", "1. ~~~"],
	])("keeps a %s body line inside the block", (_name, bodyLine) => {
		const lines = [
			"~~~tdsl",
			'timeline "Title',
			bodyLine,
			'continued" { unit year; range 1..10; }',
			"~~~",
		];
		const range = { openLine: 0, closeLine: 4, prefix: "" };
		expect(listTdslFenceRanges(lines)).toEqual([range]);
		expect(findTdslFenceAtCursor(lines, 3)).toEqual({
			status: "found",
			range,
		});
	});

	it("still closes on a plain fence line (control)", () => {
		const lines = ["~~~tdsl", 'timeline "Title', "plain title text", "~~~"];
		expect(listTdslFenceRanges(lines)).toEqual([
			{ openLine: 0, closeLine: 3, prefix: "" },
		]);
	});
});

describe("marker outside the list item does not close a list fence (#345)", () => {
	it("treats an unindented marker as leaving the item (unclosed)", () => {
		const lines = ["- ~~~tdsl", "  timeline {}", "~~~"];
		expect(findTdslFenceAtCursor(lines, 1)).toEqual({
			status: "missing-close",
		});
		expect(listTdslFenceRanges(lines)).toEqual([]);
	});

	it("does not detect the inside of a top-level code fence as tdsl", () => {
		const lines = [
			"- ~~~text",
			"  example",
			"~~~",
			"~~~tdsl",
			"timeline {}",
			"~~~",
		];
		// Line 2 leaves the item and opens a plain code fence that swallows the rest.
		expect(findTdslFenceAtCursor(lines, 4)).toEqual({
			status: "not-in-block",
		});
		expect(listTdslFenceRanges(lines)).toEqual([]);
	});

	it("still closes on an indented marker inside the item (control)", () => {
		const lines = ["- ~~~tdsl", "  timeline {}", "  ~~~"];
		expect(listTdslFenceRanges(lines)).toEqual([
			{ openLine: 0, closeLine: 2, prefix: "  " },
		]);
	});
});

describe("listTdslFenceRanges", () => {
	it("returns an empty list when the document has no fences", () => {
		expect(listTdslFenceRanges(["plain markdown", "more text"])).toEqual([]);
	});

	it("lists a single closed tdsl block", () => {
		expect(
			listTdslFenceRanges(["before", "```tdsl", "timeline {}", "```", "after"]),
		).toEqual([{ openLine: 1, closeLine: 3, prefix: "" }]);
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
			{ openLine: 0, closeLine: 2, prefix: "" },
			{ openLine: 4, closeLine: 6, prefix: "" },
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
		).toEqual([{ openLine: 0, closeLine: 2, prefix: "" }]);
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
		).toEqual([{ openLine: 1, closeLine: 3, prefix: "> " }]);
	});

	it("does not treat a tdsl fence inside another language's block as a block", () => {
		expect(
			listTdslFenceRanges(["````md", "```tdsl", "timeline {}", "```", "````"]),
		).toEqual([]);
	});

	it("lists a tilde fence (~~~tdsl)", () => {
		expect(
			listTdslFenceRanges(["~~~tdsl", "timeline {}", "~~~", "after"]),
		).toEqual([{ openLine: 0, closeLine: 2, prefix: "" }]);
	});

	it("accepts a longer close fence than the open fence", () => {
		expect(listTdslFenceRanges(["````tdsl", "timeline {}", "`````"])).toEqual([
			{ openLine: 0, closeLine: 2, prefix: "" },
		]);
	});
});

describe("indented code block is not a fence (#338)", () => {
	it("ignores a 4-space indented fence outside a list", () => {
		const lines = ["    ~~~tdsl", "    timeline {}", "    ~~~"];
		expect(listTdslFenceRanges(lines)).toEqual([]);
		expect(findTdslFenceAtCursor(lines, 1)).toEqual({
			status: "not-in-block",
		});
	});

	it("ignores a tab indented fence outside a list", () => {
		const lines = ["\t```tdsl", "\ttimeline {}", "\t```"];
		expect(listTdslFenceRanges(lines)).toEqual([]);
	});

	it("keeps a deeply indented fence inside a list item", () => {
		const lines = ["- item", "    ~~~tdsl", "    timeline {}", "    ~~~"];
		expect(listTdslFenceRanges(lines)).toEqual([
			{ openLine: 1, closeLine: 3, prefix: "    " },
		]);
	});
});

describe("tab and space indentation are compared by columns (#347)", () => {
	const tabbed = ["-\t~~~tdsl", "\ttimeline {};", "\t~~~"];
	const mixed = ["- item", "    ~~~tdsl", "\ttimeline {};", "\t~~~"];

	it("finds a list fence continued with a tab like one continued with spaces", () => {
		expect(findTdslFenceAtCursor(tabbed, 1)).toEqual({
			status: "found",
			range: { openLine: 0, closeLine: 2, prefix: "    " },
		});
	});

	it("finds a fence whose open and body lines mix spaces and a tab", () => {
		const r = findTdslFenceAtCursor(mixed, 2);
		expect(r.status).toBe("found");
	});

	it("lists tab-indented list fences", () => {
		expect(listTdslFenceRanges(tabbed)).toHaveLength(1);
		expect(listTdslFenceRanges(mixed)).toHaveLength(1);
	});
});
