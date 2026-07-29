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
