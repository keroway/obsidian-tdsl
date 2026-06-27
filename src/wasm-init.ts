export type WasmInitializer = () => Promise<void>;

/**
 * Wraps WASM initialization so concurrent callers share one in-flight init.
 *
 * Obsidian can render multiple `tdsl` blocks at once. Without this single-flight
 * guard, each block can observe "not ready" and call the underlying WASM
 * `init()` concurrently. If initialization fails, the in-flight promise is reset
 * so a later render can retry.
 */
export function createWasmInitializer(initialize: WasmInitializer): WasmInitializer {
	let ready = false;
	let initPromise: Promise<void> | null = null;

	return async () => {
		if (ready) return;

		if (!initPromise) {
			initPromise = initialize().then(
				() => {
					ready = true;
				},
				(error: unknown) => {
					initPromise = null;
					throw error;
				},
			);
		}

		await initPromise;
	};
}
