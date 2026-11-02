import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, sanitizeSettings } from "./utils";

describe("sanitizeSettings", () => {
	it("非オブジェクトは既定値", () => {
		for (const v of [null, undefined, "x", 1, [], true]) {
			expect(sanitizeSettings(v)).toEqual(DEFAULT_SETTINGS);
		}
	});

	it("欠落項目は既定値で補い、有効な値は保持する", () => {
		expect(sanitizeSettings({ theme: "dark", scale: 12 })).toEqual({
			...DEFAULT_SETTINGS,
			theme: "dark",
			scale: 12,
		});
	});

	it("不正値は項目ごとに既定値へ戻す", () => {
		const r = sanitizeSettings({
			events: "false",
			scale: -10,
			laneHeight: -5,
			theme: "bogus",
			panZoom: "false",
			grid: null,
			table: 1,
		});
		expect(r).toEqual(DEFAULT_SETTINGS);
	});

	it("scale は auto/fit/正の有限数のみ", () => {
		expect(sanitizeSettings({ scale: "fit" }).scale).toBe("fit");
		expect(sanitizeSettings({ scale: 0 }).scale).toBe("auto");
		expect(sanitizeSettings({ scale: Number.NaN }).scale).toBe("auto");
		expect(sanitizeSettings({ scale: "8" }).scale).toBe("auto");
	});

	it("laneHeight は非負整数のみ", () => {
		expect(sanitizeSettings({ laneHeight: 40 }).laneHeight).toBe(40);
		expect(sanitizeSettings({ laneHeight: 1.5 }).laneHeight).toBe(0);
		expect(sanitizeSettings({ laneHeight: "40" }).laneHeight).toBe(0);
	});
});
