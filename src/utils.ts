import { findTdslFenceAtCursor } from "./fence";

/**
 * Pure utility functions extracted from main.ts.
 * These have no Obsidian API or WASM dependencies and can be unit-tested directly.
 */

/**
 * Grammar reference shown alongside compile errors.
 *
 * Points at the `/en/` locale: the Starlight site has `root` = Japanese and
 * `en` as a sub-path, and every string this plugin renders is English.
 */
export const SYNTAX_REFERENCE_URL =
	"https://timeline-dsl-lp.pages.dev/en/docs/grammar/";

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
	/** renderer layout style. */
	layout_style?: "timeline" | "gantt" | "group-bands" | "zigzag";
	/** show labels next to event / event_range items. */
	events?: boolean;
	/** render the accompanying data table. */
	table?: boolean;
	/** render a static legend panel showing lane and tag colors. */
	legend?: boolean;
	/** vertical pixels per lane; positive integer only. 0 or undefined => renderer default. */
	lane_height?: number;
}

const BOOL_TRUE = new Set(["on", "true", "yes", "1"]);
const GRID_VALUES = new Set(["none", "decade", "year", "month"]);
const THEME_VALUES = new Set(["default", "dark", "print", "pastel"]);
const ORIENTATION_VALUES = new Set(["horizontal", "vertical"]);
const LAYOUT_STYLE_VALUES = new Set([
	"timeline",
	"gantt",
	"group-bands",
	"zigzag",
]);

/**
 * Extracts `//! key: value` directive comments from the source.
 * Unknown keys and out-of-range values are ignored so a typo never breaks rendering.
 */
export function parseRenderDirectives(source: string): RenderDirectives {
	const out: RenderDirectives = {};
	const re = /^[ \t]*\/\/!\s*([a-z_]+)\s*:\s*(.+?)\s*$/gim;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: idiomatic RegExp.exec loop
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
			case "layout_style":
				if (LAYOUT_STYLE_VALUES.has(val))
					out.layout_style = val as RenderDirectives["layout_style"];
				break;
			case "events":
				out.events = BOOL_TRUE.has(val);
				break;
			case "table":
				out.table = BOOL_TRUE.has(val);
				break;
			case "legend":
				out.legend = BOOL_TRUE.has(val);
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
	orientation: "horizontal" | "vertical";
	/** Default renderer layout style. `"auto"` leaves it to the renderer. */
	layoutStyle: "auto" | "timeline" | "gantt" | "group-bands" | "zigzag";
	/** Render the accompanying item-listing table inside the SVG. */
	table: boolean;
	/** Render a static legend panel showing lane and tag colours. */
	legend: boolean;
	/** Default vertical pixels per lane (positive integer). 0 => renderer default (60 px). */
	laneHeight: number;
	/**
	 * Wheel-zoom / drag-pan / fullscreen on the preview (client-side viewBox
	 * rewrite, not a WASM render option). Composes with `scale: fit` and the
	 * default horizontal-scroll display without conflict — both just control
	 * how the SVG's CSS box is sized, while pan/zoom rewrites its `viewBox`
	 * independently. This toggle exists as an opt-out for users who prefer the
	 * plain scroll-only behaviour.
	 */
	panZoom: boolean;
}

export const DEFAULT_SETTINGS: TdslSettings = {
	theme: "auto",
	grid: "none",
	scale: "auto",
	events: false,
	orientation: "horizontal",
	layoutStyle: "auto",
	table: false,
	legend: false,
	laneHeight: 0,
	panZoom: true,
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
	layout_style?: "timeline" | "gantt" | "group-bands" | "zigzag";
	events?: boolean;
	table?: boolean;
	legend?: boolean;
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

	// orientation / layout_style / table / legend: directive wins; else the settings default.
	resolved.orientation = directives.orientation ?? settings.orientation;
	resolved.layout_style =
		directives.layout_style ??
		(settings.layoutStyle === "auto" ? undefined : settings.layoutStyle);
	resolved.table = directives.table ?? settings.table;
	resolved.legend = directives.legend ?? settings.legend;

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
	return m?.[1].trim() ? m[1].trim() : null;
}

