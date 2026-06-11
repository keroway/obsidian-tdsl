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
npm run dev        # watch mode — rebuilds main.js on every save
npm run build      # one-shot production build
npm run lint       # ESLint (src/)
npm run typecheck  # TypeScript type-check without emitting files
```

### Testing in Obsidian

1. Run `npm run build` (or keep `npm run dev` running in a terminal)
2. Copy `main.js`, `manifest.json`, and `styles.css` into your test vault:
   ```sh
   cp main.js manifest.json styles.css <vault>/.obsidian/plugins/obsidian-tdsl/
   ```
3. In Obsidian: **Settings → Community plugins** → reload or toggle the plugin

## Architecture overview

The entire plugin logic lives in a single source file, `src/main.ts` (~90 lines).

All heavy processing — DSL parsing, semantic analysis, SVG rendering — is delegated to the [`@keroway/tdsl-wasm`](https://www.npmjs.com/package/@keroway/tdsl-wasm) package, which is the WASM build of the [keroway/timeline-dsl](https://github.com/keroway/timeline-dsl) Rust compiler.

The WASM binary is inlined at build time by esbuild (`loader: { '.wasm': 'binary' }`), so the final `main.js` contains everything and makes no network requests at runtime.

Key functions used from `@keroway/tdsl-wasm`:
- `init(wasmBinary)` — initialises the WASM module (called once via `ensureWasm()`)
- `check_source(source)` — returns diagnostic JSON (`{ severity, message, line, col }[]`)
- `render_svg_from_source(source, 0)` — renders the source to an SVG string

## CI

The `.github/workflows/ci.yml` workflow runs on every push and pull request to `main`:

1. `npm ci`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run build`
5. `test -f main.js` — verifies the build artefact exists

All four checks must pass before merging.

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

## Upstream dependency

This plugin tracks `@keroway/tdsl-wasm` releases. When a new version of [keroway/timeline-dsl](https://github.com/keroway/timeline-dsl) is published to npm, update `package.json` and test that the new DSL syntax works correctly in Obsidian.
