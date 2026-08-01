/** Browser clipboard surface used by copy actions. */
export interface TextClipboard {
	writeText(text: string): Promise<void>;
}

export type CopyTextResult = "copied" | "unavailable" | "failed";

/**
 * Copies text when the Clipboard API is available.
 *
 * The API is injected for Node unit tests; production uses the browser's
 * navigator. Rejections are deliberately converted into a result so UI event
 * handlers cannot crash a rendered preview.
 */
export async function copyTextToClipboard(
	text: string,
	clipboard: TextClipboard | undefined = globalThis.navigator?.clipboard,
): Promise<CopyTextResult> {
	if (!clipboard) return "unavailable";
	try {
		await clipboard.writeText(text);
		return "copied";
	} catch {
		return "failed";
	}
}

/** Browser clipboard surface used to write binary image data. */
export interface ImageClipboard {
	write(items: ClipboardItem[]): Promise<void>;
}

export type CopyImageResult = "copied" | "unavailable" | "failed";

/**
 * Copies an image Blob when both the Clipboard API and `ClipboardItem` are
 * available. Some browsers implement `navigator.clipboard.write` without
 * exposing the `ClipboardItem` constructor, so both are checked.
 *
 * The clipboard and constructor are injected for Node unit tests; production
 * uses the browser's globals. Rejections are converted into a result so UI
 * event handlers cannot crash a rendered preview.
 */
export async function copyImageToClipboard(
	blob: Blob,
	mimeType: string,
	clipboard: ImageClipboard | undefined = globalThis.navigator?.clipboard,
	ClipboardItemCtor:
		| typeof ClipboardItem
		| undefined = globalThis.ClipboardItem,
): Promise<CopyImageResult> {
	if (!clipboard || !ClipboardItemCtor) return "unavailable";
	try {
		await clipboard.write([new ClipboardItemCtor({ [mimeType]: blob })]);
		return "copied";
	} catch {
		return "failed";
	}
}
