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
}

export const DEFAULT_SETTINGS: TdslSettings = {
	theme: "auto",
	grid: "none",
	scale: "auto",
	events: false,
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
}

/**
 * Merges per-block directives over plugin settings (directive > setting > built-in).
 * Pure function — no Obsidian/WASM dependency — so the precedence rules are unit-testable.
 */
export function resolveRenderOptions(
	directives: RenderDirectives,
	settings: TdslSettings = DEFAULT_SETTINGS,
): ResolvedRender {
	const resolved: ResolvedRender = { scale: 0, fit: false };

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
