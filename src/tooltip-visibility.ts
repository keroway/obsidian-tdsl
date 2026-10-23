/**
 * Visibility rule for an item tooltip that can be opened by pointer hover and
 * by keyboard focus at the same time. The tooltip stays open while either
 * source is active, so leaving one never closes a tooltip the other still owns.
 * `dismiss()` (Escape) closes it until the next hover/focus event
 * (WCAG 1.4.13 Dismissible).
 */
export interface TooltipVisibility {
	setPointer(active: boolean): void;
	setFocus(active: boolean): void;
	dismiss(): void;
}

export function createTooltipVisibility(
	onChange: (visible: boolean) => void,
): TooltipVisibility {
	let pointer = false;
	let focus = false;
	const update = () => onChange(pointer || focus);
	return {
		setPointer(active) {
			pointer = active;
			update();
		},
		setFocus(active) {
			focus = active;
			update();
		},
		dismiss() {
			onChange(false);
		},
	};
}
