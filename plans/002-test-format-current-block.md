# Plan 002: Extract and unit-test the pure logic of formatCurrentBlock

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 6afabb2..HEAD -- src/main.ts src/utils.ts src/utils.test.ts`
> If any of those files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Prerequisite**: Plan 001 should be complete first (it adds `vitest.config.ts`
> and the `test:coverage` script). If it is not done, this plan still works but
> the coverage gate will not exist.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/001-extract-settings-parsers-to-utils.md
- **Category**: tests / tech-debt
- **Planned at**: commit `6afabb2`, 2026-06-28

## Why this matters

`formatCurrentBlock` (70+ lines in `src/main.ts`) is the most complex code path
with zero test coverage. It reads the entire editor buffer, locates the tdsl
fence surrounding the cursor, extracts the body, calls the WASM formatter, and
replaces the editor range. A subtle bug here silently corrupts user content —
the undo stack can recover it, but the user has to notice the damage first.

The body-extraction and trailing-newline-normalization logic is pure (no Obsidian
API, no WASM dependency) and can be unit-tested directly. Extracting those
pieces to `utils.ts` makes the testable surface explicit and keeps `main.ts`
focused on Obsidian-API glue.

## Current state

### The full `formatCurrentBlock` function

`src/main.ts:362-402`:

```ts
function formatCurrentBlock(editor: Editor): void {
 const cursor = editor.getCursor();
 const lines: string[] = [];
 for (let i = 0; i < editor.lineCount(); i++) {
  lines.push(editor.getLine(i));
 }

 const fence = findTdslFenceAtCursor(lines, cursor.line);
 if (fence.status === "not-in-block") {
  new Notice("Timeline DSL: カーソルが tdsl ブロック内にありません。");
  return;
 }
 if (fence.status === "missing-close") {
  new Notice("Timeline DSL: tdsl ブロックの閉じ素が見つかりません。");
  return;
 }
 const { openLine, closeLine } = fence.range;

 // Extract the body (lines between the fences).
 const bodyLines: string[] = [];
 for (let i = openLine + 1; i < closeLine; i++) {
  bodyLines.push(editor.getLine(i));
 }
 const body = bodyLines.join("\n");

 // Format the body; format_source throws a string error on parse failure.
 let formatted: string;
 try {
  formatted = format_source(body);
 } catch (e) {
  new Notice(`Timeline DSL 整形エラー:\n${String(e)}`);
  return;
 }

 // Replace the body between the opening and closing fence markers.
 const from = { line: openLine + 1, ch: 0 };
 const to = { line: closeLine, ch: 0 };
 // Ensure there is a trailing newline before the closing ```.
 const replacement = formatted.endsWith("\n") ? formatted : formatted + "\n";
 editor.replaceRange(replacement, from, to);
 new Notice("✔ Timeline DSL ブロックを整形しました。");
}
```

The Obsidian-API-dependent parts are:

- `editor.getCursor()` → cursor position
- `editor.lineCount()` / `editor.getLine(i)` → reading lines
- `editor.replaceRange(text, from, to)` → writing back
- `new Notice(...)` → user notification

The **pure, testable parts** are:

1. Extracting the body string from a line array and a fence range
2. Computing `from`/`to` positions from the fence range
3. Normalizing the trailing newline on the formatted output

### Where the pure helpers live in `src/utils.ts`

The end of `src/utils.ts` currently exports `hasWikidataImport` and
`extractTimelineTitle`. Add new helpers after those. (After Plan 001 lands,
`parseScaleSetting` and `parseLaneHeightSetting` will also be there.)

### Relevant imports already in `src/main.ts`

```ts
import { findTdslFenceAtCursor } from "./fence";
import type { TdslFenceRange } from "./fence";   // may or may not exist yet
```

`TdslFenceRange` is the type `{ openLine: number; closeLine: number }` exported
from `src/fence.ts`.

### Existing test pattern to follow

`src/fence.test.ts` tests `findTdslFenceAtCursor` with plain string arrays.
Use the same pattern for the body-extraction helper.

### Repo conventions

- Biome format: double quotes, trailing commas, semicolons, tabs.
- All exported helpers in `src/utils.ts` have a short JSDoc one-liner.
- Types flow from `src/fence.ts` (`TdslFenceRange`) and `src/utils.ts`
  (`TdslSettings`, etc.) — do not duplicate them.

## Commands you will need

| Purpose     | Command               | Expected on success          |
|-------------|----------------------|------------------------------|
| Typecheck   | `npm run typecheck`  | exit 0, no output            |
| Tests       | `npm test`           | all pass (0 failures)        |
| Lint        | `npm run lint`       | exit 0                       |
| Format      | `npm run format`     | exit 0                       |

## Scope

**In scope** (the only files you should modify):

- `src/utils.ts` — add the three new pure helpers
- `src/utils.test.ts` — add test cases for the three helpers
- `src/main.ts` — import and call the new helpers; shrink `formatCurrentBlock`

**Out of scope** (do NOT touch):

- `src/fence.ts` / `src/fence.test.ts` — fence detection already tested
- `src/wasm-init.ts`, `src/obsidian-rerender.ts` — unrelated
- `vitest.config.ts` — covered by Plan 001
- `.github/workflows/ci.yml` — covered by Plan 003
- `main.js` — generated artifact

## Git workflow

- Branch: `advisor/002-test-format-current-block`
- Commits (example): `refactor: extract formatCurrentBlock pure helpers to utils`
  then `test: add unit tests for block body extraction and replacement helpers`

## Steps

### Step 1: Add three pure helpers to `src/utils.ts`

Append after the last exported function in `src/utils.ts`:

```ts
// ---------------------------------------------------------------------------
// Format-command helpers (pure, Obsidian-free, testable)
// ---------------------------------------------------------------------------

