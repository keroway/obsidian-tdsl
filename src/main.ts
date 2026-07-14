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
	isRecognizedScaleInput,
	isRecognizedLaneHeightInput,
	debounce,
						// If the raw input could not be interpreted as auto/fit/a positive
						// number, it silently falls back to a default — reflect that in the
						// field so the displayed value never diverges from what was saved.
						if (!isRecognizedScaleInput(raw)) {
							t.setValue(String(parsed));
							new Notice(
								`Timeline DSL: "${raw}" is not a valid scale value. Reset to "${parsed}".`,
							);
						}
					}),
			);

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
function formatCurrentBlock(editor: Editor): void {
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

	// Format the body; format_source throws a string error on parse failure.
	let formatted: string;
	try {
		formatted = format_source(body);
	} catch (e) {
		new Notice(`Timeline DSL format error:\n${String(e)}`);
		return;
	}

	const { from, to } = fenceBodyRange(openLine, closeLine);
	editor.replaceRange(ensureTrailingNewline(formatted), from, to);
	new Notice("✔ Formatted the Timeline DSL block.");
}
