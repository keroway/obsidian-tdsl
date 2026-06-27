# Contributing to obsidian-tdsl

Thank you for your interest in contributing!

## Requirements

| Tool | Version |
|---|---|
| Node.js | 22 (LTS) |
| npm | bundled with Node 22 |

## Setup

```sh
git clone https://github.com/keroway/obsidian-tdsl.git
cd obsidian-tdsl
npm ci
```

## Development workflow

```sh
npm run dev           # watch mode — rebuilds main.js on every save
npm run build         # one-shot production build
npm test              # Vitest unit tests
npm run lint          # ESLint (src/)
npm run format:check  # Biome formatter check
npm run typecheck     # TypeScript type-check without emitting files
```

### Testing in Obsidian

1. Run `npm run build` (or keep `npm run dev` running in a terminal)
2. Copy `main.js`, `manifest.json`, and `styles.css` into your test vault:

   ```sh
   cp main.js manifest.json styles.css <vault>/.obsidian/plugins/obsidian-tdsl/
   ```

3. In Obsidian: **Settings → Community plugins** → reload or toggle the plugin

## Architecture overview

The plugin entry point is `src/main.ts`. It wires Obsidian's plugin API to the Timeline DSL renderer:

- registers the `tdsl` Markdown code-block processor
- defines the preview renderer and XSS-safe SVG/table insertion path
- exposes the settings tab and re-renders open Markdown previews after settings changes
- registers the command that formats the current `tdsl` fenced block

Small, testable helpers live beside it:

- `src/utils.ts` — pure directive parsing, settings resolution, diagnostics, and lint formatting helpers
- `src/fence.ts` — fenced-code-block detection for the format command
- `src/wasm-init.ts` — single-flight WASM initialization guard
- `src/obsidian-rerender.ts` — structural wrapper around Obsidian's preview re-render hook

All heavy processing — DSL parsing, semantic analysis, linting, formatting, SVG rendering, and HTML table rendering — is delegated to the [`@keroway/tdsl-wasm`](https://www.npmjs.com/package/@keroway/tdsl-wasm) package, which is the WASM build of the [keroway/timeline-dsl](https://github.com/keroway/timeline-dsl) Rust compiler.

The WASM binary is inlined at build time by esbuild (`loader: { '.wasm': 'binary' }`), so the final `main.js` contains everything and makes no network requests at runtime.

Key functions used from `@keroway/tdsl-wasm`:

- `init(wasmBinary)` — initialises the WASM module (guarded by `ensureWasm()`)
- `check_source(source)` — returns diagnostic JSON (`{ severity, message, line, col }[]`)
- `lint_source(source)` — returns lint issue JSON for non-blocking warnings
- `format_source(source)` — formats the current `tdsl` block for the editor command
- `render_svg_from_source_with_options(source, scale, options)` — renders the timeline SVG
- `render_html_from_source_with_options(source, options)` — renders the optional data table HTML

## CI

The `.github/workflows/ci.yml` workflow runs on every push and pull request to `main`:

1. `npm ci`
2. `npm test`
3. `npm run format:check`
4. `npm run lint`
5. `npm run typecheck`
6. `npm run build`
7. `test -f main.js` — verifies the build artefact exists

All CI checks must pass before merging.

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add <feature>
fix: fix <bug>
chore: <tooling/scaffolding change>
docs: update documentation
refactor: refactor without behaviour change
style: formatting only
```

## Upstream dependencies

This plugin tracks `@keroway/tdsl-wasm` releases. When a new version of [keroway/timeline-dsl](https://github.com/keroway/timeline-dsl) is published to npm, update `package.json` and test that the new DSL syntax works correctly in Obsidian.

The `obsidian` dev dependency is pinned to the API typings version used for local and CI verification. Update it intentionally with `npm install --save-dev --save-exact obsidian@<version>`, then run the full verification suite and smoke-test the plugin in Obsidian.
