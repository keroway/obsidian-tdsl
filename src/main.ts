import init, {
	check_source,
	format_source,
	JsRenderOptions,
	lint_fix_source,
	lint_source,
	render_svg_from_source_with_options,
} from "@keroway/tdsl-wasm";
// esbuild inlines the WASM binary via `loader: { '.wasm': 'binary' }`
// so init() receives a BufferSource directly instead of fetching a URL.
import wasmBytes from "@keroway/tdsl-wasm/tdsl_wasm_bg.wasm";
import {
	type App,
	type Editor,
	type MarkdownPostProcessorContext,
	MarkdownRenderChild,
	MarkdownView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	SuggestModal,
	type TextComponent,
} from "obsidian";
import { findTdslFenceAtCursor } from "./fence";
import { rerenderMarkdownPreviewView } from "./obsidian-rerender";
import {
	renderTemplateSnippet,
	TIMELINE_TEMPLATES,
	type TimelineTemplate,
} from "./templates";
import {
	commitScaleInput,
	DEFAULT_SETTINGS,
	type DiagnosticParts,
	debounce,
	diagnosticParts,
	ensureTrailingNewline,
	extractFenceBody,
	extractTimelineTitle,
	fenceBodyRange,
	filterErrors,
	filterInfos,
	filterWarnings,
	hasWikidataImport,
	isRecognizedLaneHeightInput,
	lintIssueParts,
	parseDiagnostics,
	parseLaneHeightSetting,
	parseLintIssues,
	parseRenderDirectives,
	resolveEditorLine,
	resolveRenderOptions,
	SYNTAX_REFERENCE_URL,
	type TdslSettings,
} from "./utils";
import { createWasmInitializer } from "./wasm-init";

const ensureWasm = createWasmInitializer(async () => {
	await init(wasmBytes as unknown as Parameters<typeof init>[0]);
});

class TdslPreview extends MarkdownRenderChild {
	private readonly source: string;
	private readonly settings: TdslSettings;
	private readonly app: App;
	private readonly ctx: MarkdownPostProcessorContext;

	constructor(
		container: HTMLElement,
		source: string,
		settings: TdslSettings,
		app: App,
		ctx: MarkdownPostProcessorContext,
	) {
		super(container);
		this.app = app;
		this.ctx = ctx;
		this.source = source;
		this.settings = settings;
	}

