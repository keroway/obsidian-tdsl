import { describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

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
