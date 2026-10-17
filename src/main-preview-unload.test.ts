import { transformSync } from "esbuild";
import { describe, expect, it, vi } from "vitest";
import mainSource from "./main.ts?raw";

/**
 * `TdslPreview` lives in `src/main.ts`, which is excluded from unit testing
 * (see `vitest.config.ts`) because it is coupled to Obsidian's lifecycle. This
 * extracts just the class by source-slicing (same technique as
 * `main-fullscreen-panzoom.test.ts`) and injects its free dependencies.
 */
function loadPreview(deps: {
	ensureWasm: () => Promise<void>;
	renderSvg: (...args: unknown[]) => string;
}) {
	const previewSource = mainSource.slice(
		mainSource.indexOf("class TdslPreview"),
		mainSource.indexOf("function renderSvg("),
	);
	const body = `${previewSource}\nreturn TdslPreview;`;
	const { code } = transformSync(body, { loader: "ts", target: "es2022" });

	class FakeRenderChild {
		containerEl: unknown;
		constructor(containerEl: unknown) {
			this.containerEl = containerEl;
		}
	}
	const names = [
		"MarkdownRenderChild",
		"resolveRenderOptions",
		"parseRenderDirectives",
		"renderCacheKey",
		"svgRenderCache",
		"ensureWasm",
		"check_source",
		"parseDiagnostics",
		"filterErrors",
		"renderSvg",
	];
	const values = [
		FakeRenderChild,
		() => ({ fit: false }),
		() => ({}),
		() => "key",
		{ get: () => undefined, set: () => undefined },
		deps.ensureWasm,
		vi.fn(() => "[]"),
		() => [],
		() => [],
		deps.renderSvg,
	];
	return new Function(...names, code)(...values);
}

function setup(ensureWasm: () => Promise<void>) {
	const renderSvg = vi.fn(() => {
		throw new Error("render must not run");
	});
	const TdslPreview = loadPreview({ ensureWasm, renderSvg });
	const preview = new TdslPreview({}, "timeline {}", {}, {}, {});
	const showErrors = vi.fn();
	preview.showErrors = showErrors;
	const wrapper = { addClass: vi.fn() };
	return { preview, wrapper, renderSvg, showErrors };
}

describe("TdslPreview unload during WASM init (#308)", () => {
	it("skips rendering when unloaded while init is pending and then succeeds", async () => {
		let resolve!: () => void;
		const pending = new Promise<void>((r) => {
			resolve = r;
		});
		const { preview, wrapper, renderSvg, showErrors } = setup(() => pending);

		const done = preview.renderDiagram(wrapper);
		preview.onunload();
		resolve();
		await done;

		expect(renderSvg).not.toHaveBeenCalled();
		expect(showErrors).not.toHaveBeenCalled();
	});

	it("does not touch the UI when unloaded while init is pending and then fails", async () => {
		let reject!: (e: Error) => void;
		const pending = new Promise<void>((_, r) => {
			reject = r;
		});
		const { preview, wrapper, renderSvg, showErrors } = setup(() => pending);

		const done = preview.renderDiagram(wrapper);
		preview.onunload();
		reject(new Error("init failed"));
		await done;

		expect(renderSvg).not.toHaveBeenCalled();
		expect(showErrors).not.toHaveBeenCalled();
	});

	it("still reports init failures while the preview is alive", async () => {
		const { preview, wrapper, showErrors } = setup(() =>
			Promise.reject(new Error("init failed")),
		);

		await preview.renderDiagram(wrapper);

		expect(showErrors).toHaveBeenCalledTimes(1);
	});
});
