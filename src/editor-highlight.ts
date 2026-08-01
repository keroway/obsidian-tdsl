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
 * classes. Colours are assigned in styles.css; palette refinement across
 * light/dark/print/forced-colors is issue #176 — this only decides the
 * class names.
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
	{ tag: tags.punctuation, class: "tdsl-tok-punctuation" },
	{ tag: tags.special(tags.variableName), class: "tdsl-tok-special" },
]);

/** Caps how long a single block's synchronous parse may run, in milliseconds. */
const PARSE_TIMEOUT_MS = 50;

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
 */
function highlightBlock(
	sourceView: EditorView,
	builder: RangeSetBuilder<Decoration>,
	bodyFrom: number,
	bodyTo: number,
): void {
	if (bodyFrom >= bodyTo) return;
	const text = sourceView.state.sliceDoc(bodyFrom, bodyTo);
	const blockState = EditorState.create({
		doc: text,
		extensions: [tdslLanguage],
	});
	const tree = ensureSyntaxTree(blockState, text.length, PARSE_TIMEOUT_MS);
	if (!tree) return;

	highlightTree(tree, TDSL_HIGHLIGHTER, (from, to, classes) => {
		builder.add(
			bodyFrom + from,
			bodyFrom + to,
			Decoration.mark({ class: classes }),
		);
	});
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

	for (const { openLine, closeLine } of listTdslFenceRanges(lines)) {
		// 0-indexed `lines` positions -> 1-indexed CodeMirror line numbers.
		// Body is empty when the open and close fences are adjacent.
		const bodyStartLineNo = openLine + 2;
		const bodyEndLineNo = closeLine;
		if (bodyStartLineNo > bodyEndLineNo) continue;

		const bodyFrom = doc.line(bodyStartLineNo).from;
		const bodyTo = doc.line(bodyEndLineNo).to;

		const inViewport = view.visibleRanges.some(
			(r) => bodyFrom <= r.to && bodyTo >= r.from,
		);
		if (!inViewport) continue;

		highlightBlock(view, builder, bodyFrom, bodyTo);
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
