import { afterEach, describe, expect, it, vi } from "vitest";
import {
	commitScaleInput,
	DEFAULT_SETTINGS,
	debounce,
	ensureTrailingNewline,
	estimateItemCount,
	exceedsLargeDiagramThreshold,
	extractFenceBody,
	extractTimelineTitle,
	fenceBodyRange,
	filterErrors,
	filterInfos,
	filterWarnings,
	formatDiagnosticMessages,
	formatLintIssues,
	hasWikidataImport,
	isRecognizedLaneHeightInput,
	isRecognizedScaleInput,
	parseDiagnostics,
	parseLaneHeightSetting,
	parseLintIssues,
	parseRenderDirectives,
	parseScaleSetting,
	resolveEditorLine,
	resolveRenderOptions,
	resolveUniqueVaultPath,
	SYNTAX_REFERENCE_URL,
	type TdslSettings,
} from "./utils";

// ----------------------------------------------------------------------------
// resolveEditorLine
// ----------------------------------------------------------------------------

describe("resolveEditorLine", () => {
	// lineStart is the 0-based line of the ```tdsl fence, so body line 1 is the
	// line right after it. Getting this off by one sends the cursor to the fence
	// (or into the previous paragraph) instead of the offending statement.
	it("maps body line 1 to the line just after the opening fence", () => {
		expect(resolveEditorLine(10, 1)).toBe(11);
	});

	it("maps later body lines by the same offset", () => {
		expect(resolveEditorLine(10, 5)).toBe(15);
	});

	it("works when the block starts at the top of the note", () => {
		expect(resolveEditorLine(0, 1)).toBe(1);
	});

	it("returns null for a diagnostic with no position", () => {
		expect(resolveEditorLine(10, 0)).toBeNull();
		expect(resolveEditorLine(10, -1)).toBeNull();
	});
});

// ----------------------------------------------------------------------------
// SYNTAX_REFERENCE_URL
// ----------------------------------------------------------------------------

describe("SYNTAX_REFERENCE_URL", () => {
	// This string is shipped into the error UI, where a typo is only visible by
	// clicking through. Pin the parts that carry meaning.
	it("is an absolute https URL", () => {
		const url = new URL(SYNTAX_REFERENCE_URL);
		expect(url.protocol).toBe("https:");
		expect(url.hostname).toBe("timeline-dsl-lp.pages.dev");
	});

	it("points at the English locale (the plugin UI is English)", () => {
		expect(new URL(SYNTAX_REFERENCE_URL).pathname).toBe("/en/docs/grammar/");
	});
});

// ----------------------------------------------------------------------------
// resolveRenderOptions (directive > setting > built-in)
// ----------------------------------------------------------------------------

