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
  return diagnostics.filter((d) => d.severity === 'error');
}

/**
 * Formats error diagnostics into human-readable messages.
 * Includes the line number prefix when `line > 0`.
 */
export function formatDiagnosticMessages(errors: Diagnostic[]): string[] {
  return errors.map((e) => (e.line > 0 ? `Line ${e.line}: ${e.message}` : e.message));
}