/**
 * Extracts the body string from a line array given a fence range.
 * Returns the joined text of lines openLine+1 .. closeLine-1 (exclusive).
 */
export function extractFenceBody(
 lines: readonly string[],
 openLine: number,
 closeLine: number,
): string {
 const bodyLines: string[] = [];
 for (let i = openLine + 1; i < closeLine; i++) {
  bodyLines.push(lines[i] ?? "");
 }
 return bodyLines.join("\n");
}

/**
 * Returns the editor `from`/`to` positions for the body of a fence block.
 * `from` is the start of the first body line; `to` is the start of the
 * closing fence line (so `replaceRange` replaces exactly the body and the
 * trailing newline before the closing ``` ).
 */
export function fenceBodyRange(
 openLine: number,
 closeLine: number,
): { from: { line: number; ch: number }; to: { line: number; ch: number } } {
 return {
  from: { line: openLine + 1, ch: 0 },
  to: { line: closeLine, ch: 0 },
 };
}

/**
 * Ensures `text` ends with exactly one newline character.
 * Used to guarantee the closing ``` appears on its own line after the
 * formatted body.
 */
export function ensureTrailingNewline(text: string): string {
 return text.endsWith("\n") ? text : text + "\n";
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 2: Update `formatCurrentBlock` in `src/main.ts` to use the helpers

Add the three new imports to the `from "./utils"` import block:

```ts
import {
 // ... existing imports ...
 extractFenceBody,
 fenceBodyRange,
 ensureTrailingNewline,
} from "./utils";
```

Then replace the body-extraction and replacement sections inside
`formatCurrentBlock`. The function after the change should look like:

```ts
function formatCurrentBlock(editor: Editor): void {
 const cursor = editor.getCursor();
 const lines: string[] = [];
 for (let i = 0; i < editor.lineCount(); i++) {
  lines.push(editor.getLine(i));
 }

 const fence = findTdslFenceAtCursor(lines, cursor.line);
 if (fence.status === "not-in-block") {
  new Notice("Timeline DSL: カーソルが tdsl ブロック内にありません。");
  return;
 }
 if (fence.status === "missing-close") {
  new Notice("Timeline DSL: tdsl ブロックの閉じ素が見つかりません。");
  return;
 }
 const { openLine, closeLine } = fence.range;

 const body = extractFenceBody(lines, openLine, closeLine);

 let formatted: string;
 try {
  formatted = format_source(body);
 } catch (e) {
  new Notice(`Timeline DSL 整形エラー:\n${String(e)}`);
  return;
 }

 const { from, to } = fenceBodyRange(openLine, closeLine);
 editor.replaceRange(ensureTrailingNewline(formatted), from, to);
 new Notice("✔ Timeline DSL ブロックを整形しました。");
}
```

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Add unit tests to `src/utils.test.ts`

Add the three new function names to the top-level import from `"./utils"` in
`src/utils.test.ts`, then append the following `describe` blocks at the end of
the file:

```ts
import {
 // ... existing imports ...
 extractFenceBody,
 fenceBodyRange,
 ensureTrailingNewline,
} from "./utils";
```

```ts
// ----------------------------------------------------------------------------
// extractFenceBody
// ----------------------------------------------------------------------------

describe("extractFenceBody", () => {
 const lines = ["```tdsl", "timeline {}", "lane a {}", "```"];

 it("returns the body lines joined by newline", () => {
  // openLine=0, closeLine=3 → body is lines 1 and 2
  expect(extractFenceBody(lines, 0, 3)).toBe("timeline {}\nlane a {}");
 });

 it("returns empty string when the fence has no body", () => {
  // openLine=0, closeLine=1 → no lines between them
  expect(extractFenceBody(["```tdsl", "```"], 0, 1)).toBe("");
 });

 it("returns a single-line body without a trailing newline", () => {
  expect(extractFenceBody(["```tdsl", "timeline {}", "```"], 0, 2)).toBe(
   "timeline {}",
  );
 });
});

// ----------------------------------------------------------------------------
// fenceBodyRange
// ----------------------------------------------------------------------------

describe("fenceBodyRange", () => {
 it("returns from = openLine+1, ch=0 and to = closeLine, ch=0", () => {
  expect(fenceBodyRange(2, 7)).toEqual({
   from: { line: 3, ch: 0 },
   to: { line: 7, ch: 0 },
  });
 });

 it("works when openLine is 0", () => {
  expect(fenceBodyRange(0, 5)).toEqual({
   from: { line: 1, ch: 0 },
   to: { line: 5, ch: 0 },
  });
 });
});

// ----------------------------------------------------------------------------
// ensureTrailingNewline
// ----------------------------------------------------------------------------

describe("ensureTrailingNewline", () => {
 it("adds a newline when the text has none", () => {
  expect(ensureTrailingNewline("hello")).toBe("hello\n");
 });

 it("does not add a second newline when one already exists", () => {
  expect(ensureTrailingNewline("hello\n")).toBe("hello\n");
 });

 it("handles empty string by adding a newline", () => {
  expect(ensureTrailingNewline("")).toBe("\n");
 });

 it("preserves internal newlines", () => {
  expect(ensureTrailingNewline("a\nb\nc")).toBe("a\nb\nc\n");
 });
});
```

**Verify**: `npm test` → all tests pass; confirm the new describe blocks appear
in the output.

### Step 4: Format

Run `npm run format` to apply Biome formatting to the changed files.

**Verify**: `npm run format:check` → exit 0.

## Test plan

New tests in `src/utils.test.ts`:

| Helper | Cases |
|---|---|
| `extractFenceBody` | multi-line body; empty body (adjacent fences); single-line body |
| `fenceBodyRange` | general case; openLine=0 |
| `ensureTrailingNewline` | no trailing newline; already has one; empty string; internal newlines preserved |

Model after the `describe("formatLintIssues", ...)` block at the bottom of the
existing `src/utils.test.ts`.

Verification: `npm test` → exits 0.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; `describe("extractFenceBody")`, `describe("fenceBodyRange")`,
  and `describe("ensureTrailingNewline")` blocks exist and all their tests pass
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` exits 0
- [ ] `grep -n 'extractFenceBody\|fenceBodyRange\|ensureTrailingNewline' src/utils.ts`
  shows the three exported function definitions
- [ ] The original inline body-extraction for-loop is removed from `formatCurrentBlock`
  in `src/main.ts` (`grep -n 'bodyLines.push' src/main.ts` returns no matches)
- [ ] Only the in-scope files are modified (`git diff --name-only` shows no surprises)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- The code at `src/main.ts:362-402` doesn't match the excerpts in "Current state"
  (the codebase has drifted — treat as a mismatch, re-read the live file, and
  adapt accordingly or stop and report).
- `npm run typecheck` still fails after a careful re-check of the import list.
- Any step requires touching a file outside the in-scope list.
- The existing tests in `src/fence.test.ts` start failing — that indicates an
  accidental change to `fence.ts` or a naming collision.

## Maintenance notes

- `extractFenceBody`, `fenceBodyRange`, and `ensureTrailingNewline` are generic
  enough that a future "fix lint issues in block" command could reuse them
  without modification.
- If the fence syntax ever changes (e.g. to support `~~~tdsl`), `fence.ts` and
  the related helpers here both need to be updated.
- After this plan lands, consider raising the coverage thresholds in
  `vitest.config.ts` (from 60% to something higher) to reflect the improved
  coverage baseline.