describe("resolveRenderOptions", () => {
	it("falls back to built-in defaults with no directives and default settings", () => {
		expect(resolveRenderOptions({})).toEqual({
			scale: 0,
			fit: false,
			grid: "none",
			events: false,
			orientation: "horizontal",
			layout_style: undefined,
			table: false,
			legend: false,
			laneHeight: 0,
		});
	});

	it("applies plugin settings when no directive is present", () => {
		const settings: TdslSettings = {
			theme: "pastel",
			grid: "decade",
			scale: 3,
			events: true,
			orientation: "vertical",
			layoutStyle: "auto",
			table: true,
			legend: true,
			laneHeight: 0,
			panZoom: true,
		};
		expect(resolveRenderOptions({}, settings)).toEqual({
			scale: 3,
			fit: false,
			grid: "decade",
			theme: "pastel",
			events: true,
			orientation: "vertical",
			layout_style: undefined,
			table: true,
			legend: true,
			laneHeight: 0,
		});
	});

	it("lets a block directive override the plugin setting", () => {
		const settings: TdslSettings = {
			theme: "pastel",
			grid: "decade",
			scale: 3,
			events: true,
			orientation: "vertical",
			layoutStyle: "gantt",
			table: true,
			legend: true,
			laneHeight: 0,
			panZoom: true,
		};
		const r = resolveRenderOptions(
			{
				grid: "month",
				theme: "dark",
				scale: 5,
				events: false,
				orientation: "horizontal",
				layout_style: "zigzag",
				table: false,
				legend: false,
			},
			settings,
		);
		expect(r).toMatchObject({
			grid: "month",
			theme: "dark",
			scale: 5,
			events: false,
			orientation: "horizontal",
			layout_style: "zigzag",
			table: false,
			legend: false,
			fit: false,
		});
	});

	it("lane_height: directive wins over setting", () => {
		const r = resolveRenderOptions(
			{ lane_height: 80 },
			{ ...DEFAULT_SETTINGS, laneHeight: 40 },
		);
		expect(r.laneHeight).toBe(80);
	});

	it("lane_height: falls back to settings when no directive", () => {
		const r = resolveRenderOptions({}, { ...DEFAULT_SETTINGS, laneHeight: 40 });
		expect(r.laneHeight).toBe(40);
	});

	it("lane_height: 0 when both unset", () => {
		expect(resolveRenderOptions({}).laneHeight).toBe(0);
	});

	it("theme: auto leaves the renderer theme unset", () => {
		const r = resolveRenderOptions({}, { ...DEFAULT_SETTINGS, theme: "auto" });
		expect(r.theme).toBeUndefined();
	});

	it("settings scale: fit produces fit=true / scale=0", () => {
		const r = resolveRenderOptions({}, { ...DEFAULT_SETTINGS, scale: "fit" });
		expect(r.fit).toBe(true);
		expect(r.scale).toBe(0);
	});

	it("orientation: falls back to settings when no directive", () => {
		const r = resolveRenderOptions(
			{},
			{ ...DEFAULT_SETTINGS, orientation: "vertical" },
		);
		expect(r.orientation).toBe("vertical");
	});

	it("orientation: directive wins over setting", () => {
		const r = resolveRenderOptions(
			{ orientation: "horizontal" },
			{ ...DEFAULT_SETTINGS, orientation: "vertical" },
		);
		expect(r.orientation).toBe("horizontal");
	});

	it("table / legend: fall back to settings when no directive", () => {
		const r = resolveRenderOptions(
			{},
			{ ...DEFAULT_SETTINGS, table: true, legend: true },
		);
		expect(r.table).toBe(true);
		expect(r.legend).toBe(true);
	});

	// `false` is a meaningful directive value here, not "unset" — a block must be
	// able to switch the table/legend back off when the vault default turns them on.
	it("table / legend: a directive of false overrides a setting of true", () => {
		const r = resolveRenderOptions(
			{ table: false, legend: false },
			{ ...DEFAULT_SETTINGS, table: true, legend: true },
		);
		expect(r.table).toBe(false);
		expect(r.legend).toBe(false);
	});

	it("table / legend: directive of true overrides a setting of false", () => {
		const r = resolveRenderOptions(
			{ table: true, legend: true },
			{ ...DEFAULT_SETTINGS, table: false, legend: false },
		);
		expect(r.table).toBe(true);
		expect(r.legend).toBe(true);
	});

	it("directive fit overrides a numeric settings scale", () => {
		const r = resolveRenderOptions(
			{ fit: true },
			{ ...DEFAULT_SETTINGS, scale: 8 },
		);
		expect(r.fit).toBe(true);
		expect(r.scale).toBe(0);
	});
});

// ----------------------------------------------------------------------------
// parseRenderDirectives
// ----------------------------------------------------------------------------

