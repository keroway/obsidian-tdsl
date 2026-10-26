/**
 * Document-level Escape listener that is attached only while something is
 * open (WCAG 1.4.13 Dismissible must work wherever keyboard focus is). It
 * removes itself once `isAlive()` turns false, so tearing down the owner while
 * open does not leak the listener (#360).
 */
export interface EscapeListener {
	attach(): void;
	detach(): void;
}

export function createEscapeListener(
	doc: Document,
	isAlive: () => boolean,
	onEscape: () => void,
): EscapeListener {
	const handler = (ev: KeyboardEvent) => {
		if (!isAlive()) {
			doc.removeEventListener("keydown", handler, true);
			return;
		}
		if (ev.key === "Escape") onEscape();
	};
	return {
		// Re-adding the same handler/capture pair is a no-op, so attach is idempotent.
		attach: () => doc.addEventListener("keydown", handler, true),
		detach: () => doc.removeEventListener("keydown", handler, true),
	};
}