	async onload(): Promise<void> {
		const wrapper = this.containerEl.createDiv({ cls: "tdsl-preview" });

		try {
			await ensureWasm();

			// check_source returns JSON: [{severity, message, line, col}]
			const diagnosticsJson = check_source(this.source);
			const diagnostics = parseDiagnostics(diagnosticsJson);
			const errors = filterErrors(diagnostics);
			const warnings = filterWarnings(diagnostics);
			const infos = filterInfos(diagnostics);

			if (errors.length > 0) {
				this.showErrorDiagnostics(wrapper, errors);
				return;
			}

			// Effective options = per-block `//!` directives over plugin settings.
			// A fresh JsRenderOptions is required per call: the WASM frees it after use.
			const directives = parseRenderDirectives(this.source);
			const r = resolveRenderOptions(directives, this.settings);
			// `fit` opts the block into shrink-to-note-width (vs. natural size +
			// horizontal scroll). The renderer still uses auto scale.
			if (r.fit) wrapper.addClass("tdsl-fit");
			const svg = renderSvg(this.source, r);

			// Parse as SVG/XML — avoids innerHTML and does not execute scripts or event handlers.
			const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
			const parseError = doc.querySelector("parsererror");
			if (parseError) {
				this.showErrors(wrapper, [
					"Internal error: renderer returned invalid SVG",
				]);
				return;
			}
			// Attach accessibility attributes before adopting the node into the document.
			// Using setAttribute / createElementNS avoids innerHTML and keeps the
			// XSS-safe invariant intact.
			const root = doc.documentElement;
			applyRootAccessibility(
				doc,
				root,
				extractTimelineTitle(this.source) ?? "Timeline",
			);
			wrapper.appendChild(document.adoptNode(root));

			// Warn when import wikidata blocks are silently skipped (no network in browser).
			if (hasWikidataImport(this.source)) {
				const notice = wrapper.createDiv({ cls: "tdsl-notice" });
				notice.createSpan({ text: "⚠ " });
				notice.createSpan({
					text: "`import wikidata` is not executed inside Obsidian. Only static items are shown.",
				});
			}

			// Show non-blocking warning/info diagnostics below the SVG.
			for (const d of warnings) {
				this.showNotice(wrapper, "warning", d);
			}
			for (const d of infos) {
				this.showNotice(wrapper, "info", d);
			}

			// Run lint_source and display issues below the SVG.
			// lint_source never throws (it returns a parse_error entry on failure),
			// so this is safe to run after a successful render.
			try {
				const lintJson = lint_source(this.source);
				const lintIssues = parseLintIssues(lintJson).filter(
					(i) => i.code !== "parse_error",
				);
				if (lintIssues.length > 0) {
					const lintBanner = wrapper.createDiv({
						cls: "tdsl-lint-banner",
					});
					for (const issue of lintIssues) {
						const row = lintBanner.createDiv({
							cls: "tdsl-notice tdsl-notice-warning",
						});
						row.createSpan({ text: "⚠ " });
						// Same pieces formatLintIssues joins into a string, kept apart so
						// the `Line N` segment can be its own clickable element.
						this.appendDiagnosticLine(row, lintIssueParts(issue));
					}
				}
			} catch {
				// Lint is non-critical: silently ignore failures.
			}
		} catch (e) {
			this.showErrors(wrapper, [String(e)]);
		}
	}

	/**
	 * Moves the cursor to the note line a diagnostic points at.
	 *
	 * Only acts when the active Markdown view is the note this block lives in:
	 * the same rendered block can sit in a background pane or an embed, and
	 * jumping the *other* note's cursor would be worse than doing nothing.
	 */
	private jumpToBlockLine(blockLine: number): void {
		const section = this.ctx.getSectionInfo(this.containerEl);
		if (!section) return;

		const line = resolveEditorLine(section.lineStart, blockLine);
		if (line === null) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== this.ctx.sourcePath) return;

		const pos = { line, ch: 0 };
		view.editor.setCursor(pos);
		view.editor.scrollIntoView({ from: pos, to: pos }, true);
		view.editor.focus();
	}

	/**
	 * Renders `Line N` as a clickable element and the rest as plain text.
	 *
	 * Diagnostics arrive with the line number already separated from the
	 * message, so the label is built here rather than parsed back out of a
	 * formatted string.
	 */
	private appendDiagnosticLine(
		parent: HTMLElement,
		parts: DiagnosticParts,
	): void {
		const { prefix, line: blockLine, text } = parts;
		if (prefix) parent.createSpan({ text: prefix });
		if (blockLine > 0) {
			const link = parent.createSpan({
				text: `Line ${blockLine}`,
				cls: "tdsl-line-link",
				attr: { role: "button", tabindex: "0" },
			});
			link.addEventListener("click", () => this.jumpToBlockLine(blockLine));
			link.addEventListener("keydown", (ev: KeyboardEvent) => {
				if (ev.key === "Enter" || ev.key === " ") {
					ev.preventDefault();
					this.jumpToBlockLine(blockLine);
				}
			});
			parent.createSpan({ text: `: ${text}` });
		} else {
			parent.createSpan({ text });
		}
	}

	/** Compile errors, with each `Line N` wired up to jump into the editor. */
	private showErrorDiagnostics(
		container: HTMLElement,
		errors: import("./utils").Diagnostic[],
	): void {
		// <pre> accepts phrasing content, so the clickable spans live inside it
		// and the existing .tdsl-error styling (including white-space: pre-wrap)
		// still applies. createEl/createSpan keep this off innerHTML.
		const pre = container.createEl("pre", { cls: "tdsl-error" });
		pre.createSpan({ text: "Timeline DSL error:\n" });
		errors.forEach((e, i) => {
			this.appendDiagnosticLine(pre, diagnosticParts(e));
			if (i < errors.length - 1) pre.createSpan({ text: "\n" });
		});
		this.appendSyntaxReference(container);
	}

	private showErrors(container: HTMLElement, messages: string[]): void {
		container.createEl("pre", {
			text: `Timeline DSL error:\n${messages.join("\n")}`,
			cls: "tdsl-error",
		});
		this.appendSyntaxReference(container);
	}

	/**
	 * Sibling of the <pre>: the grammar reference is the first thing to reach
	 * for on a syntax error (trailing `;` rules, `start..end` vs `start to end`).
	 */
	private appendSyntaxReference(container: HTMLElement): void {
		container.createEl("a", {
			text: "Syntax reference →",
			cls: "tdsl-error-help",
			href: SYNTAX_REFERENCE_URL,
			attr: { target: "_blank", rel: "noopener noreferrer" },
		});
	}

	private showNotice(
		container: HTMLElement,
		kind: "warning" | "info",
		diag: import("./utils").Diagnostic,
	): void {
		const icon = kind === "warning" ? "⚠ " : "ℹ ";
		const notice = container.createDiv({
			cls: `tdsl-notice tdsl-notice-${kind}`,
		});
		notice.createSpan({ text: icon });
		this.appendDiagnosticLine(notice, diagnosticParts(diag));
	}
}

