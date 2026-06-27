export interface TdslFenceRange {
	openLine: number;
	closeLine: number;
}

export type TdslFenceResult =
	| { status: "found"; range: TdslFenceRange }
	| { status: "not-in-block" }
	| { status: "missing-close" };

const TDSL_FENCE_OPEN_RE = /^```tdsl\s*$/;
const FENCE_CLOSE_RE = /^```\s*$/;

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

	for (let i = cursorLine; i >= 0; i--) {
		if (TDSL_FENCE_OPEN_RE.test(lines[i] ?? "")) {
			openLine = i;
			break;
		}
	}

	if (openLine === -1 || cursorLine <= openLine) {
		return { status: "not-in-block" };
	}

	for (let i = openLine + 1; i < lines.length; i++) {
		if (FENCE_CLOSE_RE.test(lines[i] ?? "")) {
			if (cursorLine >= i) return { status: "not-in-block" };
			return { status: "found", range: { openLine, closeLine: i } };
		}
	}

	return { status: "missing-close" };
}