describe("parseRenderDirectives", () => {
	it("returns an empty object when there are no directives", () => {
		expect(parseRenderDirectives(`timeline "T" { unit year; }`)).toEqual({});
	});

	it("parses all supported directives", () => {
		const src = `//! scale: 3\n//! grid: decade\n//! theme: dark\n//! orientation: vertical\n//! layout_style: gantt\n//! events: on\n//! table: off\n//! legend: on\n//! lane_height: 60\ntimeline "T" {}`;
		expect(parseRenderDirectives(src)).toEqual({
			scale: 3,
			fit: false,
			grid: "decade",
			theme: "dark",
			orientation: "vertical",
			layout_style: "gantt",
			events: true,
			table: false,
			legend: true,
			lane_height: 60,
		});
	});

	it("lane_height: parses a positive integer", () => {
		expect(parseRenderDirectives(`//! lane_height: 40`).lane_height).toBe(40);
	});

	it("lane_height: truncates to integer", () => {
		expect(parseRenderDirectives(`//! lane_height: 45.7`).lane_height).toBe(45);
	});

	it("lane_height: ignores 0 and negative values", () => {
		expect(
			parseRenderDirectives(`//! lane_height: 0`).lane_height,
		).toBeUndefined();
		expect(
			parseRenderDirectives(`//! lane_height: -10`).lane_height,
		).toBeUndefined();
	});

	it("parses `scale: fit` as fit=true with no numeric scale", () => {
		const d = parseRenderDirectives(`//! scale: fit\ntimeline "T" {}`);
		expect(d.fit).toBe(true);
		expect(d.scale).toBeUndefined();
	});

	it("treats `scale: fit` case-insensitively", () => {
		expect(parseRenderDirectives(`//! scale: FIT`).fit).toBe(true);
	});

	it("a numeric scale sets fit=false (mutually exclusive)", () => {
		const d = parseRenderDirectives(`//! scale: 4`);
		expect(d.scale).toBe(4);
		expect(d.fit).toBe(false);
	});

	it("ignores unknown keys and out-of-range values", () => {
		const src = `//! scale: -2\n//! grid: galaxy\n//! layout_style: 3d\n//! foo: bar`;
		expect(parseRenderDirectives(src)).toEqual({});
	});

	it("parses layout_style", () => {
		expect(parseRenderDirectives(`//! layout_style: gantt`).layout_style).toBe(
			"gantt",
		);
		expect(
			parseRenderDirectives(`//! layout_style: group-bands`).layout_style,
		).toBe("group-bands");
		expect(parseRenderDirectives(`//! LAYOUT_STYLE: ZIGZAG`).layout_style).toBe(
			"zigzag",
		);
	});

	it("treats only on/true/yes/1 as truthy for booleans", () => {
		expect(parseRenderDirectives(`//! events: yes`).events).toBe(true);
		expect(parseRenderDirectives(`//! events: nope`).events).toBe(false);
	});

	it("is case-insensitive for keys and enum values", () => {
		expect(parseRenderDirectives(`//! GRID: Decade`).grid).toBe("decade");
	});
});

// ----------------------------------------------------------------------------
// hasWikidataImport
// ----------------------------------------------------------------------------

describe("hasWikidataImport", () => {
	it("returns true for a bare import wikidata line", () => {
		expect(hasWikidataImport("import wikidata")).toBe(true);
	});

	it("returns true when import wikidata appears among other lines", () => {
		const source = `timeline "My Timeline"\nimport wikidata\nspan 2020 2025 "Era"`;
		expect(hasWikidataImport(source)).toBe(true);
	});

	it("returns true with leading whitespace before import", () => {
		expect(hasWikidataImport("  import wikidata")).toBe(true);
	});

	it("returns false for a source with no import wikidata", () => {
		const source = `timeline "My Timeline"\nspan 2020 2025 "Era"`;
		expect(hasWikidataImport(source)).toBe(false);
	});

	it('returns false when "wikidata" appears inside a string (no import keyword)', () => {
		expect(hasWikidataImport('span 2020 2025 "wikidata item"')).toBe(false);
	});

	it('returns false for a partial keyword match like "import wikidataX"', () => {
		expect(hasWikidataImport("import wikidataX")).toBe(false);
	});

	it("returns false for an empty string", () => {
		expect(hasWikidataImport("")).toBe(false);
	});
});

// ----------------------------------------------------------------------------
// estimateItemCount / exceedsLargeDiagramThreshold
// ----------------------------------------------------------------------------

describe("estimateItemCount", () => {
	it("counts span, event, and event_range declarations", () => {
		const source = [
			'span a 2020 2025 "Era" {};',
			'event b 2021 "Point" {};',
			'event_range c 2022 2023 "Range" {};',
		].join("\n");
		expect(estimateItemCount(source)).toBe(3);
	});

	it("does not double-count event_range as both event_range and event", () => {
		expect(estimateItemCount('event_range c 2022 2023 "Range" {};')).toBe(1);
	});

	it("returns 0 for a source with no items", () => {
		expect(
			estimateItemCount('timeline "Empty"\nunit year;\nrange 0..10;'),
		).toBe(0);
	});

	it("returns 0 for an empty string", () => {
		expect(estimateItemCount("")).toBe(0);
	});
});

