# Plan 001: Extract settings-coercion helpers to utils.ts and add unit tests + vitest config

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

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt / tests
- **Planned at**: commit `6afabb2`, 2026-06-28

## Why this matters

`parseScaleSetting` and `parseLaneHeightSetting` are pure coercion functions —
no Obsidian API, no WASM dependency — but they live in `src/main.ts` and have
zero unit tests. They handle arbitrary free-text user input from the settings
tab. If they silently produce a wrong value (e.g. accept `0` as a valid scale),
every block the user has configured will render incorrectly with no error
message. Moving them to `utils.ts` (where all other pure helpers already live)
and testing them closes this gap. As a bonus, adding a minimal `vitest.config.ts`
and a coverage step gives the CI an automated signal if future code regresses on
coverage.

## Current state

### Functions to move

`src/main.ts` lines 338–351 (at the very bottom of the file, just before the
`formatCurrentBlock` function):

```ts
// src/main.ts:338-351
function parseLaneHeightSetting(raw: string): number {
 const n = Math.floor(Number(raw.trim()));
 return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Coerces the free-text scale setting into `"auto" | "fit" | number`. */
function parseScaleSetting(raw: string): TdslSettings["scale"] {
 const v = raw.trim().toLowerCase();
 if (v === "fit") return "fit";
 const n = Number(v);
 if (v !== "" && v !== "auto" && Number.isFinite(n) && n > 0) return n;
 return "auto";
}
```

These functions are called in the settings tab (inside `TdslSettingTab.display()`):

- `src/main.ts:301`: `this.plugin.settings.scale = parseScaleSetting(raw);`
- `src/main.ts:330`: `this.plugin.settings.laneHeight = parseLaneHeightSetting(raw);`

### Where to add them

`src/utils.ts` already exports all other pure helpers. The end of that file
currently looks like:

```ts
// src/utils.ts (last section, after formatLintIssues)
/** Returns true when the source contains an `import wikidata` block. */
export function hasWikidataImport(source: string): boolean { ... }

/** Extracts the timeline title ... */
export function extractTimelineTitle(source: string): string | null { ... }
```

Add the two new exports after `extractTimelineTitle`.

### Existing test pattern to follow

`src/utils.test.ts` is the file to add tests to. Every test group follows this
pattern:

```ts
describe("functionName", () => {
  it("description", () => {
    expect(functionName(input)).toEqual(expectedOutput);
  });
});
```

No mocks needed — all these functions are pure.

### Repo conventions

- Format: Biome (`biome.json`): double quotes, trailing commas, semicolons, tab
  indent. Run `npm run format` to auto-apply.
- Exports: named exports only, no default exports from `utils.ts`.
- JSDoc: short one-liner before each exported function (look at `hasWikidataImport`
  as an example).

## Commands you will need

| Purpose     | Command               | Expected on success          |
|-------------|----------------------|------------------------------|
| Typecheck   | `npm run typecheck`  | exit 0, no output            |
| Tests       | `npm test`           | all pass (0 failures)        |
| Lint        | `npm run lint`       | exit 0, no warnings          |
| Format      | `npm run format`     | exit 0 (applies Biome fixes) |

## Scope

**In scope** (the only files you should modify):

- `src/utils.ts` — add the two exported functions
- `src/utils.test.ts` — add test cases for both functions
- `src/main.ts` — remove the two local functions; update import from `./utils`
- `vitest.config.ts` (create at repo root) — minimal config with coverage
- `package.json` — add a `test:coverage` script

**Out of scope** (do NOT touch):

- `src/wasm-init.ts`, `src/fence.ts`, `src/obsidian-rerender.ts` — unrelated
- `esbuild.config.mjs`, `biome.json`, `eslint.config.mjs` — build/tooling config
- `.github/workflows/ci.yml` — covered by Plan 003
- `main.js` — generated artifact, never edit by hand

## Git workflow

- Branch: `advisor/001-extract-settings-parsers-to-utils`
- Conventional commits: `refactor: move settings coercion helpers to utils.ts`
  then `test: add unit tests for parseScaleSetting and parseLaneHeightSetting`
  (see `git log --oneline` for the style: lowercase type, colon, short imperative
  present-tense description)
