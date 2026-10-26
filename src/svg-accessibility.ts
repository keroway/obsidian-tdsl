/**
 * Accessibility attributes for the rendered timeline SVG.
 *
 * Depends on the DOM only — never on Obsidian — and takes the owning
 * `Document` as an argument rather than reaching for the global, so the rules
 * below can be exercised against any DOM implementation.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

/** The fixed `aria-label` the WASM renderer puts on every timeline root. */
const GENERIC_LABEL = /^\s*timeline\s*$/i;

/**
 * Labels the root `<svg>` of a rendered timeline for assistive technology.
 *
 * `role="img"` must NOT be used here: it is a children-presentational role, so
 * it would strip every per-item `role="group"` / `aria-label` / `<title>` the
 * renderer emits from the accessibility tree — while the items keep their
 * `tabindex="0"` and stay focusable. The result is focus stops that read as
 * nothing. `role="group"` keeps the diagram labelled as a whole and leaves the
 * descendants exposed.
 *
 * Attributes the renderer already provides win: upstream knows the diagram's
 * structure better than this plugin does. The one exception is the renderer's
 * generic `timeline` label, which carries no information; the title extracted
 * from the source replaces it.
 */
export function applyRootAccessibility(
	doc: Document,
	root: Element,
	label: string,
): void {
	// The renderer itself emits role="img" on the root, so a missing role is not
	// the only case to fix: img is rewritten to group. Other roles (figure, …)
	// are kept.
	const role = root.getAttribute("role");
	if (role === null || role.trim().toLowerCase() === "img")
		root.setAttribute("role", "group");
	const existing = root.getAttribute("aria-label");
	const effectiveLabel =
		existing === null || GENERIC_LABEL.test(existing) ? label : existing;
	if (existing !== effectiveLabel)
		root.setAttribute("aria-label", effectiveLabel);

	// A root <title> gives the same description to tools that surface the SVG
	// standalone (tooltips, exported files) rather than reading aria-label.
	const firstChild = root.firstElementChild;
	if (firstChild?.tagName.toLowerCase() === "title") return;
	const titleEl = doc.createElementNS(SVG_NS, "title");
	titleEl.textContent = effectiveLabel;
	root.insertBefore(titleEl, root.firstChild);
}
