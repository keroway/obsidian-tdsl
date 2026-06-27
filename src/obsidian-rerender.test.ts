import { describe, expect, it, vi } from "vitest";
import { rerenderMarkdownPreviewView } from "./obsidian-rerender";

describe("rerenderMarkdownPreviewView", () => {
	it("rerenders Markdown preview views with force=true", () => {
		const rerender = vi.fn();

		expect(
			rerenderMarkdownPreviewView({
				getViewType: () => "markdown",
				previewMode: { rerender },
			}),
		).toBe(true);
		expect(rerender).toHaveBeenCalledWith(true);
	});

	it("ignores non-Markdown views", () => {
		const rerender = vi.fn();

		expect(
			rerenderMarkdownPreviewView({
				getViewType: () => "canvas",
				previewMode: { rerender },
			}),
		).toBe(false);
		expect(rerender).not.toHaveBeenCalled();
	});

	it("ignores Markdown views that do not expose previewMode", () => {
		expect(rerenderMarkdownPreviewView({ getViewType: () => "markdown" })).toBe(
			false,
		);
	});
});
