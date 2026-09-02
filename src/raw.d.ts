// Vite's `?raw` suffix: import a file's own text as a string. Used by
// src/main-budget.test.ts so the size guard needs no Node fs types.
declare module "*?raw" {
	const content: string;
	export default content;
}
