import {
	MarkdownRenderChild,
	Plugin,
	PluginSettingTab,
	Setting,
	type App,
} from "obsidian";
import init, {
	check_source,
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
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
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
			text: "これらは既定値です。各コードブロックの //! ディレクティブが常に優先されます。変更後は対象ノートを開き直すと反映されます。",
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
	}
}

/** Coerces the free-text scale setting into `"auto" | "fit" | number`. */
function parseScaleSetting(raw: string): TdslSettings["scale"] {
	const v = raw.trim().toLowerCase();
	if (v === "fit") return "fit";
	const n = Number(v);
	if (v !== "" && v !== "auto" && Number.isFinite(n) && n > 0) return n;
	return "auto";
}