- Do NOT push or open a PR.

## Steps

### Step 1: Add the two functions to `src/utils.ts`

Open `src/utils.ts`. At the very end of the file (after `extractTimelineTitle`),
add:

```ts
/** Coerces the free-text `scale` setting value into `"auto" | "fit" | number`. */
export function parseScaleSetting(raw: string): TdslSettings["scale"] {
 const v = raw.trim().toLowerCase();
 if (v === "fit") return "fit";
 const n = Number(v);
 if (v !== "" && v !== "auto" && Number.isFinite(n) && n > 0) return n;
 return "auto";
}

/** Coerces the free-text `lane_height` setting value into a non-negative integer (0 = renderer default). */
export function parseLaneHeightSetting(raw: string): number {
 const n = Math.floor(Number(raw.trim()));
 return Number.isFinite(n) && n > 0 ? n : 0;
}
```

Note: `TdslSettings` is already defined in `src/utils.ts` (the `export interface
TdslSettings` block), so no additional import is needed.

**Verify**: `npm run typecheck` → exit 0, no errors.

### Step 2: Remove the two functions from `src/main.ts` and update the import

In `src/main.ts`:

1. **Delete** the two function bodies at lines 338–351 (the `parseLaneHeightSetting`
   and `parseScaleSetting` functions).

2. **Update** the existing import from `"./utils"` at the top of `src/main.ts`
   to include the two new exports. The import block currently looks like:

```ts
import {
 hasWikidataImport,
 extractTimelineTitle,
 parseDiagnostics,
 filterErrors,
 filterWarnings,
 filterInfos,
 formatDiagnosticMessages,
 parseLintIssues,
 formatLintIssues,
 parseRenderDirectives,
 resolveRenderOptions,
 DEFAULT_SETTINGS,
 type TdslSettings,
} from "./utils";
```

Add `parseScaleSetting` and `parseLaneHeightSetting` to that list (alphabetical
order is not required; append at the end before `type TdslSettings`).

**Verify**: `npm run typecheck` → exit 0. (If there is a "not found" error for
either function name, you have a typo in the export or the import.)

### Step 3: Add unit tests to `src/utils.test.ts`

Open `src/utils.test.ts`. Add two new `describe` blocks at the end of the file
(after the last existing `describe`). Add the following import to the top-of-file
import list:

```ts
import {
  ...,          // existing imports — keep them
  parseScaleSetting,
  parseLaneHeightSetting,
} from "./utils";
```

Then append the test cases:

```ts
// ----------------------------------------------------------------------------
// parseScaleSetting
// ----------------------------------------------------------------------------

describe("parseScaleSetting", () => {
  it('returns "auto" for empty string', () => {
    expect(parseScaleSetting("")).toBe("auto");
  });
  it('returns "auto" for the literal "auto"', () => {
    expect(parseScaleSetting("auto")).toBe("auto");
  });
  it('returns "auto" for whitespace-only input', () => {
    expect(parseScaleSetting("  ")).toBe("auto");
  });
  it('returns "fit" for "fit"', () => {
    expect(parseScaleSetting("fit")).toBe("fit");
  });
  it('returns "fit" regardless of case', () => {
    expect(parseScaleSetting("FIT")).toBe("fit");
  });
  it("returns the numeric value for a positive number string", () => {
    expect(parseScaleSetting("5")).toBe(5);
  });
  it("returns the numeric value for a decimal positive number", () => {
    expect(parseScaleSetting("2.5")).toBe(2.5);
  });
  it('returns "auto" for "0" (zero is not a valid scale)', () => {
    expect(parseScaleSetting("0")).toBe("auto");
  });
  it('returns "auto" for a negative number string', () => {
    expect(parseScaleSetting("-3")).toBe("auto");
  });
  it('returns "auto" for non-numeric garbage', () => {
    expect(parseScaleSetting("banana")).toBe("auto");
  });
});

// ----------------------------------------------------------------------------
// parseLaneHeightSetting
// ----------------------------------------------------------------------------

describe("parseLaneHeightSetting", () => {
  it("returns 0 for empty string", () => {
    expect(parseLaneHeightSetting("")).toBe(0);
  });
  it("returns 0 for whitespace-only input", () => {
    expect(parseLaneHeightSetting("  ")).toBe(0);
  });
  it("returns the integer for a positive integer string", () => {
    expect(parseLaneHeightSetting("40")).toBe(40);
  });
  it("truncates decimals (floor)", () => {
    expect(parseLaneHeightSetting("45.9")).toBe(45);
  });
  it("returns 0 for zero", () => {
    expect(parseLaneHeightSetting("0")).toBe(0);
  });
  it("returns 0 for a negative number string", () => {
    expect(parseLaneHeightSetting("-10")).toBe(0);
  });
  it("returns 0 for non-numeric garbage", () => {
    expect(parseLaneHeightSetting("abc")).toBe(0);
  });
});
```

