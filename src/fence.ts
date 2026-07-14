export interface TdslFenceRange {
	openLine: number;
	closeLine: number;
}

export type TdslFenceResult =
	| { status: "found"; range: TdslFenceRange }
	| { status: "not-in-block" }
	| { status: "missing-close" };

// Matches an optional run of blockquote markers (`>`) and/or leading
// whitespace before the fence itself, so tdsl blocks nested inside
// callouts (`> ` prefix) or indented list items are still recognized.
// Capture group 1 is the prefix so callers can verify the open/close
// fence share the same nesting prefix.
const TDSL_FENCE_OPEN_RE = /^([ \t]*(?:>[ \t]*)*)```tdsl\s*$/;
const FENCE_CLOSE_RE = /^([ \t]*(?:>[ \t]*)*)```\s*$/;

/**
 * Finds the `tdsl` fenced code block body that contains `cursorLine`.
 *
 * The cursor must be on a body line, not on either fence marker. This prevents
 * the format command from accidentally reformatting a previous block when the
 * cursor is in normal markdown after that block.
 */
export function findTdslFenceAtCursor(
	lines: readonly string[],
	cursorLine: number,
): TdslFenceResult {
	let openLine = -1;
	let openPrefix = "";

	for (let i = cursorLine; i >= 0; i--) {
		const m = TDSL_FENCE_OPEN_RE.exec(lines[i] ?? "");
		if (m) {
			openLine = i;
			openPrefix = m[1] ?? "";
			break;
		}
	}

	if (openLine === -1 || cursorLine <= openLine) {
		return { status: "not-in-block" };
	}

	for (let i = openLine + 1; i < lines.length; i++) {
		const m = FENCE_CLOSE_RE.exec(lines[i] ?? "");
		// Only a close fence sharing the same nesting prefix as the open fence
		// (e.g. both inside the same callout / list indentation) can pair with
		// it. A differently-nested fence is skipped and the search continues.
		if (m && (m[1] ?? "") === openPrefix) {
			if (cursorLine >= i) return { status: "not-in-block" };
			return { status: "found", range: { openLine, closeLine: i } };
		}
	}

	return { status: "missing-close" };
}
