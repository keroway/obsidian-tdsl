/** DOM primitives used to rasterize an SVG string, injectable for unit tests. */
export interface PngExportDeps {
	createImage: () => HTMLImageElement;
	createCanvas: () => HTMLCanvasElement;
	createObjectUrl: (blob: Blob) => string;
	revokeObjectUrl: (url: string) => void;
}

const defaultDeps: PngExportDeps = {
	createImage: () => new Image(),
	createCanvas: () => document.createElement("canvas"),
	createObjectUrl: (blob) => URL.createObjectURL(blob),
	revokeObjectUrl: (url) => URL.revokeObjectURL(url),
};

/**
 * Rasterizes an SVG string to a PNG Blob via an off-screen `<img>` + `<canvas>`.
 *
 * The SVG must already have its colors baked in (a concrete renderer theme,
 * not `"auto"`): the `<img>` loads the SVG in an isolated document context
 * that cannot see the host page's `.tdsl-preview` CSS classes, so any color
 * that depends on that external stylesheet would rasterize as black/unset.
 */
export function svgToPngBlob(
	svg: string,
	deps: PngExportDeps = defaultDeps,
): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
		const url = deps.createObjectUrl(blob);
		const img = deps.createImage();
		img.onload = () => {
			const canvas = deps.createCanvas();
			canvas.width = img.naturalWidth || img.width || 800;
			canvas.height = img.naturalHeight || img.height || 400;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				deps.revokeObjectUrl(url);
				reject(new Error("2D canvas context is unavailable"));
				return;
			}
			ctx.drawImage(img, 0, 0);
			deps.revokeObjectUrl(url);
			canvas.toBlob((result) => {
				if (result) resolve(result);
				else reject(new Error("canvas.toBlob failed"));
			}, "image/png");
		};
		img.onerror = () => {
			deps.revokeObjectUrl(url);
			reject(new Error("SVG image failed to load"));
		};
		img.src = url;
	});
}