/**
 * Lightweight estimate of item count, used to decide whether a diagram is
 * large enough to guard behind a render confirmation (see
 * `exceedsLargeDiagramThreshold`). Counts `span` / `event` / `event_range`
 * keyword occurrences via a single regex pass — `event_range` is tried
 * before `event` in the alternation so it is consumed whole and not
 * double-counted as a plain `event`.
 *
 * This is deliberately a rough count, not a parse: false positives from a
 * keyword appearing in a comment or string are acceptable, since the guard
 * only needs to be right at the "very large diagram" order of magnitude.
 */
export function estimateItemCount(source: string): number {
	const matches = source.match(/\b(?:event_range|event|span)\b/g);
	return matches ? matches.length : 0;
}

/**
 * Threshold (estimated declared items) above which a diagram is guarded
 * behind a "Render diagram" confirmation instead of rendering immediately.
 *
 * Each item contributes several SVG nodes (a band/marker shape, a label
 * `<text>`, a `<title>`, a transparent hit-area, plus stems/dots for event
 * items), so 500 items works out to roughly 2000-2500 DOM nodes produced by
 * a single WASM render + `DOMParser` parse + `adoptNode` call — comfortably
 * past the point where a slower device can start to notice a stutter while
 * the note is open. Typical historical timelines (dozens to a few hundred
 * items, per the README's `range 794..1868` example) stay well under this.
 */
export const LARGE_DIAGRAM_ITEM_THRESHOLD = 500;

/** Whether `source` is large enough to guard behind a render confirmation. */
export function exceedsLargeDiagramThreshold(source: string): boolean {
	return estimateItemCount(source) > LARGE_DIAGRAM_ITEM_THRESHOLD;
}

/**
 * Resolves a vault path for `<baseName>.<extension>` in `folder`, appending
 * `-2`, `-3`, ... until `exists` reports no conflict. Never overwrites an
 * existing file — matches the "Save as file" action's documented behavior
 * (see #156's accepted resolution policy).
 *
 * `exists` is injected (checked against `Vault.getAbstractFileByPath` in
 * production) so this stays a pure, vault-independent function to unit test.
 */
export function resolveUniqueVaultPath(
	folder: string,
	baseName: string,
	extension: string,
	exists: (path: string) => boolean,
): string {
	const pathFor = (name: string) =>
		folder ? `${folder}/${name}.${extension}` : `${name}.${extension}`;

	let candidate = pathFor(baseName);
	for (let suffix = 2; exists(candidate); suffix++) {
		candidate = pathFor(`${baseName}-${suffix}`);
	}
	return candidate;
}

/**
 * Parses the JSON string returned by `check_source` into a Diagnostic array.
 * Returns `null` when `json` is not valid JSON, so callers can surface the
 * parse failure instead of silently treating it as "no diagnostics" (#211).
 */
