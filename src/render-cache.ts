import type { Diagnostic, ResolvedRender } from "./utils";

/** A rendered SVG together with its validation diagnostics. */
export interface CachedRender {
	svg: string;
	diagnostics: Diagnostic[];
}

/**
 * Serializes every renderer input in a fixed order.
 *
 * A cache hit must be exactly equivalent to a fresh check/render, so this
 * intentionally does not rely on caller object-property order.
 */
export function renderCacheKey(source: string, r: ResolvedRender): string {
	return JSON.stringify([
		source,
		r.scale,
		r.fit,
		r.grid,
		r.theme,
		r.orientation,
		r.layout_style,
		r.events,
		r.table,
		r.legend,
		r.laneHeight,
	]);
}

/** A small in-memory LRU cache for successful renderer output. */
export class SvgLruCache {
	private readonly entries = new Map<string, CachedRender>();

	constructor(private readonly capacity = 16) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new RangeError("SVG cache capacity must be a positive integer");
		}
	}

	get(key: string): CachedRender | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;

		// Map iteration order is insertion order. Reinserting promotes a hit.
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry;
	}

	set(key: string, entry: CachedRender): void {
		if (this.entries.delete(key)) {
			this.entries.set(key, entry);
			return;
		}

		if (this.entries.size === this.capacity) {
			const oldestKey = this.entries.keys().next().value as string;
			this.entries.delete(oldestKey);
		}
		this.entries.set(key, entry);
	}
}
