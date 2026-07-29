import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdleScheduler } from "./idle-scheduler";

describe("createIdleScheduler", () => {
	afterEach(() => vi.useRealTimers());

	it("uses requestIdleCallback and cancels its handle when supported", () => {
		const callback = vi.fn();
		const requestIdleCallback = vi.fn().mockReturnValue(7);
		const cancelIdleCallback = vi.fn();
		const scheduler = createIdleScheduler({
			requestIdleCallback,
			cancelIdleCallback,
		} as unknown as typeof globalThis);

		const cancel = scheduler.schedule(callback);
		expect(requestIdleCallback).toHaveBeenCalledWith(callback);
		cancel();
		expect(cancelIdleCallback).toHaveBeenCalledWith(7);
	});

	it("falls back to a zero-delay timeout", () => {
		vi.useFakeTimers();
		const callback = vi.fn();
		const scheduler = createIdleScheduler({
			setTimeout,
			clearTimeout,
		} as typeof globalThis);

		scheduler.schedule(callback);
		expect(callback).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(callback).toHaveBeenCalledOnce();
	});

	it("cancels the timeout fallback", () => {
		vi.useFakeTimers();
		const callback = vi.fn();
		const scheduler = createIdleScheduler({
			setTimeout,
			clearTimeout,
		} as typeof globalThis);

		scheduler.schedule(callback)();
		vi.runAllTimers();
		expect(callback).not.toHaveBeenCalled();
	});
});
