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
}

const LIGHT: ExportPalette = {
	bandEven: "#ffffff",
	bandOdd: "#f5f6f8",
	line: "#e3e5e8",
	textMuted: "#5c5f66",
	textFaint: "#8a8d93",
	text: "#222222",
};

const DARK: ExportPalette = {
	bandEven: "#1e1e1e",
	bandOdd: "#262626",
	line: "#3f3f3f",
	textMuted: "#a3a3a3",
	textFaint: "#7a7a7a",
	text: "#dadada",
};

/** Builds the CSS text for a concrete (non-`auto`) renderer theme. */
export function buildExportStyles(theme: string | undefined): string {
	const p = theme === "dark" ? DARK : LIGHT;
	const stroke = (cls: string) => `.${cls}{stroke:${p.line};stroke-width:1}`;
	return [
		`.tdsl-lane-band-even{fill:${p.bandEven}}`,
		`.tdsl-lane-band-odd{fill:${p.bandOdd}}`,
		stroke("tdsl-axis-baseline"),
		stroke("tdsl-axis-tick"),
		stroke("tdsl-axis-month-tick"),
		stroke("tdsl-group-separator"),
		`.tdsl-event-stem{stroke:${p.line};stroke-width:1;stroke-dasharray:2 2}`,
		`.tdsl-axis-text{fill:${p.textMuted}}`,
		`.tdsl-axis-day-text{fill:${p.textFaint}}`,
		`.tdsl-group-label{fill:${p.textMuted}}`,
		`.tdsl-lane-label{fill:${p.text}}`,
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
