import { buildEventLabelRule } from "./export-styles";
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

/**
 * Appends the theme-aware event-label colour rule to the page's `<head>`
 * (#416). The HTML API output keeps `.tdsl-event-label{fill:#333}` on a dark
 * page background otherwise. Returns `html` unchanged when it has no `</head>`.
 */
export function embedEventLabelStyle(
	html: string,
	theme: string | undefined,
): string {
	const at = html.indexOf("</head>");
	if (at < 0) return html;
	return `${html.slice(0, at)}<style>${buildEventLabelRule(theme)}</style>${html.slice(at)}`;
}

/**
 * Swaps the SVG embedded in a WASM-generated standalone HTML document for
 * `svg`.
 *
 * `render_html_from_source_with_options` has no `scale` parameter, so the
 * document always embeds the auto-scaled diagram. Rendering the SVG separately
 * with the resolved scale and substituting it keeps the WASM page template
 * (theme CSS, title) while honouring Default scale / `//! scale:`.
 *
 * Returns `html` unchanged when it holds no `<svg>` element, so a template
 * change upstream degrades to the old behaviour instead of corrupting output.
 */
export function replaceEmbeddedSvg(html: string, svg: string): string {
	const start = html.indexOf("<svg");
	const end = html.lastIndexOf("</svg>");
	if (start < 0 || end < start) return html;
	return html.slice(0, start) + svg.trim() + html.slice(end + "</svg>".length);
}
