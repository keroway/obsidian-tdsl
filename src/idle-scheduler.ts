export interface IdleScheduler {
	schedule(callback: () => void): () => void;
}

type IdleGlobal = typeof globalThis & {
	requestIdleCallback?: (callback: () => void) => number;
	cancelIdleCallback?: (id: number) => void;
};

/** Schedules non-critical work when the browser is idle, with a timer fallback. */
export function createIdleScheduler(
	global: IdleGlobal = globalThis,
): IdleScheduler {
	return {
		schedule(callback) {
			if (global.requestIdleCallback && global.cancelIdleCallback) {
				const id = global.requestIdleCallback(callback);
				return () => global.cancelIdleCallback?.(id);
			}

			const id = global.setTimeout(callback, 0);
			return () => global.clearTimeout(id);
		},
	};
}

export const idleScheduler = createIdleScheduler();