/**
 * Renders `source` to an SVG string, guaranteeing the `JsRenderOptions`
 * instance is released on every path.
 *
 * A fresh JsRenderOptions is required per call: `render_svg_from_source_with_options`
 * takes ownership of it. wasm-bindgen transfers that ownership by calling
 * `__destroy_into_raw()` *before* entering Rust, so the instance is consumed
 * even when the render itself throws — freeing it again afterwards would be a
 * double free. Hence the flag: `free()` runs only on the paths that throw
 * before ownership moves (e.g. an option setter rejecting a value), which are
 * exactly the paths that would otherwise leak the instance on the WASM heap.
 */
function renderSvg(
	source: string,
	r: ReturnType<typeof resolveRenderOptions>,
): string {
	const opts = new JsRenderOptions();
	let ownedByJs = true;
	try {
		if (r.grid) opts.grid = r.grid;
		if (r.theme) opts.theme = r.theme;
		if (r.orientation) opts.orientation = r.orientation;
		if (r.events !== undefined) opts.show_event_labels = r.events;
		// show_table / show_legend render natively into the SVG (upstream 1.23.0+).
		if (r.table !== undefined) opts.show_table = r.table;
		if (r.legend !== undefined) opts.show_legend = r.legend;
		if (r.laneHeight > 0) opts.lane_height = r.laneHeight;
		ownedByJs = false;
		return render_svg_from_source_with_options(source, r.scale, opts);
	} finally {
		if (ownedByJs) opts.free();
	}
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Labels the root `<svg>` of a rendered timeline for assistive technology.
 *
 * `role="img"` must NOT be used here: it is a children-presentational role, so
 * it would strip every per-item `role="group"` / `aria-label` / `<title>` the
 * renderer emits from the accessibility tree — while the items keep their
 * `tabindex="0"` and stay focusable. The result is focus stops that read as
 * nothing. `role="group"` keeps the diagram labelled as a whole and leaves the
 * descendants exposed.
 *
 * Attributes the renderer already provides win: upstream knows the diagram's
 * structure better than this plugin does.
 */
function applyRootAccessibility(
	doc: Document,
	root: Element,
	label: string,
): void {
	if (!root.hasAttribute("role")) root.setAttribute("role", "group");
	const effectiveLabel = root.getAttribute("aria-label") ?? label;
	if (!root.hasAttribute("aria-label"))
		root.setAttribute("aria-label", effectiveLabel);

	// A root <title> gives the same description to tools that surface the SVG
	// standalone (tooltips, exported files) rather than reading aria-label.
	const firstChild = root.firstElementChild;
	if (firstChild?.tagName.toLowerCase() === "title") return;
	const titleEl = doc.createElementNS(SVG_NS, "title");
	titleEl.textContent = effectiveLabel;
	root.insertBefore(titleEl, root.firstChild);
}

export default class TimelineDslPlugin extends Plugin {
	settings: TdslSettings = DEFAULT_SETTINGS;
	// Kept so onunload() can cancel the tab's pending debounced saves.
	private settingTab: TdslSettingTab | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.settingTab = new TdslSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);
		this.registerMarkdownCodeBlockProcessor("tdsl", (_source, el, ctx) => {
			ctx.addChild(new TdslPreview(el, _source, this.settings, this.app, ctx));
		});

		this.addCommand({
			id: "format-tdsl-block",
			name: "Format current tdsl block",
			editorCallback: async (editor: Editor) => {
				await ensureWasm();
				formatCurrentBlock(editor);
			},
		});

		this.addCommand({
			id: "lint-fix-tdsl-block",
			name: "Fix lint issues in current tdsl block",
			editorCallback: async (editor: Editor) => {
				await ensureWasm();
				lintFixCurrentBlock(editor);
			},
		});

		this.addCommand({
			id: "insert-timeline-template",
			name: "Insert timeline template",
			// No ensureWasm(): this only writes text into the note. The block
			// renders (and initialises WASM) through the code-block processor.
			editorCallback: (editor: Editor) => {
				new TemplateSuggestModal(this.app, editor).open();
			},
		});
	}

	onunload(): void {
		// A keystroke in the settings tab arms a 400ms timer; without this the
		// timer can still fire after the plugin is disabled and call saveData()
		// / iterateAllLeaves() on a dead plugin instance. Pending edits are
		// dropped rather than flushed: writing settings during teardown is the
		// worse failure mode, and closing the tab (hide()) already flushes them.
		this.settingTab?.cancelPendingSaves();
		this.settingTab = null;
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Re-render all open Markdown previews so the new settings take effect
		// immediately without requiring the user to reopen the note.
		this.app.workspace.iterateAllLeaves((leaf) => {
			rerenderMarkdownPreviewView(leaf.view);
		});
	}
}

