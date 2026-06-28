import {
	MarkdownRenderChild,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	type App,
	type Editor,
} from "obsidian";
import init, {
	check_source,
	format_source,
	lint_source,
	render_svg_from_source_with_options,
	render_html_from_source_with_options,
	JsRenderOptions,
} from "@keroway/tdsl-wasm";
// esbuild inlines the WASM binary via `loader: { '.wasm': 'binary' }`
// so init() receives a BufferSource directly instead of fetching a URL.
import wasmBytes from "@keroway/tdsl-wasm/tdsl_wasm_bg.wasm";
import {
	hasWikidataImport,
	extractTimelineTitle,
	parseDiagnostics,
	filterErrors,
	filterWarnings,
	filterInfos,
	formatDiagnosticMessages,
	parseLintIssues,
	formatLintIssues,
	parseRenderDirectives,
	resolveRenderOptions,
	parseScaleSetting,
	parseLaneHeightSetting,
	extractFenceBody,
	fenceBodyRange,
	ensureTrailingNewline,
	DEFAULT_SETTINGS,
	type TdslSettings,
} from "./utils";
import { findTdslFenceAtCursor } from "./fence";
import { rerenderMarkdownPreviewView } from "./obsidian-rerender";
import { createWasmInitializer } from "./wasm-init";

const ensureWasm = createWasmInitializer(async () => {
	await init(wasmBytes as unknown as Parameters<typeof init>[0]);
});

class TdslPreview extends MarkdownRenderChild {
	private readonly source: string;
	private readonly settings: TdslSettings;

	constructor(container: HTMLElement, source: string, settings: TdslSettings) {
		super(container);
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
				this.showErrors(wrapper, formatDiagnosticMessages(errors));
				return;
			}

			// Effective options = per-block `//!` directives over plugin settings.
			// A fresh JsRenderOptions is required per call: the WASM frees it after use.
			const directives = parseRenderDirectives(this.source);
			const r = resolveRenderOptions(directives, this.settings);
			const opts = new JsRenderOptions();
			if (r.grid) opts.grid = r.grid;
			if (r.theme) opts.theme = r.theme;
			if (r.orientation) opts.orientation = r.orientation;
			if (r.events !== undefined) opts.show_event_labels = r.events;
			// NOTE: show_table is HTML-only in the upstream renderer (SVG/PNG/PDF ignore it).
			// We handle the table separately via render_html_from_source_with_options below.
			if (r.laneHeight > 0) opts.lane_height = r.laneHeight;
			// `fit` opts the block into shrink-to-note-width (vs. natural size +
			// horizontal scroll). The renderer still uses auto scale.
			if (r.fit) wrapper.addClass("tdsl-fit");
			const svg = render_svg_from_source_with_options(
				this.source,
				r.scale,
				opts,
			);

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
			// Using setAttribute avoids innerHTML and keeps the XSS-safe invariant intact.
			const root = doc.documentElement;
			root.setAttribute("role", "img");
			root.setAttribute(
				"aria-label",
				extractTimelineTitle(this.source) ?? "Timeline",
			);
			wrapper.appendChild(document.adoptNode(root));

			// When `table: on`, render the data table via the HTML path and insert it below the SVG.
			// Use DOMParser (text/html) and adopt only the <table> element to stay XSS-safe.
			if (r.table) {
				const tableOpts = new JsRenderOptions();
				if (r.grid) tableOpts.grid = r.grid;
				if (r.theme) tableOpts.theme = r.theme;
				if (r.orientation) tableOpts.orientation = r.orientation;
				tableOpts.show_event_labels = r.events ?? false;
				tableOpts.show_table = true;
				const htmlStr = render_html_from_source_with_options(
					this.source,
					tableOpts,
				);
				const htmlDoc = new DOMParser().parseFromString(htmlStr, "text/html");
				const tableEl = htmlDoc.querySelector("table");
				if (tableEl) {
					const tableWrapper = wrapper.createDiv({
						cls: "tdsl-table-wrapper",
					});
					tableWrapper.appendChild(document.adoptNode(tableEl));
				}
			}

			// Warn when import wikidata blocks are silently skipped (no network in browser).
			if (hasWikidataImport(this.source)) {
				const notice = wrapper.createDiv({ cls: "tdsl-notice" });
				notice.createSpan({ text: "⚠ " });
				notice.createSpan({
					text: "import wikidata は Obsidian 内では実行されません。静的アイテムのみ表示されます。",
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
				const messages = formatLintIssues(lintIssues);
				if (messages.length > 0) {
					const lintBanner = wrapper.createDiv({
						cls: "tdsl-lint-banner",
					});
					for (const msg of messages) {
						const row = lintBanner.createDiv({
							cls: "tdsl-notice tdsl-notice-warning",
						});
						row.createSpan({ text: "⚠ " });
						row.createSpan({ text: msg });
					}
				}
			} catch {
				// Lint is non-critical: silently ignore failures.
			}
		} catch (e) {
			this.showErrors(wrapper, [String(e)]);
		}
	}

