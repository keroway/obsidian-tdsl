# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Mobile claim tone-down** — README no longer asserts the plugin "works" on mobile; `isDesktopOnly: false` means it is not blocked from running on Obsidian Mobile, but this has not been extensively verified on iOS/Android devices or emulators

## [1.0.0] - 2026-07-11

### Changed

- **BREAKING: plugin id renamed** — `obsidian-tdsl` → `timeline-dsl` in `manifest.json`. The plugin folder in the vault must be renamed to `.obsidian/plugins/timeline-dsl/`; settings stored under the old id are not migrated
- **Settings apply immediately** — changing a default in the settings tab re-renders every open Markdown preview instead of requiring the note to be reopened
- **Renderer bumped to `@keroway/tdsl-wasm` 1.23.0** — adds the `legend` directive and the render options the plugin now passes through
- **Biome replaces ESLint** — lint and format are unified on Biome (`biome.json`), matching the workspace toolchain
- **Docs follow the current DSL grammar** — README rendering-option and syntax sections were rewritten against the shipped compiler

### Added

- **Settings tab defaults** — vault-wide defaults for theme / grid / scale / event labels, plus a Default lane height field
- **`//! scale: fit`** — shrinks the timeline to the note width instead of scrolling horizontally
- **`//! lane_height: N`** — vertical pixels per lane, with a matching settings default
- **`//! legend: on`** — renders a static legend panel showing lane and tag colours
- **Non-blocking diagnostics** — `warning` / `info` results are surfaced alongside the rendered diagram rather than replacing it
- **Lint display** — `lint_source()` results are shown under the diagram
- **Format command** — formats the `tdsl` block under the cursor
- **Theme-aware lane colours** — `--tdsl-lane-N` CSS variables let Obsidian themes override the palette
- **Accessibility attributes** — the inserted root `<svg>` carries a role and `aria-label`
- **Release automation** — a GitHub Release workflow attaches the `main.js` / `manifest.json` / `styles.css` distribution set, and `version-bump.mjs` keeps the three version files in sync
- **Unit test base** — Vitest covers the pure helpers in `src/utils.ts` and the preview re-render helper
- **Repository docs** — Issue / PR templates, `SECURITY.md` upstream-dependency section, and third-party licence attribution for `@keroway/tdsl-wasm`
- **README screenshots** — light and dark preview images

### Fixed

- **`table` directive was ignored** on the SVG render path
- **Concurrent WASM initialization** could run `init()` twice when several blocks rendered at once
- **Format command** no longer acts when the cursor is outside a `tdsl` block

## [0.1.0] - 2026-05-31

### Added

- **SVG timeline preview** — `tdsl` fenced code blocks are rendered as SVG in Obsidian's live preview and reading view
- **WASM renderer** — `@keroway/tdsl-wasm` is bundled inline via esbuild binary loader; no `fetch` or external network requests at render time
- **Inline syntax error display** — Parse and semantic errors from `check_source()` are shown with line/column numbers inside the note
- **Dark mode support** — `styles.css` uses `body.theme-dark` to apply Catppuccin-style dark colours to the SVG output (backgrounds, axis, labels, spans, events)
- **XSS-safe SVG insertion** — SVG strings are parsed with `DOMParser` and inserted via `document.adoptNode`; `innerHTML` is never used on untrusted SVG
- **Wikidata limitation notice** — If the source contains `import wikidata`, a notice is displayed explaining that Wikidata imports are not executed inside Obsidian; only static items are rendered
- **Mobile-enabled** — `isDesktopOnly: false` in `manifest.json`, so the plugin is not blocked from running on Obsidian Mobile (not extensively verified on-device; see Unreleased)
- **CI workflow** — GitHub Actions runs ESLint → `tsc --noEmit` → esbuild → verifies `main.js` is produced on every push and pull request to `main`

[Unreleased]: https://github.com/keroway/obsidian-tdsl/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/keroway/obsidian-tdsl/compare/v0.1.0...v1.0.0
[0.1.0]: https://github.com/keroway/obsidian-tdsl/releases/tag/v0.1.0