describe("exceedsLargeDiagramThreshold", () => {
	it("returns false for a small diagram", () => {
		expect(exceedsLargeDiagramThreshold('span a 1..2 "x" {};')).toBe(false);
	});

	it("returns true once the item count exceeds the threshold", () => {
		const source = Array.from(
			{ length: 501 },
			(_, i) => `span s${i} ${i}..${i + 1} "x" {};`,
		).join("\n");
		expect(exceedsLargeDiagramThreshold(source)).toBe(true);
	});

	it("returns false right at the threshold", () => {
		const source = Array.from(
			{ length: 500 },
			(_, i) => `span s${i} ${i}..${i + 1} "x" {};`,
		).join("\n");
		expect(exceedsLargeDiagramThreshold(source)).toBe(false);
	});
});

// ----------------------------------------------------------------------------
// resolveUniqueVaultPath
// ----------------------------------------------------------------------------

describe("resolveUniqueVaultPath", () => {
	it("uses the base name unchanged when there is no conflict", () => {
		const path = resolveUniqueVaultPath(
			"Notes",
			"My Note-timeline",
			"svg",
			() => false,
		);
		expect(path).toBe("Notes/My Note-timeline.svg");
	});

	it("joins without a leading slash when the folder is the vault root", () => {
		const path = resolveUniqueVaultPath(
			"",
			"Note-timeline",
			"svg",
			() => false,
		);
		expect(path).toBe("Note-timeline.svg");
	});

	it("appends -2 when the base name is taken", () => {
		const taken = new Set(["Notes/Note-timeline.svg"]);
		const path = resolveUniqueVaultPath("Notes", "Note-timeline", "svg", (p) =>
			taken.has(p),
		);
		expect(path).toBe("Notes/Note-timeline-2.svg");
	});

	it("keeps incrementing past multiple conflicts", () => {
		const taken = new Set([
			"Notes/Note-timeline.svg",
			"Notes/Note-timeline-2.svg",
			"Notes/Note-timeline-3.svg",
		]);
		const path = resolveUniqueVaultPath("Notes", "Note-timeline", "svg", (p) =>
			taken.has(p),
		);
		expect(path).toBe("Notes/Note-timeline-4.svg");
	});

	it("never reports a path that exists() flags as taken", () => {
		const exists = vi.fn().mockReturnValue(true);
		let calls = 0;
		const guarded = (p: string) => {
			calls++;
			if (calls > 5) return false; // avoid an infinite loop if the guard breaks
			return exists(p);
		};
		const path = resolveUniqueVaultPath("", "x", "svg", guarded);
		expect(path).toBe("x-6.svg");
	});
});

// ----------------------------------------------------------------------------
// extractTimelineTitle
// ----------------------------------------------------------------------------

describe("extractTimelineTitle", () => {
	it('extracts the title from a timeline "..." line', () => {
		expect(extractTimelineTitle('timeline "My Project"')).toBe("My Project");
	});

	it("extracts title when it appears after other lines", () => {
		const source = `# comment\ntimeline "Hello World"\nspan 2020 2025 "Era"`;
		expect(extractTimelineTitle(source)).toBe("Hello World");
	});

	it("extracts title with leading whitespace before timeline keyword", () => {
		expect(extractTimelineTitle('  timeline "Indented"')).toBe("Indented");
	});

	it('returns null when no timeline "..." line exists', () => {
		expect(extractTimelineTitle('span 2020 2025 "Era"')).toBeNull();
	});

	it("returns null when the title is empty string", () => {
		expect(extractTimelineTitle('timeline ""')).toBeNull();
	});

	it("returns null when the title is whitespace only", () => {
		expect(extractTimelineTitle('timeline "   "')).toBeNull();
	});

	it("trims surrounding whitespace from the title", () => {
		expect(extractTimelineTitle('timeline "  Padded  "')).toBe("Padded");
	});
});

// ----------------------------------------------------------------------------
// parseDiagnostics
// ----------------------------------------------------------------------------