class TdslSettingTab extends PluginSettingTab {
	private readonly plugin: TimelineDslPlugin;
	// Debounces saveSettings() for free-text inputs (scale / lane_height),
	// since it re-renders every open Markdown preview and would otherwise
	// fire on every keystroke. Created once so the timer survives across
	// display() calls (each display() re-renders the tab's DOM).
	private readonly debouncedSave = debounce(() => {
		void this.plugin.saveSettings();
	}, 400);
	// The scale field currently on screen. display() rebuilds the tab's DOM,
	// so the debounce below must look the component up at fire time rather
	// than capture the one that was live when the keystroke happened.
	private scaleInput: TextComponent | null = null;
	// The scale field accepts multi-character words (`auto` / `fit`), so its
	// validation must not run per keystroke: typing `f` of `fit` would look
	// invalid and rewrite the field before the word can be finished. Parsing,
	// the correction notice and the save are therefore all deferred until
	// typing stops.
	private readonly debouncedScaleCommit = debounce((raw: string) => {
		const { value, correction } = commitScaleInput(raw);
		this.plugin.settings.scale = value;
		// If the raw input could not be interpreted as auto/fit/a positive
		// number, it silently falls back to a default — reflect that in the
		// field so the displayed value never diverges from what was saved.
		if (correction) {
			this.scaleInput?.setValue(correction.fieldValue);
			new Notice(correction.notice);
		}
		void this.plugin.saveSettings();
	}, 400);

