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
// A list item marker (`- `, `1. `) may directly precede the opening fence
// (`- ~~~tdsl`); the fence then starts the item's content. Only the open line
// carries the marker — body and close lines are indented under it.
//
// Capture groups: 1 = nesting prefix, 2 = list marker (optional), 3 = fence
// marker, 4 = info string.
const FENCE_RE =
	/^([ \t]*(?:>[ \t]*)*)((?:[-*+]|\d{1,9}[.)])[ \t]+)?(`{3,}|~{3,})[ \t]*(.*)$/;

interface Fence {
	/**
	 * Prefix repeated on body/close lines. A list marker on the open line is
	 * replaced by spaces of the same width (the item's continuation indent).
	 */
	prefix: string;
	/** The open line starts with a list item marker. */
	listMarker: boolean;
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
	const listMarker = m[2] ?? "";
	const marker = m[3] ?? "";
	const info = (m[4] ?? "").trim();
	// CommonMark: the info string of a backtick fence may not contain a
	// backtick (that would make it inline code, not a fence).
	if (marker.startsWith("`") && info.includes("`")) return null;
	return {
		prefix: (m[1] ?? "") + " ".repeat(listMarker.length),
		listMarker: listMarker !== "",
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
	// A top-level open fence indented 0-3 spaces is not inside any container
	// (4+ would be a list/code context), so a close fence may sit at any
	// column from 0 up.
	const slack = o.quotes === "" ? (o.indent <= 3 ? o.indent : 0) : 1;
	return c.indent >= o.indent - slack && c.indent <= o.indent + 3;
}

/**
 * A fence line only closes `open` when it repeats it with no info string. A
 * list marker (`- ~~~`) starts a new list item, so it is body text, never a
 * close fence.
 */
function closes(open: Fence, candidate: Fence): boolean {
	return (
		!candidate.listMarker &&
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

const LIST_MARKER_RE = /^[ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/;

/**
 * Whether the fence at `openLine` (indented `indent` columns, unquoted) sits in
 * a list item: the nearest earlier non-blank line indented less than the fence
 * must be a list item marker line.
 */
function inListItem(
	lines: readonly string[],
	openLine: number,
	indent: number,
): boolean {
	for (let k = openLine - 1; k >= 0; k--) {
		const line = lines[k] ?? "";
		if (line.trim() === "") continue;
		if ((/^[ \t]*/.exec(line)?.[0].length ?? 0) < indent) {
			return LIST_MARKER_RE.test(line);
		}
	}
	return false;
}

/** Columns of leading whitespace; a tab advances to the next multiple of 4. */
function leadingColumns(line: string): number {
	let cols = 0;
	for (const ch of line) {
		if (ch === " ") cols += 1;
		else if (ch === "\t") cols += 4 - (cols % 4);
		else break;
	}
	return cols;
}

/**
 * Parses the line at `index` as a fence *opener*. An unquoted line indented 4+
 * columns outside any list item is an indented code block (CommonMark), so a
 * fence marker there is literal text, not a fence.
 */
function parseOpenFence(lines: readonly string[], index: number): Fence | null {
	const line = lines[index] ?? "";
	const open = parseFence(line);
	if (!open) return null;
	if (
		quoteDepth(line) === 0 &&
		leadingColumns(line) >= 4 &&
		!inListItem(lines, index, /^[ \t]*/.exec(line)?.[0].length ?? 0)
	) {
		return null;
	}
	return open;
}

/**
 * Scans forward from the open fence at `openLine` for its close fence.
 *
 * `end` is the exclusive end of the block's extent. A fence inside a blockquote
 * cannot outlive it: the first line with fewer `>` markers leaves the container
 * and terminates the block even without a close fence (CommonMark). Without
 * this, an unclosed quoted fence would swallow every later block. An indented
 * fence (assumed to be list content) likewise ends at the first non-blank line
 * indented less than it; top-level fences run to the document end.
 */
function findClose(
	lines: readonly string[],
	openLine: number,
	open: Fence,
): { closeLine: number; end: number } {
	const depth = quoteDepth(lines[openLine] ?? "");
	// An unquoted fence indented 2+ columns is taken to sit in a list item
	// (`- ` / `1. ` content): the first non-blank line indented less than the
	// fence leaves the item. 1 column cannot be list content, so it is exempt.
	// A top-level paragraph may also be indented 2-3 columns, so this only
	// applies when a list item actually encloses the fence.
	const fenceIndent = splitPrefix(open.prefix).indent;
	const listIndent =
		depth === 0 && (open.listMarker || inListItem(lines, openLine, fenceIndent))
			? fenceIndent
			: 0;
	for (let j = openLine + 1; j < lines.length; j++) {
		const line = lines[j] ?? "";
		if (depth > 0 && quoteDepth(line) < depth) {
			return { closeLine: -1, end: j };
		}
		// The list boundary is checked before the close fence: a marker outside
		// the item cannot close a fence inside it.
		if (
			listIndent >= 2 &&
			line.trim() !== "" &&
			(/^[ \t]*/.exec(line)?.[0].length ?? 0) < listIndent
		) {
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
		const open = parseOpenFence(lines, i);
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
		const open = parseOpenFence(lines, i);
		if (!open) continue;

		const { closeLine, end } = findClose(lines, i, open);

		if (closeLine !== -1 && isTdsl(open))
			ranges.push({ openLine: i, closeLine, prefix: open.prefix });
		i = end - 1;
	}

	return ranges;
}
