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
				const n = Number(raw);
				if (Number.isFinite(n) && n > 0) out.scale = n;
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

/**
 * Formats error diagnostics into human-readable messages.
 * Includes the line number prefix when `line > 0`.
 */
export function formatDiagnosticMessages(errors: Diagnostic[]): string[] {
	return errors.map((e) =>
		e.line > 0 ? `Line ${e.line}: ${e.message}` : e.message,
	);
}
