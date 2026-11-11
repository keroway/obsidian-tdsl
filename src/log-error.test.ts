import { afterEach, describe, expect, it, vi } from "vitest";
import { logError } from "./log-error";

describe("logError", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("passes the operation name and the original error to console.error", () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => {});
		const cause = new Error("boom");
		logError("copy PNG", cause);
		expect(spy).toHaveBeenCalledWith("Timeline DSL: copy PNG failed.", cause);
	});
});
