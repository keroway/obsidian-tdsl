export interface TdslFenceRange {
	openLine: number;
	closeLine: number;
	/**
	 * The nesting prefix captured from the opening fence line (e.g. `"> "` for
	 * a callout, `"  "` for an indented list item, `""` for a top-level
	 * block). Body lines repeat this prefix in Markdown source; callers that
	 * feed the body to the WASM parser must strip it first and restore it
	 * afterwards (see `extractFenceBody` / `planFenceTransform` in utils.ts).
	 */
	prefix: string;
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

/** Splits a nesting prefix into its blockquote markers and whitespace width. */
function splitPrefix(prefix: string): { quotes: string; indent: number } {
	const quotes = prefix.replace(/[ \t]/g, "");
	return { quotes, indent: prefix.length - quotes.length };
}

/**
 * Same container (identical `>` markers) and, per CommonMark, a close fence
 * may be indented up to 3 spaces deeper than the open fence. A shallower
 * close fence leaves the container, so it does not pair (one column of slack
 * inside a blockquote covers the optional space after `>`).
 */
function samePrefixContainer(open: Fence, candidate: Fence): boolean {
	if (candidate.prefix === open.prefix) return true;
	const o = splitPrefix(open.prefix);
	const c = splitPrefix(candidate.prefix);
	if (o.quotes !== c.quotes) return false;
	const slack = o.quotes === "" ? 0 : 1;
	return c.indent >= o.indent - slack && c.indent <= o.indent + 3;
}

/** A fence line only closes `open` when it repeats it with no info string. */
function closes(open: Fence, candidate: Fence): boolean {
	return (
		candidate.info === "" &&
		samePrefixContainer(open, candidate) &&
		candidate.char === open.char &&
		candidate.length >= open.length
	);
}

/** Number of leading blockquote markers (`>`) on a line. */
function quoteDepth(line: string): number {
	const m = /^[ \t]*(?:>[ \t]*)*/.exec(line);
	return (m?.[0].match(/>/g) ?? []).length;
}

/**
 * Scans forward from the open fence at `openLine` for its close fence.
 *
 * `end` is the exclusive end of the block's extent. A fence inside a blockquote
 * cannot outlive it: the first line with fewer `>` markers leaves the container
 * and terminates the block even without a close fence (CommonMark). Without
 * this, an unclosed quoted fence would swallow every later block. Top-level
 * and indented fences have no such boundary, so they run to the document end.
 */
function findClose(
	lines: readonly string[],
	openLine: number,
	open: Fence,
): { closeLine: number; end: number } {
	const depth = quoteDepth(lines[openLine] ?? "");
	for (let j = openLine + 1; j < lines.length; j++) {
		const line = lines[j] ?? "";
		if (depth > 0 && quoteDepth(line) < depth) {
			return { closeLine: -1, end: j };
		}
		const candidate = parseFence(line);
		if (candidate && closes(open, candidate)) {
			return { closeLine: j, end: j + 1 };
		}
	}
	return { closeLine: -1, end: lines.length };
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

		const { closeLine, end } = findClose(lines, i, open);

		// Only the body lines of a tdsl block count — neither the fence markers
		// themselves nor another language's block do.
		const cursorInBody =
			cursorLine > i &&
			(closeLine === -1 ? cursorLine < end : cursorLine < closeLine);
		if (isTdsl(open) && cursorInBody) {
			return closeLine === -1
				? { status: "missing-close" }
				: {
						status: "found",
						range: { openLine: i, closeLine, prefix: open.prefix },
					};
		}

		// An unclosed block runs to the end of its container; resume scanning
		// after it (at the document end this finishes the loop).
		i = end - 1;
	}

	return { status: "not-in-block" };
}

/**
 * Lists every *closed* `tdsl` fenced code block in the document, as
 * `{ openLine, closeLine }` pairs (same 0-indexed, half-open-body convention
 * as `findTdslFenceAtCursor`'s `found` result).
 *
 * Unlike `findTdslFenceAtCursor`, an unclosed trailing tdsl block is silently
 * omitted rather than reported as an error: this function feeds the editor
 * syntax-highlighting extension, which has nothing useful to highlight (or
 * decorate) without a close fence, and no cursor position to report a
 * `missing-close` diagnostic against.
 */
export function listTdslFenceRanges(
	lines: readonly string[],
): TdslFenceRange[] {
	const ranges: TdslFenceRange[] = [];

	for (let i = 0; i < lines.length; i++) {
		const open = parseFence(lines[i] ?? "");
		if (!open) continue;

		const { closeLine, end } = findClose(lines, i, open);

		if (closeLine !== -1 && isTdsl(open))
			ranges.push({ openLine: i, closeLine, prefix: open.prefix });
		i = end - 1;
	}

	return ranges;
}
