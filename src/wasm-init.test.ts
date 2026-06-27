import { describe, expect, it } from "vitest";
import { createWasmInitializer } from "./wasm-init";

describe("createWasmInitializer", () => {
	it("shares one in-flight initialization across concurrent callers", async () => {
		let calls = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const ensureWasm = createWasmInitializer(async () => {
			calls += 1;
			await gate;
		});

		const first = ensureWasm();
		const second = ensureWasm();
		const third = ensureWasm();

		expect(calls).toBe(1);
		release();
		await Promise.all([first, second, third]);

		await ensureWasm();
		expect(calls).toBe(1);
	});

	it("resets the in-flight initialization after failure so a later call can retry", async () => {
		let calls = 0;
		const ensureWasm = createWasmInitializer(async () => {
			calls += 1;
			if (calls === 1) throw new Error("boom");
		});

		await expect(ensureWasm()).rejects.toThrow("boom");
		await expect(ensureWasm()).resolves.toBeUndefined();
		expect(calls).toBe(2);
	});
});
