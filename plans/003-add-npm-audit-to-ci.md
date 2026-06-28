# Plan 003: Add npm audit to CI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 6afabb2..HEAD -- .github/workflows/ci.yml`
> If the file changed since this plan was written, compare the "Current state"
> excerpt against the live file before proceeding.

## Status

- **Priority**: P2
- **Effort**: XS
- **Risk**: LOW
- **Depends on**: none
- **Category**: security / dx
- **Planned at**: commit `6afabb2`, 2026-06-28

## Why this matters

The current CI pipeline (test, lint, typecheck, build) never runs `npm audit`.
At the time of writing, `npm audit` returns 0 vulnerabilities, but there is no
automated check to catch a future advisory on `@keroway/tdsl-wasm` or any of
the dev dependencies (biome, esbuild, typescript, vitest, eslint). Adding a
`--audit-level=high` check to CI ensures a high or critical advisory causes the
CI to fail visibly before a release artifact is built. Low and moderate
advisories are not automatically blocking (Obsidian plugins have no server-side
attack surface), but the check records their presence in CI logs.

## Current state

`.github/workflows/ci.yml` defines four jobs: `test`, `lint`, `typecheck`,
`build`. Each installs dependencies with `npm ci` on Node 22 and runs one
script. The `build` job ends with `test -f main.js`.

The file currently has no `audit` step anywhere.

```yaml
# .github/workflows/ci.yml (relevant top section)
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci
      - name: Test
        run: npm test

  lint:
    ...
```

## Commands you will need

| Purpose       | Command                             | Expected on success   |
|---------------|-------------------------------------|-----------------------|
| Local audit   | `npm audit --audit-level=high`      | exit 0 (0 vulns)      |

## Scope

**In scope** (the only file to modify):

- `.github/workflows/ci.yml`

**Out of scope** (do NOT touch):

- Any source file under `src/`
- `package.json`, `package-lock.json`
- `main.js`

## Git workflow

- Branch: `advisor/003-add-npm-audit-to-ci`
- Commit: `chore(ci): add npm audit step to CI`

## Steps

### Step 1: Add an `audit` job to `.github/workflows/ci.yml`

Add the following job at the end of the `jobs:` block in
`.github/workflows/ci.yml`. Place it after the `build:` job:

```yaml
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - name: Setup Node.js
        uses: actions/setup-node@v6
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Security audit
        run: npm audit --audit-level=high
```

The `--audit-level=high` flag makes the step fail only on HIGH or CRITICAL
advisories. Moderate and low advisories are printed in the log but do not
block CI. This matches the project's risk profile (desktop Obsidian plugin,
no server-side code, no user data transmitted).

**Verify** (local): `npm audit --audit-level=high` → exit 0, reports
"found 0 vulnerabilities".

### Step 2: Commit

```
git add .github/workflows/ci.yml
git commit -m "chore(ci): add npm audit step to CI"
```

## Done criteria

- [ ] `.github/workflows/ci.yml` contains an `audit:` job with a
  `npm audit --audit-level=high` step
- [ ] `npm audit --audit-level=high` exits 0 locally
- [ ] No files outside `.github/workflows/ci.yml` are modified
  (`git diff --name-only`)
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

- `npm audit --audit-level=high` exits non-zero locally — do NOT commit. Report
  the advisory details (package name, severity, CVE) back to the maintainer for
  triage before landing this change.
- The `.github/workflows/ci.yml` file structure has changed significantly from
  the excerpt above and the new job cannot be appended cleanly — stop and report.

## Maintenance notes

- If a future advisory fires in CI and it is a dev-dependency that cannot be
  immediately upgraded, the standard response is `npm audit fix` or, if no
  fix is available, a temporary `npm audit --audit-level=critical` (raising the
  threshold) with a GitHub issue tracking the pending upgrade.
- `--audit-level=high` is the right default for a plugin with no server-side
  component. If the project ever gains a backend or handles sensitive user data,
  lower the threshold to `--audit-level=moderate`.
