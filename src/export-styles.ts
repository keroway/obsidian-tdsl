/**
 * Self-contained styles for SVG exports (Copy PNG / Save as file).
 *
 * The renderer's SVG output does not vary with `theme` and leaves structural
 * elements (axis lines, lane bands) unpainted; in the preview they are coloured
 * by `styles.css`, which an isolated `<img>` or a saved `.svg` embed cannot
 * see (#386). The rules below are the literal-colour equivalent of that host
 * CSS, chosen per theme and embedded into the exported SVG itself.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

interface ExportPalette {
	bandEven: string;
	bandOdd: string;
	line: string;
	textMuted: string;
	textFaint: string;
	text: string;
	/** Default lane colours, `--tdsl-lane-0..7` (mirrors styles.css). */
	lanes: readonly string[];
}

const LIGHT: ExportPalette = {
	lanes: [
		"#4682b4",
		"#e67e22",
		"#27ae60",
		"#8e44ad",
		"#e74c3c",
		"#1abc9c",
		"#f39c12",
		"#2980b9",
	],
	bandEven: "#ffffff",
	bandOdd: "#f5f6f8",
	line: "#e3e5e8",
	textMuted: "#5c5f66",
	textFaint: "#8a8d93",
	text: "#222222",
};

const DARK: ExportPalette = {
	lanes: [
		"#5ba3d8",
		"#f0983a",
		"#3cc174",
		"#a55cc7",
		"#f05a4a",
		"#22d3b6",
		"#f7b731",
		"#3a97d4",
	],
	bandEven: "#1e1e1e",
	bandOdd: "#262626",
	line: "#3f3f3f",
	textMuted: "#a3a3a3",
	textFaint: "#7a7a7a",
	text: "#dadada",
};

/** Soft, low-saturation lanes on warm paper-like bands (#433). */
const PASTEL: ExportPalette = {
	lanes: [
		"#6f9fc8",
		"#e0985a",
		"#6fb98a",
		"#a583bd",
		"#df7f78",
		"#68bfae",
		"#d9ab55",
		"#6f8fc2",
	],
	bandEven: "#fffaf3",
	bandOdd: "#f7efe4",
	line: "#e6dccd",
	textMuted: "#6b6258",
	textFaint: "#968c80",
	text: "#3a342d",
};

/** Dark, high-contrast lanes on pure white with black ink for paper (#433). */
const PRINT: ExportPalette = {
	lanes: [
		"#1f4e79",
		"#a14a00",
		"#1b6b3a",
		"#5b2c83",
		"#9b1c1c",
		"#0f6b5c",
		"#7a5500",
		"#17407a",
	],
	bandEven: "#ffffff",
	bandOdd: "#ffffff",
	line: "#9a9a9a",
	textMuted: "#333333",
	textFaint: "#555555",
	text: "#000000",
};

function paletteFor(theme: string | undefined): ExportPalette {
	switch (theme) {
		case "dark":
			return DARK;
		case "pastel":
			return PASTEL;
		case "print":
			return PRINT;
		default:
			return LIGHT;
	}
}

/**
 * The event-label colour rule alone, for the standalone HTML page whose own
 * template already themes everything else (#416). The `svg` type selector
 * outranks the renderer's later `.tdsl-event-label{fill:#333}` (#413).
 */
export function buildEventLabelRule(theme: string | undefined): string {
	const p = paletteFor(theme);
	return `svg .tdsl-event-label{fill:${p.text}}`;
}

/**
 * Text colour for labels the renderer moved outside a short bar (#439, #445).
 * They sit on the lane band, not the lane colour, so they take the theme's
 * text colour; shared by SVG exports and the standalone HTML page.
 */
export function buildExternalLabelRule(theme: string | undefined): string {
	const p = paletteFor(theme);
	return `.tdsl-item-label.tdsl-item-label-external{fill:${p.text}}`;
}

/**
 * Colours for the standalone HTML page's interactive header and legend (#446).
 * The WASM template hard-codes `#fff` / `#fafafa` backgrounds for them while
 * its dark body only lightens the text, leaving light-on-light chrome. Only
 * `dark` needs a correction; other themes keep the template's own light chrome.
 */
