/**
 * Logs a caught exception to the developer console with the failing operation
 * name, so the fixed-text `Notice` shown to the user is not the only trace
 * (issue #455). Kept free of the Obsidian API so it is unit-testable.
 */
export function logError(operation: string, error: unknown): void {
	console.error(`Timeline DSL: ${operation} failed.`, error);
}
