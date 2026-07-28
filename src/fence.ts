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
//
// The fence marker itself follows CommonMark: three or more backticks *or*
// three or more tildes. Obsidian's code block processor accepts every one of
// these variants, so the format command has to recognize the same set —
// otherwise a block renders fine but cannot be formatted.
//
// Capture groups: 1 = nesting prefix, 2 = fence marker, 3 = info string after
// `tdsl` (an optional extra info string, which is ignored).
const TDSL_FENCE_OPEN_RE =
	/^([ \t]*(?:>[ \t]*)*)(`{3,}|~{3,})[ \t]*tdsl(?:[ \t](.*))?[ \t]*$/;
const FENCE_CLOSE_RE = /^([ \t]*(?:>[ \t]*)*)(`{3,}|~{3,})[ \t]*$/;

interface FenceMarker {
	prefix: string;
	/** "`" or "~" — open and close must use the same character. */
	char: string;
	/** Number of marker characters; a close fence needs at least as many. */
	length: number;
}

function parseOpenFence(line: string): FenceMarker | null {
	const m = TDSL_FENCE_OPEN_RE.exec(line);
	if (!m) return null;
	const marker = m[2] ?? "";
	const info = m[3] ?? "";
	// CommonMark: the info string of a backtick fence may not contain a
	// backtick (that would make it inline code, not a fence).
	if (marker.startsWith("`") && info.includes("`")) return null;
	return { prefix: m[1] ?? "", char: marker[0] ?? "", length: marker.length };
}

function parseCloseFence(line: string): FenceMarker | null {
	const m = FENCE_CLOSE_RE.exec(line);
	if (!m) return null;
	const marker = m[2] ?? "";
	return { prefix: m[1] ?? "", char: marker[0] ?? "", length: marker.length };
}

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
	let open: FenceMarker | null = null;

	for (let i = cursorLine; i >= 0; i--) {
		const marker = parseOpenFence(lines[i] ?? "");
		if (marker) {
			openLine = i;
			open = marker;
			break;
		}
	}

	if (open === null || openLine === -1 || cursorLine <= openLine) {
		return { status: "not-in-block" };
	}

	for (let i = openLine + 1; i < lines.length; i++) {
		const close = parseCloseFence(lines[i] ?? "");
		// Only a close fence sharing the same nesting prefix as the open fence
		// (e.g. both inside the same callout / list indentation) can pair with
		// it. A differently-nested fence is skipped and the search continues.
		// Per CommonMark the close fence must also use the same character and
		// be at least as long as the open fence, so a ``` line inside a ````
		// block stays body text.
		if (
			close &&
			close.prefix === open.prefix &&
			close.char === open.char &&
			close.length >= open.length
		) {
			if (cursorLine >= i) return { status: "not-in-block" };
			return { status: "found", range: { openLine, closeLine: i } };
		}
	}

	return { status: "missing-close" };
}
