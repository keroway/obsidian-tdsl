export interface TdslFenceRange {
	openLine: number;
	closeLine: number;
}

export type TdslFenceResult =
	| { status: "found"; range: TdslFenceRange }
	| { status: "not-in-block" }
	| { status: "missing-close" };

// Matches any fenced-code-block marker line: an optional run of blockquote
// markers (`>`) and/or leading whitespace, the fence marker itself, and the
// info string. The prefix keeps tdsl blocks nested inside callouts (`> `) or
// indented list items recognizable.
//
// The fence marker follows CommonMark: three or more backticks *or* three or
// more tildes. Obsidian's code block processor accepts every one of these
// variants, so the format command has to recognize the same set — otherwise a
// block renders fine but cannot be formatted.
//
// Capture groups: 1 = nesting prefix, 2 = fence marker, 3 = info string.
const FENCE_RE = /^([ \t]*(?:>[ \t]*)*)(`{3,}|~{3,})[ \t]*(.*)$/;

interface Fence {
	prefix: string;
	/** "`" or "~" — open and close must use the same character. */
	char: string;
	/** Number of marker characters; a close fence needs at least as many. */
	length: number;
	/** Info string after the marker, trimmed. Empty on a close fence. */
	info: string;
}

function parseFence(line: string): Fence | null {
	const m = FENCE_RE.exec(line);
	if (!m) return null;
	const marker = m[2] ?? "";
	const info = (m[3] ?? "").trim();
	// CommonMark: the info string of a backtick fence may not contain a
	// backtick (that would make it inline code, not a fence).
	if (marker.startsWith("`") && info.includes("`")) return null;
	return {
		prefix: m[1] ?? "",
		char: marker[0] ?? "",
		length: marker.length,
		info,
	};
}

/** A fence line only closes `open` when it repeats it with no info string. */
function closes(open: Fence, candidate: Fence): boolean {
	return (
		candidate.info === "" &&
		candidate.prefix === open.prefix &&
		candidate.char === open.char &&
		candidate.length >= open.length
	);
}

/** The info string names this block as tdsl (extra info after it is ignored). */
function isTdsl(fence: Fence): boolean {
	return fence.info === "tdsl" || fence.info.startsWith("tdsl ");
}

/**
 * Finds the `tdsl` fenced code block body that contains `cursorLine`.
 *
 * Blocks are scanned forward from the top of the document rather than backwards
 * from the cursor: a fence line inside an already-open block is body text, not
 * a new block. Searching backwards would mistake the inner ` ```tdsl ` line of
 * a ` ````tdsl ` block for the opening fence and reformat the wrong range.
 *
 * The cursor must be on a body line, not on either fence marker. This prevents
 * the format command from accidentally reformatting a previous block when the
 * cursor is in normal markdown after that block.
 */
export function findTdslFenceAtCursor(
	lines: readonly string[],
	cursorLine: number,
): TdslFenceResult {
	for (let i = 0; i < lines.length; i++) {
		const open = parseFence(lines[i] ?? "");
		if (!open) continue;

		let closeLine = -1;
		for (let j = i + 1; j < lines.length; j++) {
			const candidate = parseFence(lines[j] ?? "");
			if (candidate && closes(open, candidate)) {
				closeLine = j;
				break;
			}
		}

		// Only the body lines of a tdsl block count — neither the fence markers
		// themselves nor another language's block do.
		const cursorInBody =
			cursorLine > i && (closeLine === -1 || cursorLine < closeLine);
		if (isTdsl(open) && cursorInBody) {
			return closeLine === -1
				? { status: "missing-close" }
				: { status: "found", range: { openLine: i, closeLine } };
		}

		// An unclosed block swallows the rest of the document, so there is no
		// later block left to examine.
		if (closeLine === -1) break;
		i = closeLine;
	}

	return { status: "not-in-block" };
}
