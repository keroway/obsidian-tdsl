/**
 * Pure utility functions extracted from main.ts.
 * These have no Obsidian API or WASM dependencies and can be unit-tested directly.
 */

export interface Diagnostic {
	severity: string;
	message: string;
	line: number;
	col: number;
}

/**
 * Per-block rendering directives, written as `//! key: value` comment lines.
 * Because `//` is an ordinary DSL comment, these lines are ignored by the
 * compiler and only consumed by the plugin to build render options.
 */
export interface RenderDirectives {
	/** pixels-per-year passed to the renderer; `undefined` => auto. */
	scale?: number;
	/**
	 * `scale: fit` => shrink the SVG to the note width (opt-in to the old
	 * `max-width: 100%` behaviour). Mutually exclusive with a numeric `scale`.
	 */
	fit?: boolean;
	grid?: "none" | "decade" | "year" | "month";
	theme?: "default" | "dark" | "print" | "pastel";
	orientation?: "horizontal" | "vertical";
	/** show labels next to event / event_range items. */
	events?: boolean;
	/** render the accompanying data table. */
	table?: boolean;
	/** vertical pixels per lane; positive integer only. 0 or undefined => renderer default. */
	lane_height?: number;
}

const BOOL_TRUE = new Set(["on", "true", "yes", "1"]);
const GRID_VALUES = new Set(["none", "decade", "year", "month"]);
const THEME_VALUES = new Set(["default", "dark", "print", "pastel"]);
const ORIENTATION_VALUES = new Set(["horizontal", "vertical"]);

/**
 * Extracts `//! key: value` directive comments from the source.
 * Unknown keys and out-of-range values are ignored so a typo never breaks rendering.
 */
export function parseRenderDirectives(source: string): RenderDirectives {
	const out: RenderDirectives = {};
	const re = /^[ \t]*\/\/!\s*([a-z_]+)\s*:\s*(.+?)\s*$/gim;
	let m: RegExpExecArray | null;
	while ((m = re.exec(source)) !== null) {
		const key = m[1].toLowerCase();
		const raw = m[2].trim();
		const val = raw.toLowerCase();
		switch (key) {
			case "scale": {
				if (val === "fit") {
					out.fit = true;
					out.scale = undefined;
					break;
				}
				const n = Number(raw);
				if (Number.isFinite(n) && n > 0) {
					out.scale = n;
					out.fit = false;
				}
				break;
			}
			case "grid":
				if (GRID_VALUES.has(val)) out.grid = val as RenderDirectives["grid"];
				break;
			case "theme":
				if (THEME_VALUES.has(val)) out.theme = val as RenderDirectives["theme"];
				break;
			case "orientation":
				if (ORIENTATION_VALUES.has(val))
					out.orientation = val as RenderDirectives["orientation"];
				break;
			case "events":
				out.events = BOOL_TRUE.has(val);
				break;
			case "table":
				out.table = BOOL_TRUE.has(val);
				break;
			case "lane_height": {
				const n = Number(raw);
				if (Number.isFinite(n) && n > 0) out.lane_height = Math.floor(n);
				break;
			}
		}
	}
	return out;
}

/**
 * Plugin-level defaults, configured in the settings tab and persisted via
 * `Plugin.loadData()` / `saveData()`. Per-block `//!` directives always win
 * over these.
 */
export interface TdslSettings {
	/** `"auto"` => do not force a renderer theme (let plugin CSS drive light/dark). */
	theme: "auto" | "default" | "dark" | "print" | "pastel";
	grid: "none" | "decade" | "year" | "month";
	/** `"auto"` => renderer auto scale; `"fit"` => shrink to note width; number => px/year. */
	scale: "auto" | "fit" | number;
	events: boolean;
	/** Default vertical pixels per lane (positive integer). 0 => renderer default (60 px). */
	laneHeight: number;
}

export const DEFAULT_SETTINGS: TdslSettings = {
	theme: "auto",
	grid: "none",
	scale: "auto",
	events: false,
	laneHeight: 0,
};

/**
 * Effective render parameters after merging per-block directives with the
 * plugin settings. Consumed by main.ts to build `JsRenderOptions` + the scale
 * argument + the `tdsl-fit` class.
 */
export interface ResolvedRender {
	/** pixels-per-year for the renderer; `0` = auto. */
	scale: number;
	/** shrink-to-note-width (CSS), renderer still uses auto scale. */
	fit: boolean;
	grid?: "none" | "decade" | "year" | "month";
	theme?: "default" | "dark" | "print" | "pastel";
	orientation?: "horizontal" | "vertical";
	events?: boolean;
	table?: boolean;
	/** vertical pixels per lane; 0 => renderer default. */
	laneHeight: number;
}

/**
 * Merges per-block directives over plugin settings (directive > setting > built-in).
 * Pure function — no Obsidian/WASM dependency — so the precedence rules are unit-testable.
 */