export function buildPageChromeRule(theme: string | undefined): string {
	if (theme !== "dark") return "";
	const p = DARK;
	return [
		`#tdsl-header{background:${p.bandEven};border-bottom-color:${p.line};color:${p.text}}`,
		`#tdsl-header h1{color:${p.text}}`,
		`#tdsl-legend{background:${p.bandOdd};border-right-color:${p.line};color:${p.text}}`,
	].join("\n");
}

/**
 * Lane colour variables for the SVG root. The renderer defines them via
 * `:where(.tdsl-root)` (zero specificity), so this rule wins regardless of
 * order (#418). Shared by SVG/PNG exports and the standalone HTML page (#428).
 */
export function buildLaneVarsRule(theme: string | undefined): string {
	const p = paletteFor(theme);
	const laneVars = p.lanes.map((c, i) => `--tdsl-lane-${i}:${c}`).join(";");
	return `svg.tdsl-root{${laneVars}}`;
}

/** Builds the CSS text for a concrete (non-`auto`) renderer theme. */
export function buildExportStyles(theme: string | undefined): string {
	const p = paletteFor(theme);
	const stroke = (cls: string) => `.${cls}{stroke:${p.line};stroke-width:1}`;
	return [
		buildLaneVarsRule(theme),
		`.tdsl-lane-band-even{fill:${p.bandEven}}`,
		`.tdsl-lane-band-odd{fill:${p.bandOdd}}`,
		stroke("tdsl-axis-baseline"),
		stroke("tdsl-axis-tick"),
		stroke("tdsl-axis-month-tick"),
		stroke("tdsl-group-separator"),
		`.tdsl-event-stem{stroke:${p.line};stroke-width:1;stroke-dasharray:2 2}`,
		`.tdsl-axis-text{fill:${p.textMuted}}`,
		// The renderer's later <style> sets `.tdsl-axis-day-text{fill:#888}`; the
		// `svg` type selector outranks it, as for event labels (#450).
		`svg .tdsl-axis-day-text{fill:${p.textFaint}}`,
		`.tdsl-group-label{fill:${p.textMuted}}`,
		`.tdsl-lane-label{fill:${p.text}}`,
		// The renderer's own <style> sets `.tdsl-event-label{fill:#333}` and comes
		// later in document order, so equal specificity would lose; the `svg`
		// type selector outranks it (#413).
		`svg .tdsl-event-label{fill:${p.text}}`,
		// Drawn on a saturated lane colour, so a literal white in every theme.
		".tdsl-item-label{fill:#fff;font-size:11px;font-weight:500;pointer-events:none}",
		// Labels the renderer moved outside a short bar sit on the lane band, not
		// on the lane colour, so they take the theme's text colour (#439).
		buildExternalLabelRule(theme),
		// `now`-ended items: dashed outline on the saturated lane colour (#410).
		".tdsl-item-open-ended .tdsl-span,.tdsl-item-open-ended .tdsl-event-range{stroke:#fff;stroke-width:1;stroke-dasharray:4 2}",
		// Hit area for hover/click in the preview; must stay invisible.
		".tdsl-event-hit{fill:transparent}",
	].join("\n");
}

/**
 * Embeds {@link buildExportStyles} as a `<style>` element at the start of the
 * SVG root. Returns the input unchanged when it is not parseable SVG, so an
 * export is never lost to this step.
 */
export function embedExportStyles(
	svg: string,
	theme: string | undefined,
	parser: DOMParser = new DOMParser(),
	serializer: XMLSerializer = new XMLSerializer(),
): string {
	const doc = parser.parseFromString(svg, "image/svg+xml");
	if (doc.querySelector("parsererror")) return svg;
	const root = doc.documentElement;
	const style = doc.createElementNS(SVG_NS, "style");
	style.textContent = buildExportStyles(theme);
	// Prepended so the renderer's own <style> (later in document order) wins
	// wherever it does set a value.
	root.insertBefore(style, root.firstChild);
	return serializer.serializeToString(root);
}
