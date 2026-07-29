import type { ResolvedRender } from "./utils";

/**
 * Resolves the renderer theme for a standalone HTML export.
 *
 * The preview's `auto` theme is implemented by Obsidian host CSS, which is
 * unavailable outside the vault. Exports therefore always pass a concrete
 * renderer theme; explicit directive/settings themes keep precedence.
 */
export function resolveStandaloneHtmlRender(
	render: ResolvedRender,
	isDark: boolean,
): ResolvedRender {
	return {
		...render,
		theme: render.theme ?? (isDark ? "dark" : "default"),
	};
}
