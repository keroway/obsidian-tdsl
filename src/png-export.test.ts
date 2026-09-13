import { describe, expect, it, vi } from "vitest";
import { type PngExportDeps, svgToPngBlob } from "./png-export";

/** Minimal <img> stand-in: assigning `src` synchronously fires onload/onerror. */
class FakeImage {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	naturalWidth: number;
	naturalHeight: number;
	width = 0;
	height = 0;
	private outcome: "load" | "error";
	private srcValue = "";

	constructor(
		outcome: "load" | "error",
		naturalWidth = 120,
		naturalHeight = 60,
	) {
		this.outcome = outcome;
		this.naturalWidth = naturalWidth;
		this.naturalHeight = naturalHeight;
	}

	set src(value: string) {
		this.srcValue = value;
		if (this.outcome === "load") this.onload?.();
		else this.onerror?.();
	}

	get src(): string {
		return this.srcValue;
	}
}

/** Fires onload/onerror on a microtask, like a real <img> does after the Promise executor returns. */
class AsyncFakeImage {
	onload: (() => void) | null = null;
	onerror: (() => void) | null = null;
	naturalWidth = 120;
	naturalHeight = 60;
	width = 0;
	height = 0;
	private srcValue = "";

	set src(value: string) {
		this.srcValue = value;
		queueMicrotask(() => this.onload?.());
	}

	get src(): string {
		return this.srcValue;
	}
}

class FakeCanvas {
	width = 0;
	height = 0;
	private contextAvailable: boolean;
	private toBlobResult: Blob | null;
	private drawImageThrows: boolean;
	private toBlobThrows: boolean;

	constructor(
		contextAvailable: boolean,
		toBlobResult: Blob | null,
		options: { drawImageThrows?: boolean; toBlobThrows?: boolean } = {},
	) {
		this.contextAvailable = contextAvailable;
		this.toBlobResult = toBlobResult;
		this.drawImageThrows = options.drawImageThrows ?? false;
		this.toBlobThrows = options.toBlobThrows ?? false;
	}

	getContext(): { drawImage: () => void } | null {
		if (!this.contextAvailable) return null;
		return {
			drawImage: () => {
				if (this.drawImageThrows) {
					throw new Error("injected drawImage failure");
				}
			},
		};
	}

	toBlob(cb: (result: Blob | null) => void): void {
		if (this.toBlobThrows) {
			throw new Error("injected toBlob failure");
		}
		cb(this.toBlobResult);
	}
}

function makeDeps(overrides: Partial<PngExportDeps> = {}): PngExportDeps {
	return {
		createImage: () => new FakeImage("load") as unknown as HTMLImageElement,
		createCanvas: () =>
			new FakeCanvas(
				true,
				new Blob(["png"], { type: "image/png" }),
			) as unknown as HTMLCanvasElement,
		createObjectUrl: vi.fn().mockReturnValue("blob:fake"),
		revokeObjectUrl: vi.fn(),
		...overrides,
	};
}

describe("svgToPngBlob", () => {
	it("resolves with the rasterized PNG blob", async () => {
		const revokeObjectUrl = vi.fn();
		const deps = makeDeps({ revokeObjectUrl });

		const blob = await svgToPngBlob("<svg />", deps);

		expect(blob.type).toBe("image/png");
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:fake");
	});

	it("sizes the canvas from the image's natural dimensions", async () => {
		const canvas = new FakeCanvas(
			true,
			new Blob(["png"], { type: "image/png" }),
		);
		const deps = makeDeps({
			createImage: () =>
				new FakeImage("load", 300, 150) as unknown as HTMLImageElement,
			createCanvas: () => canvas as unknown as HTMLCanvasElement,
		});

		await svgToPngBlob("<svg />", deps);

		expect(canvas.width).toBe(300);
		expect(canvas.height).toBe(150);
	});

	it("rejects when the SVG fails to load as an image", async () => {
		const deps = makeDeps({
			createImage: () => new FakeImage("error") as unknown as HTMLImageElement,
		});

		await expect(svgToPngBlob("<svg />", deps)).rejects.toThrow(
			"SVG image failed to load",
		);
	});

	it("rejects when a 2D canvas context is unavailable", async () => {
		const deps = makeDeps({
			createCanvas: () =>
				new FakeCanvas(false, null) as unknown as HTMLCanvasElement,
		});

		await expect(svgToPngBlob("<svg />", deps)).rejects.toThrow(
			"2D canvas context is unavailable",
		);
	});

	it("rejects when canvas.toBlob produces no blob", async () => {
		const deps = makeDeps({
			createCanvas: () =>
				new FakeCanvas(true, null) as unknown as HTMLCanvasElement,
		});

		await expect(svgToPngBlob("<svg />", deps)).rejects.toThrow(
			"canvas.toBlob failed",
		);
	});

	it("rejects and revokes the object URL when drawImage throws after the executor returns", async () => {
		const revokeObjectUrl = vi.fn();
		const deps = makeDeps({
			createImage: () => new AsyncFakeImage() as unknown as HTMLImageElement,
			createCanvas: () =>
				new FakeCanvas(true, new Blob(["png"], { type: "image/png" }), {
					drawImageThrows: true,
				}) as unknown as HTMLCanvasElement,
			revokeObjectUrl,
		});

		await expect(svgToPngBlob("<svg />", deps)).rejects.toThrow(
			"injected drawImage failure",
		);
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:fake");
	});

	it("rejects and revokes the object URL when canvas.toBlob throws after the executor returns", async () => {
		const revokeObjectUrl = vi.fn();
		const deps = makeDeps({
			createImage: () => new AsyncFakeImage() as unknown as HTMLImageElement,
			createCanvas: () =>
				new FakeCanvas(true, new Blob(["png"], { type: "image/png" }), {
					toBlobThrows: true,
				}) as unknown as HTMLCanvasElement,
			revokeObjectUrl,
		});

		await expect(svgToPngBlob("<svg />", deps)).rejects.toThrow(
			"injected toBlob failure",
		);
		expect(revokeObjectUrl).toHaveBeenCalledWith("blob:fake");
	});
});