**Verify**: `npm test` → all tests pass; confirm the count of passing tests
increased by the number of new `it()` calls you added.

### Step 4: Add `vitest.config.ts` at the repo root

Create `vitest.config.ts` with this content:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
 test: {
  environment: "node",
  include: ["src/**/*.test.ts"],
  coverage: {
   provider: "v8",
   include: ["src/**/*.ts"],
   exclude: ["src/**/*.test.ts", "src/wasm.d.ts"],
   thresholds: {
    lines: 60,
    functions: 60,
   },
  },
 },
});
```

The thresholds (60%) are conservative for an initial gate; they can be raised
once coverage is measured. `provider: "v8"` requires no extra install — vitest
ships with v8 coverage support built in.

**Verify**: `npm test` → still exits 0 (the config must not break the existing
test run).

### Step 5: Add a `test:coverage` script to `package.json`

In `package.json`, add one entry to the `"scripts"` object:

```json
"test:coverage": "vitest run --coverage"
```

(Add it after the existing `"test": "vitest run"` line.)

**Verify**: `npm run test:coverage` → exits 0, prints a coverage table to
stdout. All lines/functions should be ≥ 60%.

### Step 6: Format

Run `npm run format` to ensure Biome is happy with the new files. If it
reports format changes, the changes are automatically applied; commit them.

**Verify**: `npm run format:check` → exit 0.

## Test plan

- New tests live in `src/utils.test.ts` (the existing test file for utils helpers).
- Pattern: follow the `describe("formatLintIssues", ...)` block at the bottom of
  the existing file as a structural model.
- Cases to cover (as listed in Step 3): empty, whitespace, `"auto"`, `"fit"`,
  case-insensitive `"fit"`, positive decimal, zero, negative, garbage string.
- Verification: `npm test` → all pass including the N new cases.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm test` exits 0; the new `describe("parseScaleSetting")` and
  `describe("parseLaneHeightSetting")` blocks exist in `src/utils.test.ts`
  and all their tests pass
- [ ] `npm run lint` exits 0
- [ ] `npm run format:check` exits 0
- [ ] `grep -n 'function parseLaneHeightSetting\|function parseScaleSetting' src/main.ts`
  returns no matches
- [ ] `grep -n 'parseScaleSetting\|parseLaneHeightSetting' src/utils.ts`
  shows the two exported function definitions
- [ ] `vitest.config.ts` exists at the repo root
- [ ] `package.json` contains a `"test:coverage"` script
- [ ] Only the in-scope files are modified (`git diff --name-only` shows no
  surprises)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- The code at `src/main.ts:338-351` doesn't match the excerpts in "Current state"
  (the file has drifted — check the drift command at the top).
- `npm run typecheck` reports an error referencing `parseScaleSetting` or
  `parseLaneHeightSetting` after Step 2 even after a careful re-check of the
  import list.
- `npm run test:coverage` reports overall function or line coverage below 60%
  after Step 5 — raise the threshold value to just below the reported number
  rather than silently ignoring it (then note it in the PR description).
- Any step requires touching a file outside the in-scope list.

## Maintenance notes

- If new settings fields are added to `TdslSettings` in the future, their
  coercion helpers should also go into `utils.ts` (not `main.ts`) so they are
  testable from the start.
- The coverage thresholds in `vitest.config.ts` should be raised incrementally
  as Plan 002 lands (which will add coverage for `formatCurrentBlock` helpers).
- The `test:coverage` script is intentionally a separate command (not replacing
  `test`) so the fast test-only run stays the primary local workflow.