	private showErrors(container: HTMLElement, messages: string[]): void {
		container.createEl("pre", {
			text: `Timeline DSL error:\n${messages.join("\n")}`,
			cls: "tdsl-error",
		});
	}

	private showNotice(
		container: HTMLElement,
		kind: "warning" | "info",
		diag: import("./utils").Diagnostic,
	): void {
		const icon = kind === "warning" ? "⚠ " : "ℹ ";
		const prefix = diag.line > 0 ? `Line ${diag.line}: ` : "";
		const notice = container.createDiv({
			cls: `tdsl-notice tdsl-notice-${kind}`,
		});
		notice.createSpan({ text: icon });
		notice.createSpan({ text: `${prefix}${diag.message}` });
	}
}

export default class TimelineDslPlugin extends Plugin {
	settings: TdslSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new TdslSettingTab(this.app, this));
		this.registerMarkdownCodeBlockProcessor("tdsl", (_source, el, ctx) => {
			ctx.addChild(new TdslPreview(el, _source, this.settings));
		});

		this.addCommand({
			id: "format-tdsl-block",
			name: "現在の tdsl ブロックを整形",
			editorCallback: async (editor: Editor) => {
				await ensureWasm();
				formatCurrentBlock(editor);
			},
		});
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

	constructor(app: App, plugin: TimelineDslPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("p", {
			text: "これらは既定値です。各コードブロックの //! ディレクティブが常に優先されます。",
			cls: "setting-item-description",
		});

		new Setting(containerEl)
			.setName("既定テーマ (theme)")
			.setDesc("auto = Obsidian のライト/ダークに追従（プラグイン CSS で描画）")
			.addDropdown((d) =>
				d
					.addOptions({
						auto: "auto（追従）",
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
			.setName("既定グリッド (grid)")
			.setDesc("グリッド線の密度")
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
			.setName("既定スケール (scale)")
			.setDesc(
				"auto / fit / 正の数（px per year）。fit はノート幅に縮小（横スクロールなし）。",
			)
			.addText((t) =>
				t
					.setPlaceholder("auto")
					.setValue(String(this.plugin.settings.scale))
					.onChange(async (raw) => {
						this.plugin.settings.scale = parseScaleSetting(raw);
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("イベントラベルを既定で表示 (events)")
			.setDesc("event / event_range にラベルを表示する")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.events).onChange(async (v) => {
					this.plugin.settings.events = v;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("既定 lane 高さ (lane_height)")
			.setDesc(
				"正の整数（px）。空欄または 0 でレンダラ既定（60 px）。//! lane_height: N でブロック単位に上書き可能。",
			)
			.addText((t) =>
				t
					.setPlaceholder("0")
					.setValue(
						this.plugin.settings.laneHeight > 0
							? String(this.plugin.settings.laneHeight)
							: "",
					)
					.onChange(async (raw) => {
						this.plugin.settings.laneHeight = parseLaneHeightSetting(raw);
						await this.plugin.saveSettings();
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
function formatCurrentBlock(editor: Editor): void {
	const cursor = editor.getCursor();
	const lines: string[] = [];
	for (let i = 0; i < editor.lineCount(); i++) {
		lines.push(editor.getLine(i));
	}

	const fence = findTdslFenceAtCursor(lines, cursor.line);
	if (fence.status === "not-in-block") {
		new Notice("Timeline DSL: カーソルが tdsl ブロック内にありません。");
		return;
	}
	if (fence.status === "missing-close") {
		new Notice("Timeline DSL: tdsl ブロックの閉じ素が見つかりません。");
		return;
	}
	const { openLine, closeLine } = fence.range;

	const body = extractFenceBody(lines, openLine, closeLine);

	// Format the body; format_source throws a string error on parse failure.
	let formatted: string;
	try {
		formatted = format_source(body);
	} catch (e) {
		new Notice(`Timeline DSL 整形エラー:\n${String(e)}`);
		return;
	}

	const { from, to } = fenceBodyRange(openLine, closeLine);
	editor.replaceRange(ensureTrailingNewline(formatted), from, to);
	new Notice("✔ Timeline DSL ブロックを整形しました。");
}
