import { MarkdownRenderChild, Plugin } from "obsidian";
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
	formatDiagnosticMessages,
	parseRenderDirectives,
} from "./utils";

let wasmReady = false;

async function ensureWasm(): Promise<void> {
	if (wasmReady) return;
	await init(wasmBytes as unknown as Parameters<typeof init>[0]);
	wasmReady = true;
}

class TdslPreview extends MarkdownRenderChild {
	private readonly source: string;

	constructor(container: HTMLElement, source: string) {
		super(container);
		this.source = source;
	}

	async onload(): Promise<void> {
		const wrapper = this.containerEl.createDiv({ cls: "tdsl-preview" });

		try {
			await ensureWasm();

			// check_source returns JSON: [{severity, message, line, col}]
			const diagnosticsJson = check_source(this.source);
			const errors = filterErrors(parseDiagnostics(diagnosticsJson));

			if (errors.length > 0) {
				this.showErrors(wrapper, formatDiagnosticMessages(errors));
				return;
			}

			// `//! key: value` comments select scale / grid / theme / etc.
			// A fresh JsRenderOptions is required per call: the WASM frees it after use.
			const directives = parseRenderDirectives(this.source);
			const opts = new JsRenderOptions();
			if (directives.grid) opts.grid = directives.grid;
			if (directives.theme) opts.theme = directives.theme;
			if (directives.orientation) opts.orientation = directives.orientation;
			if (directives.events !== undefined)
				opts.show_event_labels = directives.events;
			if (directives.table !== undefined) opts.show_table = directives.table;
			const svg = render_svg_from_source_with_options(
				this.source,
				directives.scale ?? 0,
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
}

export default class TimelineDslPlugin extends Plugin {
	async onload(): Promise<void> {
		this.registerMarkdownCodeBlockProcessor("tdsl", (_source, el, ctx) => {
			ctx.addChild(new TdslPreview(el, _source));
		});
	}
}