describe("parseDiagnostics", () => {
	it("parses an empty array", () => {
		expect(parseDiagnostics("[]")).toEqual([]);
	});

	it("parses a single diagnostic entry", () => {
		const json = JSON.stringify([
			{ severity: "error", message: "bad token", line: 3, col: 5 },
		]);
		expect(parseDiagnostics(json)).toEqual([
			{ severity: "error", message: "bad token", line: 3, col: 5 },
		]);
	});

	it("parses multiple diagnostics with mixed severities", () => {
		const json = JSON.stringify([
			{ severity: "error", message: "err1", line: 1, col: 1 },
			{ severity: "warning", message: "warn1", line: 2, col: 3 },
		]);
		const result = parseDiagnostics(json);
		expect(result).toHaveLength(2);
		expect(result[0].severity).toBe("error");
		expect(result[1].severity).toBe("warning");
	});
});

// ----------------------------------------------------------------------------
// filterErrors
// ----------------------------------------------------------------------------

describe("filterErrors", () => {
	it('returns only diagnostics with severity "error"', () => {
		const diagnostics = [
			{ severity: "error", message: "e1", line: 1, col: 1 },
			{ severity: "warning", message: "w1", line: 2, col: 2 },
			{ severity: "error", message: "e2", line: 3, col: 3 },
			{ severity: "info", message: "i1", line: 4, col: 4 },
		];
		const errors = filterErrors(diagnostics);
		expect(errors).toHaveLength(2);
		expect(errors.every((d) => d.severity === "error")).toBe(true);
	});

	it("returns an empty array when there are no errors", () => {
		const diagnostics = [
			{ severity: "warning", message: "w1", line: 1, col: 1 },
		];
		expect(filterErrors(diagnostics)).toEqual([]);
	});

	it("returns an empty array for an empty input", () => {
		expect(filterErrors([])).toEqual([]);
	});
});

// ----------------------------------------------------------------------------
// filterWarnings / filterInfos
// ----------------------------------------------------------------------------

describe("filterWarnings", () => {
	it('returns only diagnostics with severity "warning"', () => {
		const diagnostics = [
			{ severity: "error", message: "e1", line: 1, col: 1 },
			{ severity: "warning", message: "w1", line: 2, col: 2 },
			{ severity: "info", message: "i1", line: 3, col: 3 },
			{ severity: "warning", message: "w2", line: 4, col: 4 },
		];
		const result = filterWarnings(diagnostics);
		expect(result).toHaveLength(2);
		expect(result.every((d) => d.severity === "warning")).toBe(true);
	});

	it("returns an empty array for empty input", () => {
		expect(filterWarnings([])).toEqual([]);
	});
});

describe("filterInfos", () => {
	it('returns only diagnostics with severity "info"', () => {
		const diagnostics = [
			{ severity: "error", message: "e1", line: 1, col: 1 },
			{ severity: "info", message: "i1", line: 2, col: 2 },
		];
		const result = filterInfos(diagnostics);
		expect(result).toHaveLength(1);
		expect(result[0].severity).toBe("info");
	});

	it("returns an empty array for empty input", () => {
		expect(filterInfos([])).toEqual([]);
	});
});

// ----------------------------------------------------------------------------
// formatDiagnosticMessages
// ----------------------------------------------------------------------------

describe("formatDiagnosticMessages", () => {
	it("prefixes message with line number when line > 0", () => {
		const errors = [
			{ severity: "error", message: "bad token", line: 3, col: 1 },
		];
		expect(formatDiagnosticMessages(errors)).toEqual(["Line 3: bad token"]);
	});

	it("omits the line prefix when line === 0", () => {
		const errors = [
			{ severity: "error", message: "unknown error", line: 0, col: 0 },
		];
		expect(formatDiagnosticMessages(errors)).toEqual(["unknown error"]);
	});

	it("handles multiple errors with mixed line values", () => {
		const errors = [
			{ severity: "error", message: "first", line: 1, col: 0 },
			{ severity: "error", message: "second", line: 0, col: 0 },
			{ severity: "error", message: "third", line: 5, col: 2 },
		];
		expect(formatDiagnosticMessages(errors)).toEqual([
			"Line 1: first",
			"second",
			"Line 5: third",
		]);
	});

	it("returns an empty array for empty input", () => {
		expect(formatDiagnosticMessages([])).toEqual([]);
	});
});

// ----------------------------------------------------------------------------
// parseLintIssues / formatLintIssues
// ----------------------------------------------------------------------------