	constructor(app: App, plugin: TimelineDslPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Drops both pending debounced saves. Called from the plugin's onunload()
	 * so no timer outlives the plugin instance.
	 */
	cancelPendingSaves(): void {
		this.debouncedSave.cancel();
		this.debouncedScaleCommit.cancel();
	}

	/**
	 * Closing the settings tab commits whatever was typed last instead of
	 * waiting out the remaining debounce window — otherwise a value typed and
	 * immediately followed by closing the tab could be applied at a surprising
	 * moment (or not at all, if unload follows).
	 */
	hide(): void {
		this.debouncedSave.flush();
		this.debouncedScaleCommit.flush();
		super.hide();
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "These are the defaults. Per-block `//!` directives always take precedence.",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("Default theme")
			.setDesc(
				"`auto` follows Obsidian's light/dark mode (rendered via plugin CSS)",
			)
			.addDropdown((d) =>
				d
					.addOptions({
						auto: "Auto (follow app theme)",
						default: "default",
						dark: "dark",
						print: "print",
						pastel: "pastel",
					})
					.setValue(this.plugin.settings.theme)
					.onChange(async (v) => {
						this.plugin.settings.theme = v as TdslSettings["theme"];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default grid")
			.setDesc("Density of grid lines")
			.addDropdown((d) =>
				d
					.addOptions({
						none: "none",
						decade: "decade",
						year: "year",
						month: "month",
					})
					.setValue(this.plugin.settings.grid)
					.onChange(async (v) => {
						this.plugin.settings.grid = v as TdslSettings["grid"];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default scale")
			.setDesc(
				"`auto` / `fit` / a positive number (px per year). `fit` shrinks to note width (no horizontal scroll).",
			)
			.addText((t) => {
				this.scaleInput = t;
				t.setPlaceholder("auto")
					.setValue(String(this.plugin.settings.scale))
					.onChange((raw) => {
						this.debouncedScaleCommit(raw);
					});
			});

		new Setting(containerEl)
			.setName("Show event labels by default")
			.setDesc("Show labels on event / event_range items")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.events).onChange(async (v) => {
					this.plugin.settings.events = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Default orientation")
			.setDesc(
				"Layout direction. Override per block with `//! orientation: …`.",
			)
			.addDropdown((d) =>
				d
					.addOptions({ horizontal: "horizontal", vertical: "vertical" })
					.setValue(this.plugin.settings.orientation)
					.onChange(async (v) => {
						this.plugin.settings.orientation = v as TdslSettings["orientation"];
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Show table by default")
			.setDesc("Render the accompanying item-listing table inside the SVG")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.table).onChange(async (v) => {
					this.plugin.settings.table = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Show legend by default")
			.setDesc("Render a static legend panel showing lane and tag colours")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.legend).onChange(async (v) => {
					this.plugin.settings.legend = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Default lane height")
			.setDesc(
				"Positive integer (px). Empty or `0` uses the renderer default (60 px). Override per block with `//! lane_height: N`.",
			)
			.addText((t) =>
				t
					.setPlaceholder("0")
					.setValue(
						this.plugin.settings.laneHeight > 0
							? String(this.plugin.settings.laneHeight)
							: "",
					)
					.onChange((raw) => {
						const parsed = parseLaneHeightSetting(raw);
						this.plugin.settings.laneHeight = parsed;
						this.debouncedSave();
						if (!isRecognizedLaneHeightInput(raw)) {
							t.setValue(parsed > 0 ? String(parsed) : "");
							new Notice(
								`Timeline DSL: "${raw}" is not a valid lane height. Reset to "${
									parsed > 0 ? parsed : "renderer default"
								}".`,
							);
						}
					}),
			);
	}
}

/**
 * Finds the \`\`\`tdsl ... \`\`\` fence surrounding the cursor in `editor` and
 * replaces its body with the output of `format_source`.
 *
 * - Locates the opening \`\`\`tdsl line at or before the cursor and the closing
 *   \`\`\` line after it.
 * - Calls format_source on the body; on parse failure shows a Notice with the
 *   error message and leaves the document unchanged.
 * - Uses Editor.replaceRange so the edit is undoable.
 */
/**
 * Picker for the "Insert timeline template" command.
 *
 * Deliberately thin: the template data and the fenced snippet it inserts live
 * in src/templates.ts as pure functions, because Vitest runs with
 * `environment: "node"` and cannot instantiate an Obsidian modal. Everything
 * worth asserting is therefore testable without booting Obsidian.
 */
class TemplateSuggestModal extends SuggestModal<TimelineTemplate> {
	private readonly editor: Editor;

	constructor(app: App, editor: Editor) {
		super(app);
		this.editor = editor;
		this.setPlaceholder("Pick a timeline template…");
	}

	getSuggestions(query: string): TimelineTemplate[] {
		const q = query.toLowerCase().trim();
		if (!q) return [...TIMELINE_TEMPLATES];
		return TIMELINE_TEMPLATES.filter(
			(t) =>
				t.name.toLowerCase().includes(q) ||
				t.description.toLowerCase().includes(q),
		);
	}

	renderSuggestion(template: TimelineTemplate, el: HTMLElement): void {
		el.createDiv({ text: template.name });
		el.createDiv({
			text: template.description,
			cls: "tdsl-template-suggestion-desc",
		});
	}

	onChooseSuggestion(template: TimelineTemplate): void {
		// replaceRange at the cursor keeps the insert undoable, matching how
		// formatCurrentBlock edits the document.
		this.editor.replaceRange(
			renderTemplateSnippet(template),
			this.editor.getCursor(),
		);
		new Notice(`✔ Inserted the "${template.name}" template.`);
	}
}

/**
 * Runs `transform` over the body of the tdsl block under the cursor and writes
 * the result back.
 *
 * Shared by the format and lint-fix commands: both locate the same fence, both
 * call a WASM function that throws a string on parse failure, and both must
 * write through Editor.replaceRange so the edit lands on the undo stack.
 *
 * `errorLabel` names the operation in the failure Notice; `onApplied` reports
 * success, and receives whether the transform actually changed anything so a
 * caller can distinguish "fixed" from "nothing to do".
 */
function transformCurrentBlock(
	editor: Editor,
	transform: (body: string) => string,
	errorLabel: string,
	onApplied: (changed: boolean) => void,
): void {
	const cursor = editor.getCursor();
	const lines: string[] = [];
	for (let i = 0; i < editor.lineCount(); i++) {
		lines.push(editor.getLine(i));
	}

	const fence = findTdslFenceAtCursor(lines, cursor.line);
	if (fence.status === "not-in-block") {
		new Notice("Timeline DSL: Cursor is not inside a tdsl block.");
		return;
	}
	if (fence.status === "missing-close") {
		new Notice(
			"Timeline DSL: Could not find the closing fence of the tdsl block.",
		);
		return;
	}
	const { openLine, closeLine } = fence.range;

	const body = extractFenceBody(lines, openLine, closeLine);

	// The WASM entry points throw a string error on parse failure.
	let result: string;
	try {
		result = transform(body);
	} catch (e) {
		new Notice(`Timeline DSL ${errorLabel} error:\n${String(e)}`);
		return;
	}

	// Skip the write when the transform is a no-op: lint_fix_source returns the
	// source byte-identical if nothing is fixable, and replacing text with itself
	// would still push a pointless entry onto the undo stack.
	const next = ensureTrailingNewline(result);
	if (next === body) {
		onApplied(false);
		return;
	}

	const { from, to } = fenceBodyRange(openLine, closeLine);
	editor.replaceRange(next, from, to);
	onApplied(true);
}

function formatCurrentBlock(editor: Editor): void {
	transformCurrentBlock(editor, format_source, "format", () => {
		new Notice("✔ Formatted the Timeline DSL block.");
	});
}

function lintFixCurrentBlock(editor: Editor): void {
	transformCurrentBlock(editor, lint_fix_source, "lint fix", (changed) => {
		// lint_fix_source returns the source unchanged when nothing is fixable,
		// so tell the user which of the two happened rather than claiming a fix.
		new Notice(
			changed
				? "✔ Fixed lint issues in the Timeline DSL block."
				: "Timeline DSL: No automatically fixable lint issues found.",
		);
	});
}
