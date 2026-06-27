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
	render_svg_from_source_with_options,
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
	parseRenderDirectives,
	resolveRenderOptions,
	DEFAULT_SETTINGS,
	type TdslSettings,
} from "./utils";

let wasmReady = false;

async function ensureWasm(): Promise<void> {
	if (wasmReady) return;
	await init(wasmBytes as unknown as Parameters<typeof init>[0]);
	wasmReady = true;
}

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
			if (r.table !== undefined) opts.show_table = r.table;
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
			const view = leaf.view;
			if (view.getViewType() === "markdown") {
				// @ts-expect-error — Obsidian's previewMode is not in the public typings.

				view.previewMode?.rerender(true);
			}
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

/** Coerces the free-text lane_height setting into a non-negative integer. */
function parseLaneHeightSetting(raw: string): number {
	const n = Math.floor(Number(raw.trim()));
	return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Coerces the free-text scale setting into `"auto" | "fit" | number`. */
function parseScaleSetting(raw: string): TdslSettings["scale"] {
	const v = raw.trim().toLowerCase();
	if (v === "fit") return "fit";
	const n = Number(v);
	if (v !== "" && v !== "auto" && Number.isFinite(n) && n > 0) return n;
	return "auto";
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
	const lineCount = editor.lineCount();

	// Search backwards from cursor for the opening ```tdsl fence.
	let openLine = -1;
	for (let i = cursor.line; i >= 0; i--) {
		if (/^```tdsl\s*$/.test(editor.getLine(i))) {
			openLine = i;
			break;
		}
	}
	if (openLine === -1) {
		new Notice("Timeline DSL: カーソルが tdsl ブロック内にありません。");
		return;
	}

	// Search forward from the line after the opener for the closing ``` fence.
	let closeLine = -1;
	for (let i = openLine + 1; i < lineCount; i++) {
		if (/^```\s*$/.test(editor.getLine(i))) {
			closeLine = i;
			break;
		}
	}
	if (closeLine === -1) {
		new Notice("Timeline DSL: tdsl ブロックの閉じ素が見つかりません。");
		return;
	}

	// Extract the body (lines between the fences).
	const bodyLines: string[] = [];
	for (let i = openLine + 1; i < closeLine; i++) {
		bodyLines.push(editor.getLine(i));
	}
	const body = bodyLines.join("\n");

	// Format the body; format_source throws a string error on parse failure.
	let formatted: string;
	try {
		formatted = format_source(body);
	} catch (e) {
		new Notice(`Timeline DSL 整形エラー:\n${String(e)}`);
		return;
	}

	// Replace the body between the opening and closing fence markers.
	const from = { line: openLine + 1, ch: 0 };
	const to = { line: closeLine, ch: 0 };
	// Ensure there is a trailing newline before the closing ```.
	const replacement = formatted.endsWith("\n") ? formatted : formatted + "\n";
	editor.replaceRange(replacement, from, to);
	new Notice("✔ Timeline DSL ブロックを整形しました。");
}