describe("parseLintIssues", () => {
	it("parses an empty array", () => {
		expect(parseLintIssues("[]")).toEqual([]);
	});

	it("parses a single lint issue", () => {
		const json = JSON.stringify([
			{
				code: "start_gt_end",
				severity: "warning",
				line: 5,
				message: "start is after end",
				fixable: true,
			},
		]);
		expect(parseLintIssues(json)).toEqual([
			{
				code: "start_gt_end",
				severity: "warning",
				line: 5,
				message: "start is after end",
				fixable: true,
			},
		]);
	});
});

describe("formatLintIssues", () => {
	it("formats an issue with line and fixable flag", () => {
		const issues = [
			{
				code: "start_gt_end",
				severity: "warning" as const,
				line: 5,
				message: "start is after end",
				fixable: true,
			},
		];
		expect(formatLintIssues(issues)).toEqual([
			"[start_gt_end] Line 5: start is after end ✏",
		]);
	});

	it("omits line prefix when line === 0", () => {
		const issues = [
			{
				code: "missing_id",
				severity: "warning" as const,
				line: 0,
				message: "span is missing id",
				fixable: false,
			},
		];
		expect(formatLintIssues(issues)).toEqual([
			"[missing_id] span is missing id",
		]);
	});

	it("omits fixable badge when fixable === false", () => {
		const issues = [
			{
				code: "invalid_tags",
				severity: "warning" as const,
				line: 3,
				message: "unknown tag",
				fixable: false,
			},
		];
		expect(formatLintIssues(issues)).toEqual([
			"[invalid_tags] Line 3: unknown tag",
		]);
	});

	it("returns an empty array for empty input", () => {
		expect(formatLintIssues([])).toEqual([]);
	});
});

// ----------------------------------------------------------------------------
// parseScaleSetting
// ----------------------------------------------------------------------------

describe("parseScaleSetting", () => {
	it('returns "auto" for empty string', () => {
		expect(parseScaleSetting("")).toBe("auto");
	});

	it('returns "auto" for the literal "auto"', () => {
		expect(parseScaleSetting("auto")).toBe("auto");
	});

	it('returns "auto" for whitespace-only input', () => {
		expect(parseScaleSetting("  ")).toBe("auto");
	});

	it('returns "fit" for "fit"', () => {
		expect(parseScaleSetting("fit")).toBe("fit");
	});

	it('returns "fit" regardless of case', () => {
		expect(parseScaleSetting("FIT")).toBe("fit");
	});

	it("returns the numeric value for a positive number string", () => {
		expect(parseScaleSetting("5")).toBe(5);
	});

	it("returns the numeric value for a decimal positive number", () => {
		expect(parseScaleSetting("2.5")).toBe(2.5);
	});

	it('returns "auto" for "0" (zero is not a valid scale)', () => {
		expect(parseScaleSetting("0")).toBe("auto");
	});

	it('returns "auto" for a negative number string', () => {
		expect(parseScaleSetting("-3")).toBe("auto");
	});

	it('returns "auto" for non-numeric garbage', () => {
		expect(parseScaleSetting("banana")).toBe("auto");
	});
});

// ----------------------------------------------------------------------------
// parseLaneHeightSetting
// ----------------------------------------------------------------------------

describe("parseLaneHeightSetting", () => {
	it("returns 0 for empty string", () => {
		expect(parseLaneHeightSetting("")).toBe(0);
	});

	it("returns 0 for whitespace-only input", () => {
		expect(parseLaneHeightSetting("  ")).toBe(0);
	});

	it("returns the integer for a positive integer string", () => {
		expect(parseLaneHeightSetting("40")).toBe(40);
	});

	it("truncates decimals (floor)", () => {
		expect(parseLaneHeightSetting("45.9")).toBe(45);
	});

	it("returns 0 for zero", () => {
		expect(parseLaneHeightSetting("0")).toBe(0);
	});

	it("returns 0 for a negative number string", () => {
		expect(parseLaneHeightSetting("-10")).toBe(0);
	});

	it("returns 0 for non-numeric garbage", () => {
		expect(parseLaneHeightSetting("abc")).toBe(0);
	});
});

// ----------------------------------------------------------------------------
// isRecognizedScaleInput / isRecognizedLaneHeightInput
// ----------------------------------------------------------------------------