export function resolveRenderOptions(
	directives: RenderDirectives,
	settings: TdslSettings = DEFAULT_SETTINGS,
): ResolvedRender {
	const resolved: ResolvedRender = { scale: 0, fit: false, laneHeight: 0 };

	// scale / fit: directive wins; else fall back to the settings default.
	if (directives.fit) {
		resolved.fit = true;
	} else if (directives.scale !== undefined) {
		resolved.scale = directives.scale;
	} else if (settings.scale === "fit") {
		resolved.fit = true;
	} else if (typeof settings.scale === "number") {
		resolved.scale = settings.scale;
	}

	// grid: directive wins; else the settings default ("none" is a valid renderer value).
	resolved.grid = directives.grid ?? settings.grid;

	// theme: directive wins; else an explicit (non-"auto") settings theme; else leave unset.
	if (directives.theme) {
		resolved.theme = directives.theme;
	} else if (settings.theme !== "auto") {
		resolved.theme = settings.theme;
	}

	// events: directive wins; else the settings default.
	resolved.events = directives.events ?? settings.events;

	// orientation / table: directive-only (no settings counterpart).
	if (directives.orientation) resolved.orientation = directives.orientation;
	if (directives.table !== undefined) resolved.table = directives.table;

	// lane_height: directive wins; else the settings default (0 = renderer auto).
	if (directives.lane_height !== undefined && directives.lane_height > 0) {
		resolved.laneHeight = directives.lane_height;
	} else if (settings.laneHeight > 0) {
		resolved.laneHeight = settings.laneHeight;
	} else {
		resolved.laneHeight = 0;
	}

	return resolved;
}

/** Returns true when the source contains an `import wikidata` block. */
export function hasWikidataImport(source: string): boolean {
	return /^\s*import\s+wikidata\b/m.test(source);
}

/** Extracts the timeline title from a `timeline "..."` line, or null. */
export function extractTimelineTitle(source: string): string | null {
	const m = source.match(/^\s*timeline\s+"([^"]*)"/m);
	return m && m[1].trim() ? m[1].trim() : null;
}

/** Parses the JSON string returned by `check_source` into a Diagnostic array. */
export function parseDiagnostics(json: string): Diagnostic[] {
	return JSON.parse(json) as Diagnostic[];
}

/** Returns only the diagnostics whose severity is `"error"`. */
export function filterErrors(diagnostics: Diagnostic[]): Diagnostic[] {
	return diagnostics.filter((d) => d.severity === "error");
}

/** Returns only the diagnostics whose severity is `"warning"`. */
export function filterWarnings(diagnostics: Diagnostic[]): Diagnostic[] {
	return diagnostics.filter((d) => d.severity === "warning");
}

/** Returns only the diagnostics whose severity is `"info"`. */
export function filterInfos(diagnostics: Diagnostic[]): Diagnostic[] {
	return diagnostics.filter((d) => d.severity === "info");
}

/**
 * Formats error diagnostics into human-readable messages.
 * Includes the line number prefix when `line > 0`.
 */
export function formatDiagnosticMessages(errors: Diagnostic[]): string[] {
	return errors.map((e) =>
		e.line > 0 ? `Line ${e.line}: ${e.message}` : e.message,
	);
}

// ---------------------------------------------------------------------------
// Lint helpers
// ---------------------------------------------------------------------------

export interface LintIssue {
	/** Short rule identifier, e.g. `start_gt_end`, `invalid_tags`. */
	code: string;
	severity: "error" | "warning";
	/** 1-based line number; 0 when no position available. */
	line: number;
	message: string;
	/** Whether `lint_fix_source` can auto-fix this issue. */
	fixable: boolean;
}

/**
 * Parses the JSON string returned by `lint_source` into a LintIssue array.
 * Pure function — can be unit-tested without WASM.
 */
export function parseLintIssues(json: string): LintIssue[] {
	return JSON.parse(json) as LintIssue[];
}

/**
 * Formats lint issues into human-readable strings for display.
 * Includes a `[code]` prefix, line number when > 0, and a ✏ badge when fixable.
 */
export function formatLintIssues(issues: LintIssue[]): string[] {
	return issues.map((i) => {
		const loc = i.line > 0 ? ` Line ${i.line}:` : "";
		const fix = i.fixable ? " ✏" : "";
		return `[${i.code}]${loc} ${i.message}${fix}`;
	});
}

/** Coerces the free-text `scale` setting value into `"auto" | "fit" | number`. */
export function parseScaleSetting(raw: string): TdslSettings["scale"] {
	const v = raw.trim().toLowerCase();
	if (v === "fit") return "fit";
	const n = Number(v);
	if (v !== "" && v !== "auto" && Number.isFinite(n) && n > 0) return n;
	return "auto";
}

/** Coerces the free-text `lane_height` setting value into a non-negative integer (0 = renderer default). */
export function parseLaneHeightSetting(raw: string): number {
	const n = Math.floor(Number(raw.trim()));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Format-command helpers (pure, Obsidian-free, testable)
// ---------------------------------------------------------------------------

/**
 * Extracts the body string from a line array given a fence range.
 * Returns the joined text of lines openLine+1 .. closeLine-1 (exclusive).
 */
export function extractFenceBody(
	lines: readonly string[],
	openLine: number,
	closeLine: number,
): string {
	const bodyLines: string[] = [];
	for (let i = openLine + 1; i < closeLine; i++) {
		bodyLines.push(lines[i] ?? "");
	}
	return bodyLines.join("\n");
}

/**
 * Returns the editor `from`/`to` positions for the body of a fence block.
 * `from` is the start of the first body line; `to` is the start of the
 * closing fence line (so `replaceRange` replaces exactly the body and the
 * trailing newline before the closing ``` ).
 */
export function fenceBodyRange(
	openLine: number,
	closeLine: number,
): { from: { line: number; ch: number }; to: { line: number; ch: number } } {
	return {
		from: { line: openLine + 1, ch: 0 },
		to: { line: closeLine, ch: 0 },
	};
}

/**
 * Ensures `text` ends with exactly one newline character.
 * Used to guarantee the closing ``` appears on its own line after the
 * formatted body.
 */
export function ensureTrailingNewline(text: string): string {
	return text.endsWith("\n") ? text : `${text}\n`;
}
