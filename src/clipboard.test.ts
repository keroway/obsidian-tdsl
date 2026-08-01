import { describe, expect, it, vi } from "vitest";
import { copyImageToClipboard, copyTextToClipboard } from "./clipboard";

describe("copyTextToClipboard", () => {
	it("writes the complete text through the Clipboard API", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);

		expect(await copyTextToClipboard("<svg />", { writeText })).toBe("copied");
		expect(writeText).toHaveBeenCalledWith("<svg />");
	});

	it("reports an unavailable Clipboard API", async () => {
		expect(await copyTextToClipboard("<svg />", undefined)).toBe("unavailable");
	});

	it("handles rejected clipboard writes without throwing", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));

		expect(await copyTextToClipboard("<svg />", { writeText })).toBe("failed");
	});
});

describe("copyImageToClipboard", () => {
	// Minimal stand-in: production uses the real ClipboardItem constructor,
	// injected here since Node has no DOM globals.
	class FakeClipboardItem {
		constructor(public items: Record<string, Blob>) {}
	}
	const ClipboardItemCtor =
		FakeClipboardItem as unknown as typeof ClipboardItem;
	const blob = new Blob(["fake-png-bytes"], { type: "image/png" });

	it("writes the blob as a ClipboardItem through the Clipboard API", async () => {
		const write = vi.fn().mockResolvedValue(undefined);

		expect(
			await copyImageToClipboard(
				blob,
				"image/png",
				{ write },
				ClipboardItemCtor,
			),
		).toBe("copied");
		expect(write).toHaveBeenCalledTimes(1);
		const [items] = write.mock.calls[0];
		expect(items).toHaveLength(1);
		expect(items[0].items).toEqual({ "image/png": blob });
	});

	it("reports an unavailable Clipboard API", async () => {
		expect(
			await copyImageToClipboard(
				blob,
				"image/png",
				undefined,
				ClipboardItemCtor,
			),
		).toBe("unavailable");
	});

	it("reports an unavailable ClipboardItem constructor", async () => {
		const write = vi.fn().mockResolvedValue(undefined);

		expect(
			await copyImageToClipboard(blob, "image/png", { write }, undefined),
		).toBe("unavailable");
	});

	it("handles rejected clipboard writes without throwing", async () => {
		const write = vi.fn().mockRejectedValue(new Error("denied"));

		expect(
			await copyImageToClipboard(
				blob,
				"image/png",
				{ write },
				ClipboardItemCtor,
			),
		).toBe("failed");
	});
});