describe("isRecognizedScaleInput", () => {
	it("accepts empty, auto, fit, and positive numbers", () => {
		expect(isRecognizedScaleInput("")).toBe(true);
		expect(isRecognizedScaleInput("  ")).toBe(true);
		expect(isRecognizedScaleInput("auto")).toBe(true);
		expect(isRecognizedScaleInput("AUTO")).toBe(true);
		expect(isRecognizedScaleInput("fit")).toBe(true);
		expect(isRecognizedScaleInput("FIT")).toBe(true);
		expect(isRecognizedScaleInput("5")).toBe(true);
		expect(isRecognizedScaleInput("2.5")).toBe(true);
	});

	it("rejects zero, negative numbers, and garbage", () => {
		expect(isRecognizedScaleInput("0")).toBe(false);
		expect(isRecognizedScaleInput("-3")).toBe(false);
		expect(isRecognizedScaleInput("banana")).toBe(false);
	});
});

describe("isRecognizedLaneHeightInput", () => {
	it("accepts empty and positive integers (or decimals that floor to positive)", () => {
		expect(isRecognizedLaneHeightInput("")).toBe(true);
		expect(isRecognizedLaneHeightInput("  ")).toBe(true);
		expect(isRecognizedLaneHeightInput("40")).toBe(true);
		expect(isRecognizedLaneHeightInput("45.9")).toBe(true);
	});

	it("accepts `0`, which the setting documents as the renderer default", () => {
		expect(isRecognizedLaneHeightInput("0")).toBe(true);
		expect(isRecognizedLaneHeightInput(" 0 ")).toBe(true);
		// It resolves to the same value as an empty field, so no correction is due.
		expect(parseLaneHeightSetting("0")).toBe(0);
		expect(parseLaneHeightSetting("")).toBe(0);
	});

	it("rejects negative numbers and garbage", () => {
		expect(isRecognizedLaneHeightInput("-10")).toBe(false);
		expect(isRecognizedLaneHeightInput("abc")).toBe(false);
	});
});

// ----------------------------------------------------------------------------
// extractFenceBody
// ----------------------------------------------------------------------------

describe("extractFenceBody", () => {
	const lines = ["```tdsl", "timeline {}", "lane a {}", "```"];

	it("returns the body lines joined by newline", () => {
		expect(extractFenceBody(lines, 0, 3)).toBe("timeline {}\nlane a {}");
	});

	it("returns empty string when the fence has no body", () => {
		expect(extractFenceBody(["```tdsl", "```"], 0, 1)).toBe("");
	});

	it("returns a single-line body without a trailing newline", () => {
		expect(extractFenceBody(["```tdsl", "timeline {}", "```"], 0, 2)).toBe(
			"timeline {}",
		);
	});
});

// ----------------------------------------------------------------------------
// fenceBodyRange
// ----------------------------------------------------------------------------

describe("fenceBodyRange", () => {
	it("returns from = openLine+1, ch=0 and to = closeLine, ch=0", () => {
		expect(fenceBodyRange(2, 7)).toEqual({
			from: { line: 3, ch: 0 },
			to: { line: 7, ch: 0 },
		});
	});

	it("works when openLine is 0", () => {
		expect(fenceBodyRange(0, 5)).toEqual({
			from: { line: 1, ch: 0 },
			to: { line: 5, ch: 0 },
		});
	});
});

// ----------------------------------------------------------------------------
// ensureTrailingNewline
// ----------------------------------------------------------------------------

describe("ensureTrailingNewline", () => {
	it("adds a newline when the text has none", () => {
		expect(ensureTrailingNewline("hello")).toBe("hello\n");
	});

	it("does not add a second newline when one already exists", () => {
		expect(ensureTrailingNewline("hello\n")).toBe("hello\n");
	});

	it("handles empty string by adding a newline", () => {
		expect(ensureTrailingNewline("")).toBe("\n");
	});

	it("preserves internal newlines", () => {
		expect(ensureTrailingNewline("a\nb\nc")).toBe("a\nb\nc\n");
	});
});

// ----------------------------------------------------------------------------
// debounce
// ----------------------------------------------------------------------------

