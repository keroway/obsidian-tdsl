export interface MarkdownPreviewViewLike {
	getViewType(): string;
	previewMode?: {
		rerender(force?: boolean): void;
	};
}

/**
 * Re-renders an Obsidian Markdown preview view when the private previewMode API
 * is present. Kept tiny and structural so the settings side effect is testable
 * without booting Obsidian in Vitest.
 */
export function rerenderMarkdownPreviewView(
	view: MarkdownPreviewViewLike,
): boolean {
	if (view.getViewType() !== "markdown" || !view.previewMode) return false;
	view.previewMode.rerender(true);
	return true;
}
