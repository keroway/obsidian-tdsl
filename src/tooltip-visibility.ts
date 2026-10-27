/**
 * Visibility rule for the item tooltip shared by one preview wrapper. The
 * tooltip can be opened by pointer hover and by keyboard focus at the same
 * time, on different items. It stays open while either source is active, so
 * leaving one never closes a tooltip the other still owns; the pointer wins
 * while both are active, and the focused item is restored once it leaves.
 * `dismiss()` (Escape) closes it until the next hover/focus event
 * (WCAG 1.4.13 Dismissible).
 *
 * The tooltip body is also a pointer owner (WCAG 1.4.13 Hoverable): leaving
 * the item starts a short grace period that the pointer entering the tooltip
 * (`setTooltipHover`) or another item cancels, so the text can be reached and
 * read without it vanishing across the gap (#364).
 */
export interface TooltipTarget<T> {
	item: T;
	source: "pointer" | "focus";
}

export interface TooltipVisibility<T> {
	setPointer(item: T, active: boolean): void;
	setFocus(item: T, active: boolean): void;
	/** The pointer is over the tooltip body, which keeps its item's pointer ownership. */
	setTooltipHover(active: boolean): void;
	dismiss(): void;
}

export interface TooltipVisibilityOptions {
	/** Delay before a pointer leave takes effect. 0 (default) releases at once. */
	graceMs?: number;
	setTimer?: (fn: () => void, ms: number) => unknown;
	clearTimer?: (handle: unknown) => void;
}

export function createTooltipVisibility<T>(
	onChange: (target: TooltipTarget<T> | null) => void,
	options: TooltipVisibilityOptions = {},
): TooltipVisibility<T> {
	const graceMs = options.graceMs ?? 0;
	const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer =
		options.clearTimer ??
		((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
	let pointer: T | null = null;
	let focus: T | null = null;
	let pending: unknown = null;
	const update = () => {
		if (pointer !== null) onChange({ item: pointer, source: "pointer" });
		else if (focus !== null) onChange({ item: focus, source: "focus" });
		else onChange(null);
	};
	const cancelRelease = () => {
		if (pending === null) return;
		clearTimer(pending);
		pending = null;
	};
	const releasePointer = (item: T) => {
		cancelRelease();
		const release = () => {
			pending = null;
			if (pointer !== item) return;
			pointer = null;
			update();
		};
		if (graceMs > 0) pending = setTimer(release, graceMs);
		else release();
	};
	return {
		setPointer(item, active) {
			if (active) {
				cancelRelease();
				pointer = item;
			} else if (pointer === item) {
				releasePointer(item);
				return;
			} else return;
			update();
		},
		setFocus(item, active) {
			if (active) focus = item;
			else if (focus === item) focus = null;
			else return;
			update();
		},
		setTooltipHover(active) {
			if (active) cancelRelease();
			else if (pointer !== null) releasePointer(pointer);
		},
		dismiss() {
			cancelRelease();
			pointer = null;
			onChange(null);
		},
	};
}