describe("debounce", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("collapses rapid successive calls into a single trailing call", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 400);

		debounced("a");
		vi.advanceTimersByTime(100);
		debounced("b");
		vi.advanceTimersByTime(100);
		debounced("c");

		expect(fn).not.toHaveBeenCalled();

		vi.advanceTimersByTime(400);

		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("c");
	});

	it("calls fn again after the wait elapses between separate bursts", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 400);

		debounced("first");
		vi.advanceTimersByTime(400);
		expect(fn).toHaveBeenCalledTimes(1);

		debounced("second");
		vi.advanceTimersByTime(400);
		expect(fn).toHaveBeenCalledTimes(2);
		expect(fn).toHaveBeenLastCalledWith("second");
	});

	it("cancel() drops a pending call (plugin unload path)", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 400);

		debounced("a");
		debounced.cancel();
		vi.advanceTimersByTime(1000);

		expect(fn).not.toHaveBeenCalled();
	});

	it("cancel() is a no-op when nothing is pending", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 400);

		debounced.cancel();
		vi.advanceTimersByTime(1000);
		expect(fn).not.toHaveBeenCalled();

		// The wrapper stays usable after a cancel.
		debounced("a");
		vi.advanceTimersByTime(400);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("a");
	});

	it("flush() runs the pending call immediately with the latest args", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 400);

		debounced("a");
		debounced("b");
		debounced.flush();

		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("b");

		// The timer is consumed, so no trailing call follows.
		vi.advanceTimersByTime(1000);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("flush() is a no-op when nothing is pending", () => {
		vi.useFakeTimers();
		const fn = vi.fn();
		const debounced = debounce(fn, 400);

		debounced.flush();
		expect(fn).not.toHaveBeenCalled();

		debounced("a");
		vi.advanceTimersByTime(400);
		debounced.flush();
		expect(fn).toHaveBeenCalledTimes(1);
	});
});

// ----------------------------------------------------------------------------
// Deferred scale-setting validation (settings tab behaviour)
// ----------------------------------------------------------------------------

describe("commitScaleInput", () => {
	it("keeps recognized values without a correction", () => {
		expect(commitScaleInput("fit")).toEqual({ value: "fit", correction: null });
		expect(commitScaleInput("auto")).toEqual({
			value: "auto",
			correction: null,
		});
		expect(commitScaleInput("")).toEqual({ value: "auto", correction: null });
		expect(commitScaleInput(" 120 ")).toEqual({ value: 120, correction: null });
	});

	it("reports the field rewrite and notice for an unrecognized value", () => {
		expect(commitScaleInput("abc")).toEqual({
			value: "auto",
			correction: {
				fieldValue: "auto",
				notice:
					'Timeline DSL: "abc" is not a valid scale value. Reset to "auto".',
			},
		});
	});

	it("reports a correction for the prefixes of `fit`", () => {
		// Not a bug in itself — it is why the settings tab must not run this per
		// keystroke. See the debounce test below.
		expect(commitScaleInput("f").correction).not.toBeNull();
		expect(commitScaleInput("fi").correction).not.toBeNull();
	});
});

describe("scale setting committed after debounce", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("lets `fit` be typed one character at a time without resetting", () => {
		vi.useFakeTimers();
		// Stands in for the settings tab: the field value plus the debounced
		// commit wired exactly as TdslSettingTab wires it.
		let fieldValue = "";
		const notices: string[] = [];
		const commit = debounce((raw: string) => {
			const { correction } = commitScaleInput(raw);
			if (correction) {
				fieldValue = correction.fieldValue;
				notices.push(correction.notice);
			}
		}, 400);

		for (const raw of ["f", "fi", "fit"]) {
			fieldValue = raw;
			commit(raw);
			vi.advanceTimersByTime(50);
		}
		vi.advanceTimersByTime(400);

		expect(fieldValue).toBe("fit");
		expect(notices).toEqual([]);
	});

	it("still corrects an input that is invalid once typing stops", () => {
		vi.useFakeTimers();
		let fieldValue = "";
		const notices: string[] = [];
		const commit = debounce((raw: string) => {
			const { correction } = commitScaleInput(raw);
			if (correction) {
				fieldValue = correction.fieldValue;
				notices.push(correction.notice);
			}
		}, 400);

		fieldValue = "abc";
		commit("abc");
		vi.advanceTimersByTime(400);

		expect(fieldValue).toBe("auto");
		expect(notices).toEqual([
			'Timeline DSL: "abc" is not a valid scale value. Reset to "auto".',
		]);
	});
});
