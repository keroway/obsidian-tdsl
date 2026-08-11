import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { highlightTree, tagHighlighter, tags } from "@lezer/highlight";
import { listTdslFenceRanges } from "./fence";
import { tdslLanguage } from "./tdsl-language";

/**
 * Maps `tdslLanguage`'s `tokenTable` tags (see src/tdsl-language.ts) to CSS
 * classes. Colours are assigned in styles.css.
 */
const TDSL_HIGHLIGHTER = tagHighlighter([
	{ tag: tags.keyword, class: "tdsl-tok-keyword" },
	{ tag: tags.definitionKeyword, class: "tdsl-tok-definition-keyword" },
	{ tag: tags.modifier, class: "tdsl-tok-modifier" },
	{ tag: tags.string, class: "tdsl-tok-string" },
	{ tag: tags.number, class: "tdsl-tok-number" },
	{ tag: tags.atom, class: "tdsl-tok-atom" },
	{ tag: tags.lineComment, class: "tdsl-tok-comment" },
	{ tag: tags.blockComment, class: "tdsl-tok-comment" },
	// `//! key: value` directive comments (src/tdsl-language.ts) get their own
	// class so they read as distinct from a plain `//` comment (issue #176).
	{ tag: tags.meta, class: "tdsl-tok-directive" },
	{ tag: tags.punctuation, class: "tdsl-tok-punctuation" },
	{ tag: tags.special(tags.variableName), class: "tdsl-tok-special" },
]);

/**
 * Caps the *total* synchronous parse time across every visible block in one
 * `buildDecorations()` call, in milliseconds — not a per-block budget. A note
 * can have many visible tdsl blocks at once, and a fixed per-block timeout
 * would let their worst-case parse times add up into a stall proportional to
 * block count; this instead shrinks each remaining block's budget as the
 * total is spent, and stops parsing further blocks once it runs out (they
 * pick up highlighting on the next docChanged/viewportChanged pass).
 */
export const TOTAL_PARSE_BUDGET_MS = 50;

/**
 * Remaining share of `TOTAL_PARSE_BUDGET_MS` after `elapsedMs` has been spent.
 * A value `<= 0` means the caller must stop parsing further blocks.
 *
 * Split out of `buildDecorations()` so it can be tested without an
 * `EditorView` (#191). Breaking this calculation does not throw — it only
 * makes highlighting occasionally lag — so it needs a test of its own.
 */
export function remainingParseBudgetMs(elapsedMs: number): number {
	return TOTAL_PARSE_BUDGET_MS - elapsedMs;
}

/**
 * Body line range of a fence, converting `listTdslFenceRanges()`'s 0-indexed
 * `lines` positions to CodeMirror's 1-indexed line numbers.
 *
 * Returns null when the fence has no body (the open and close fences are
 * adjacent), which the caller must skip rather than parse.
 *
 * Split out for testing (#191): an off-by-one here either highlights the
 * fence markers themselves or drops the body's first line, and neither
 * raises an error.
 */
export function fenceBodyLineRange(
	openLine: number,
	closeLine: number,
): { startLineNo: number; endLineNo: number } | null {
	const startLineNo = openLine + 2;
	const endLineNo = closeLine;
	if (startLineNo > endLineNo) return null;
	return { startLineNo, endLineNo };
}

/**
 * Whether `[bodyFrom, bodyTo]` overlaps any of the editor's visible ranges.
 *
 * Split out for testing (#191): if this ever returned true unconditionally the
 * plugin would still render correctly and merely parse off-screen blocks, so
 * only a test can catch the regression.
 */
export function intersectsVisibleRanges(
	bodyFrom: number,
	bodyTo: number,
	ranges: readonly { from: number; to: number }[],
): boolean {
	return ranges.some((r) => bodyFrom <= r.to && bodyTo >= r.from);
}

/**
 * Highlights one tdsl block's body (`[bodyFrom, bodyTo)` in the *host*
 * document's coordinates) by parsing it as an isolated document.
 *
 * Obsidian exposes no API to register a codeblock language with the editor
 * (unlike `registerMarkdownCodeBlockProcessor`, which only affects the read
 * view), so `tdslLanguage` is never the Markdown document's own language.
 * Instead each block gets its own throwaway `EditorState` — this is also why
 * cross-block `StreamLanguage` state (`TdslState.inBlockComment`) never
 * leaks between blocks: `EditorState.create` always starts from
 * `tdslLanguage`'s `startState()`, same as a fresh document would.
 *
 * Returns false (having highlighted nothing) when the block wasn't parsed
 * within `budgetMs`, so the caller can stop spending the shared budget on
 * further blocks.
 */
function highlightBlock(
	sourceView: EditorView,
	builder: RangeSetBuilder<Decoration>,
	bodyFrom: number,
	bodyTo: number,
	budgetMs: number,
): boolean {
	if (bodyFrom >= bodyTo) return true;
	const text = sourceView.state.sliceDoc(bodyFrom, bodyTo);
	const blockState = EditorState.create({
		doc: text,
		extensions: [tdslLanguage],
	});
	const tree = ensureSyntaxTree(blockState, text.length, budgetMs);
	if (!tree) return false;

	highlightTree(tree, TDSL_HIGHLIGHTER, (from, to, classes) => {
		builder.add(
			bodyFrom + from,
			bodyFrom + to,
			Decoration.mark({ class: classes }),
		);
	});
	return true;
}

/**
 * Finds every tdsl fence in the document and highlights only the blocks that
 * intersect `view.visibleRanges`, so an off-screen block in a long note never
 * costs a parse. Recomputed on `docChanged` / `viewportChanged` (see the
 * ViewPlugin below) rather than on every update.
 */
function buildDecorations(view: EditorView): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const doc = view.state.doc;
	const lines: string[] = [];
	for (let i = 1; i <= doc.lines; i++) lines.push(doc.line(i).text);

	const start = performance.now();
	for (const { openLine, closeLine } of listTdslFenceRanges(lines)) {
		const body = fenceBodyLineRange(openLine, closeLine);
		if (body === null) continue;

		const bodyFrom = doc.line(body.startLineNo).from;
		const bodyTo = doc.line(body.endLineNo).to;

		if (!intersectsVisibleRanges(bodyFrom, bodyTo, view.visibleRanges)) {
			continue;
		}

		const remainingBudget = remainingParseBudgetMs(performance.now() - start);
		if (remainingBudget <= 0) break;
		highlightBlock(view, builder, bodyFrom, bodyTo, remainingBudget);
	}

	return builder.finish();
}

/**
 * Colours tdsl fenced-code-block bodies in both Live Preview and Source mode.
 *
 * Registered via `Plugin.registerEditorExtension()` in main.ts, whose
 * automatic teardown on plugin unload is why this file needs no explicit
 * cleanup of its own.
 */
export const tdslEditorHighlight = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}

		update(update: ViewUpdate): void {
			if (update.docChanged || update.viewportChanged) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{
		decorations: (v) => v.decorations,
	},
);
