/**
 * Visibility rule for the item tooltip shared by one preview wrapper. The
 * tooltip can be opened by pointer hover and by keyboard focus at the same
 * time, on different items. It stays open while either source is active, so
 * leaving one never closes a tooltip the other still owns; the pointer wins
 * while both are active, and the focused item is restored once it leaves.
 * `dismiss()` (Escape) closes it until the next hover/focus event
 * (WCAG 1.4.13 Dismissible).
 */
export interface TooltipTarget<T> {
	item: T;
	source: "pointer" | "focus";
}

export interface TooltipVisibility<T> {
	setPointer(item: T, active: boolean): void;
	setFocus(item: T, active: boolean): void;
	dismiss(): void;
}

export function createTooltipVisibility<T>(
	onChange: (target: TooltipTarget<T> | null) => void,
): TooltipVisibility<T> {
	let pointer: T | null = null;
	let focus: T | null = null;
	const update = () => {
		if (pointer !== null) onChange({ item: pointer, source: "pointer" });
		else if (focus !== null) onChange({ item: focus, source: "focus" });
		else onChange(null);
	};
	return {
		setPointer(item, active) {
			if (active) pointer = item;
			else if (pointer === item) pointer = null;
			else return;
			update();
		},
		setFocus(item, active) {
			if (active) focus = item;
			else if (focus === item) focus = null;
			else return;
			update();
		},
		dismiss() {
			onChange(null);
		},
	};
}