export function parseDiagnostics(json: string): Diagnostic[] | null {
	try {
		return JSON.parse(json) as Diagnostic[];
	} catch {
		return null;
	}
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
 * A diagnostic split into the pieces the UI renders separately.
 *
 * `line` is kept apart from `text` so main.ts can turn the `Line N` segment
 * into its own clickable element.
 */
export interface DiagnosticParts {
	/** Text before the line label, e.g. `[missing_id] `. Empty for compile errors. */
	prefix: string;
	/** 1-based line within the block; `0` when there is no position. */
	line: number;
	/** The message, plus any trailing badge. */
	text: string;
}

export function diagnosticParts(e: Diagnostic): DiagnosticParts {
	return { prefix: "", line: e.line, text: e.message };
}

/**
 * Maps a diagnostic's line number onto a line in the note.
 *
 * Diagnostics count from 1 within the code-block body, while
 * `MarkdownSectionInformation.lineStart` is the 0-based line of the opening
 * fence. Body line 1 therefore sits at `lineStart + 1`, which collapses to
 * `lineStart + blockLine`.
 *
 * Returns `null` when the diagnostic carries no position (`line <= 0`), so
 * callers can leave it unclickable instead of jumping to an arbitrary line.
 */
export function resolveEditorLine(
	sectionLineStart: number,
	blockLine: number,
): number | null {
	if (blockLine <= 0) return null;
	return sectionLineStart + blockLine;
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
 * Returns `null` when `json` is not valid JSON, so callers can surface the
 * parse failure instead of silently treating it as "no lint issues" (#211).
 */
export function parseLintIssues(json: string): LintIssue[] | null {
	try {
		return JSON.parse(json) as LintIssue[];
	} catch {
		return null;
	}
}

/**
 * Formats lint issues into human-readable strings for display.
 * Includes a `[code]` prefix, line number when > 0, and a ✏ badge when fixable.
 */
export function lintIssueParts(i: LintIssue): DiagnosticParts {
	return {
		prefix: `[${i.code}] `,
		line: i.line,
		text: `${i.message}${i.fixable ? " ✏" : ""}`,
	};
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

/**
 * Reports whether `raw` is a value `parseScaleSetting` interprets literally
 * (empty, `auto`, `fit`, or a positive number) rather than silently falling
 * back to the `"auto"` default. Used by the settings UI to decide whether to
 * show a correction notice and rewrite the input field.
 */
export function isRecognizedScaleInput(raw: string): boolean {
	const v = raw.trim().toLowerCase();
	if (v === "" || v === "auto" || v === "fit") return true;
	const n = Number(v);
	return Number.isFinite(n) && n > 0;
}

/**
 * Resolves a raw `scale` input into the value to store and, when the input was
 * not interpreted literally, the field value and notice the settings UI should
 * show as a correction. The settings tab runs this only after typing stops:
 * validating per keystroke would reject the prefixes of multi-character words
 * (`f` / `fi` on the way to `fit`) and rewrite the field mid-word.
 */
export function commitScaleInput(raw: string): {
	value: TdslSettings["scale"];
	correction: { fieldValue: string; notice: string } | null;
} {
	const value = parseScaleSetting(raw);
	if (isRecognizedScaleInput(raw)) return { value, correction: null };
	return {
		value,
		correction: {
			fieldValue: String(value),
			notice: `Timeline DSL: "${raw}" is not a valid scale value. Reset to "${value}".`,
		},
	};
}

/**
 * Reports whether `raw` is a value `parseLaneHeightSetting` interprets
 * literally (empty, `0`, or a positive integer) rather than silently falling
 * back to the `0` (renderer default) value. Used by the settings UI to decide
 * whether to show a correction notice and rewrite the input field.
 *
 * `0` counts as recognized because the setting is documented as "empty or `0`
 * uses the renderer default" — parseLaneHeightSetting already maps it to that
 * default, so treating it as invalid would reject a value the UI advertises.
 */
export function isRecognizedLaneHeightInput(raw: string): boolean {
	const trimmed = raw.trim();
	if (trimmed === "" || trimmed === "0") return true;
	const n = Math.floor(Number(trimmed));
	return Number.isFinite(n) && n > 0;
}

/**
 * A debounced function with lifecycle controls: `cancel()` drops a pending
 * call, `flush()` runs it immediately. Both are no-ops when nothing is pending.
 */
export type Debounced<Args extends unknown[]> = ((...args: Args) => void) & {
	cancel: () => void;
	flush: () => void;
};

/**
 * Returns a debounced wrapper around `fn`: repeated calls within `waitMs`
 * of each other collapse into a single call after the last invocation.
 * Used to avoid triggering a full-vault preview rerender on every keystroke
 * in the settings text inputs.
 *
 * The returned function carries `cancel()` / `flush()` so owners can settle a
 * pending call at the end of their lifecycle — without them, a timer armed by
 * the last keystroke can still fire after the plugin is unloaded.
 */
export function debounce<Args extends unknown[]>(
	fn: (...args: Args) => void,
	waitMs: number,
): Debounced<Args> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pendingArgs: Args | null = null;

	const debounced = (...args: Args) => {
		if (timer !== null) clearTimeout(timer);
		pendingArgs = args;
		timer = setTimeout(() => {
			timer = null;
			const call = pendingArgs as Args;
			pendingArgs = null;
			fn(...call);
		}, waitMs);
	};

	debounced.cancel = () => {
		if (timer !== null) clearTimeout(timer);
		timer = null;
		pendingArgs = null;
	};

	debounced.flush = () => {
		if (timer === null) return;
		clearTimeout(timer);
		timer = null;
		const call = pendingArgs as Args;
		pendingArgs = null;
		fn(...call);
	};

	return debounced;
}

// ---------------------------------------------------------------------------
// Format-command helpers (pure, Obsidian-free, testable)
// ---------------------------------------------------------------------------

/**
 * Strips a fence's nesting prefix (e.g. `"> "` for a callout, `"  "` for an
 * indented list item) from one body line, so the WASM parser only sees DSL
 * text (#251). Blank lines inside the nesting often drop the prefix's
 * trailing whitespace (a callout's blank line is a bare `">"`), so this also
 * tries the prefix with trailing spaces/tabs removed before giving up.
 */
function stripFencePrefix(line: string, prefix: string): string {
	if (!prefix) return line;
	if (line.startsWith(prefix)) return line.slice(prefix.length);
	const bare = prefix.replace(/[ \t]+$/, "");
	if (bare && line.startsWith(bare)) return line.slice(bare.length);
	return line;
}

/** Prepends a fence's nesting prefix back onto a transformed body line. */
function restoreFencePrefix(line: string, prefix: string): string {
	return prefix ? prefix + line : line;
}

/**
 * Extracts the body string from a line array given a fence range.
 * Returns the joined text of lines openLine+1 .. closeLine-1 (exclusive).
 *
 * `prefix` is the nesting prefix reported by `findTdslFenceAtCursor` /
 * `listTdslFenceRanges` (empty for a top-level block); it is stripped from
 * each line so a callout's `> ` or a list's indentation never reaches the
 * WASM parser as DSL text (#251).
 */
export function extractFenceBody(
	lines: readonly string[],
	openLine: number,
	closeLine: number,
	prefix = "",
): string {
	const bodyLines: string[] = [];
	for (let i = openLine + 1; i < closeLine; i++) {
		bodyLines.push(stripFencePrefix(lines[i] ?? "", prefix));
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

/** Editor position, structurally compatible with Obsidian's `EditorPosition`. */
export interface FencePosition {
	line: number;
	ch: number;
}

/**
 * What the format / lint-fix commands should do, decided without touching the
 * editor.
 *
 * `error` carries the exact Notice text; `noop` means the transform returned
 * the body unchanged and the document must not be written (see below);
 * `replace` carries everything `Editor.replaceRange` needs.
 */
export type FenceTransformPlan =
	| { kind: "error"; message: string }
	| { kind: "noop" }
	| { kind: "replace"; text: string; from: FencePosition; to: FencePosition };

/**
 * Decides how to apply `transform` to the body of the tdsl block containing
 * `cursorLine`.
 *
 * Split out of main.ts's `transformCurrentBlock` so the whole decision — which
 * fence, which failure message, write or skip — is testable without an
 * Obsidian `Editor`. The caller is left with the two effects: showing a Notice
 * and calling `replaceRange`.
 *
 * `transform` is a WASM entry point (`format_source` / `lint_fix_source`) that
 * throws a string on parse failure; `errorLabel` names the operation in the
 * resulting message.
 *
 * A transform that returns the body byte-identical yields `noop` rather than a
 * `replace`: replacing text with itself would still push a pointless entry onto
 * the undo stack, and would make the lint-fix command report a fix that never
 * happened.
 */
export function planFenceTransform(
	lines: readonly string[],
	cursorLine: number,
	transform: (body: string) => string,
	errorLabel: string,
): FenceTransformPlan {
	const fence = findTdslFenceAtCursor(lines, cursorLine);
	if (fence.status === "not-in-block") {
		return {
			kind: "error",
			message: "Timeline DSL: Cursor is not inside a tdsl block.",
		};
	}
	if (fence.status === "missing-close") {
		return {
			kind: "error",
			message:
				"Timeline DSL: Could not find the closing fence of the tdsl block.",
		};
	}
	const { openLine, closeLine, prefix } = fence.range;
	const body = extractFenceBody(lines, openLine, closeLine, prefix);

	let result: string;
	try {
		result = transform(body);
	} catch (e) {
		return {
			kind: "error",
			message: `Timeline DSL ${errorLabel} error:\n${String(e)}`,
		};
	}

	// Both sides need the same normalization. `extractFenceBody` joins lines, so
	// the body carries a trailing newline only when its last line is blank;
	// comparing it against the always-newline-terminated `text` made the check
	// pass almost never (#221).
	const text = ensureTrailingNewline(result);
	if (text === ensureTrailingNewline(body)) return { kind: "noop" };

	// Restore the nesting prefix stripped by `extractFenceBody` onto every
	// transformed body line, but not onto the trailing newline terminator
	// itself — that newline only places the (already-prefixed) closing fence
	// on its own line (#251).
	const restored = prefix
		? ensureTrailingNewline(
				text
					.replace(/\n$/, "")
					.split("\n")
					.map((line) => restoreFencePrefix(line, prefix))
					.join("\n"),
			)
		: text;
	return {
		kind: "replace",
		text: restored,
		...fenceBodyRange(openLine, closeLine),
	};
}
