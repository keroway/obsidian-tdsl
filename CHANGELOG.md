# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-05-31

### Added

- **SVG timeline preview** — `tdsl` fenced code blocks are rendered as SVG in Obsidian's live preview and reading view
- **WASM renderer** — `@keroway/tdsl-wasm` is bundled inline via esbuild binary loader; no `fetch` or external network requests at render time
- **Inline syntax error display** — Parse and semantic errors from `check_source()` are shown with line/column numbers inside the note
- **Dark mode support** — `styles.css` uses `body.theme-dark` to apply Catppuccin-style dark colours to the SVG output (backgrounds, axis, labels, spans, events)
- **XSS-safe SVG insertion** — SVG strings are parsed with `DOMParser` and inserted via `document.adoptNode`; `innerHTML` is never used on untrusted SVG
- **Wikidata limitation notice** — If the source contains `import wikidata`, a notice is displayed explaining that Wikidata imports are not executed inside Obsidian; only static items are rendered
- **Mobile support** — `isDesktopOnly: false` in `manifest.json`; the plugin works on Obsidian Mobile
- **CI workflow** — GitHub Actions runs ESLint → `tsc --noEmit` → esbuild → verifies `main.js` is produced on every push and pull request to `main`

[Unreleased]: https://github.com/keroway/obsidian-tdsl/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/keroway/obsidian-tdsl/releases/tag/v0.1.0
