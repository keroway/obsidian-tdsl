# obsidian-tdsl

[![CI](https://github.com/keroway/obsidian-tdsl/actions/workflows/ci.yml/badge.svg)](https://github.com/keroway/obsidian-tdsl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/keroway/obsidian-tdsl)](./LICENSE)
[![npm: @keroway/tdsl-wasm](https://img.shields.io/npm/v/@keroway/tdsl-wasm?label=npm%20%40keroway%2Ftdsl-wasm)](https://www.npmjs.com/package/@keroway/tdsl-wasm)
[![timeline-dsl](https://img.shields.io/badge/upstream-keroway%2Ftimeline--dsl-blue)](https://github.com/keroway/timeline-dsl)

An [Obsidian](https://obsidian.md) plugin that renders [Timeline DSL](https://github.com/keroway/timeline-dsl) (`tdsl`) code blocks as interactive SVG timelines in the live preview.

> 日本語版: [README.ja.md](./README.ja.md)

## Preview

![Timeline DSL rendered in Obsidian (light mode)](docs/assets/preview-light.png)

![Timeline DSL rendered in Obsidian (dark mode)](docs/assets/preview-dark.png)

## Features

- **SVG timeline preview** — `tdsl` code blocks are rendered as SVG directly in the Obsidian live preview / reading view
- **Inline syntax errors** — Parse and semantic errors are shown with line/column numbers inside the note, without leaving the editor
- **Dark mode support** — Automatically follows Obsidian's `body.theme-dark` class; colour palette adapts to Catppuccin-style dark colours
- **XSS-safe SVG insertion** — SVG output is parsed via `DOMParser` and inserted with `document.adoptNode`; no `innerHTML`, no script execution
- **Mobile-enabled** — `isDesktopOnly: false`; the plugin is not blocked from running on Obsidian Mobile, but has not yet been extensively verified on iOS/Android. Feedback via [GitHub Issues](https://github.com/keroway/obsidian-tdsl/issues) is welcome.
- **Zero network requests** — The [Timeline DSL WASM](https://www.npmjs.com/package/@keroway/tdsl-wasm) renderer is bundled inline; no external calls at render time

## Usage

Write a `tdsl` fenced code block in any note:

````markdown
```tdsl
timeline "Heian Period" {
  unit year;
  range 794..1185;
}

lane "Emperor" as emperor {}

span emperor 781..806 "Kanmu" {};
span emperor 806..809 "Heizei" {};
span emperor 809..823 "Saga" {};
```

> **Syntax notes:** every property inside the `timeline { … }` block ends with `;`,
> ranges use `start..end` (not `start to end`), and each `span` / `event` /
> `event_range` statement ends with a trailing `;` after its `{ … }` block.
> `lane` and `group` declarations take **no** trailing `;`.
````

### Supported DSL features in Obsidian

The following DSL constructs work fully inside Obsidian:

#### `timeline` block

Declares the title, time unit, display range, and colour mappings.

```
timeline "Chinese Dynasties" {
    title "Chinese Dynasties";
    unit year;
    range -500..2000;
    color_map {
        dynasty: "#3366cc";
        war:     "#cc0000";
    }
}
```

`unit` accepts `year`, `month`, or `day`.

#### `lane` declaration

Defines a vertical category. Use `as` to assign an internal ID used by `span` / `event`.

```
lane "Han" as han { kind dynasty; order 20; }
```

#### `group` block

Groups multiple lanes with a shared label and visual boundary.

```
group "Ancient China" {
    lane "Qin" as qin { kind dynasty; order 10; }
    lane "Han" as han { kind dynasty; order 20; }
}
```

#### `span` / `event` / `event_range`

Three types of time elements attached to a lane:

```
// Duration (start..end) — note the trailing ; after the block
span han -206..220 "Han Dynasty" { tags ["dynasty"]; };

// Point event
event han -209 "Dazexiang Uprising" {};

// Range event (wars, disasters, etc.)
event_range han 184..204 "Yellow Turban Rebellion" { tags ["war"]; };
```

#### Rendering options (`//!` directives)

Because Obsidian only passes the code-block body to the renderer, per-diagram
options are written as `//!` comment lines (ordinary DSL comments the compiler
ignores). Place them anywhere in the block:

```tdsl
//! scale: 3
//! grid: decade
//! events: on
timeline "Demo" { unit year; range 0..100; }
lane "Main" as main {}
span main 10..50 "An era" {};
```

| Directive | Values | Effect |
|---|---|---|
| `scale` | positive number, or `fit` | pixels per year. Higher = wider / more readable. `fit` shrinks the timeline to the note width (no horizontal scroll). Omit for auto. |
| `grid` | `none`, `decade`, `year`, `month` | gridline density |
| `theme` | `default`, `dark`, `print`, `pastel` | built-in colour theme |
| `events` | `on` / `off` | show labels next to `event` / `event_range` items |
| `table` | `on` / `off` | render the accompanying item-listing table (drawn natively in the SVG) |
| `legend` | `on` / `off` | render a static legend panel showing lane and tag colors |
| `orientation` | `horizontal`, `vertical` | layout direction |

The timeline renders at its natural size; if it is wider than the note column it
scrolls horizontally rather than shrinking (which would make labels unreadable).
Use a numeric `scale` to make a sparse timeline span a wider area, or
`//! scale: fit` to shrink it to the note width for an at-a-glance view (labels
scale down with the graphic).

#### Default options (settings tab)

**Settings → Community plugins → Timeline DSL** lets you set vault-wide defaults
so you don't repeat the same directive in every block:

| Setting | Values | Default |
|---|---|---|
| Default theme | `auto`, `default`, `dark`, `print`, `pastel` | `auto` (follow Obsidian light/dark via plugin CSS) |
| Default grid | `none`, `decade`, `year`, `month` | `none` |
| Default scale | `auto`, `fit`, or a positive number | `auto` |
| Show event labels by default | on / off | off |

Resolution order is **block `//!` directive > settings default > built-in**.
Changes apply when you reopen the affected note.

### Full example

```tdsl
timeline "Japanese History" {
    title "Nara to Edo";
    unit year;
    range 710..1868;
    color_map {
        imperial: "#8b5cf6";
        military: "#ef4444";
    }
}

group "Imperial Court" {
    lane "Emperor" as emperor { kind imperial; order 1; }
}

group "Military Government" {
    lane "Kamakura Shogunate" as kamakura { kind military; order 2; }
    lane "Muromachi Shogunate" as muromachi { kind military; order 3; }
    lane "Edo Shogunate"       as edo      { kind military; order 4; }
}

span emperor 710..794 "Nara Period" { tags ["imperial"]; };
span emperor 794..1185 "Heian Period" { tags ["imperial"]; };

span kamakura  1185..1336 "Kamakura Shogunate" { tags ["military"]; };
span muromachi 1336..1573 "Muromachi Shogunate" { tags ["military"]; };
span edo       1603..1868 "Edo Shogunate" { tags ["military"]; };

event kamakura 1185 "Minamoto no Yoritomo appointed Shogun" {};
event edo      1868 "Meiji Restoration" {};
```

## Limitations

The following [Timeline DSL](https://github.com/keroway/timeline-dsl) features require network access or server-side processing and **are not supported** inside Obsidian:

| Feature | Reason |
|---|---|
| `import wikidata` | Wikidata HTTP requests cannot be made from the browser renderer |
| `map` blocks | Depend on resolved `import wikidata` data |
| `template` / `apply` syntax | Depend on resolved `import wikidata` data |

If a `tdsl` block contains `import wikidata`, the plugin displays a notice and renders only the static items (`span` / `event` / `event_range`) defined in the source.

For full Wikidata integration, use the [tdsl CLI](https://github.com/keroway/timeline-dsl) or the [WebUI](https://keroway.github.io/timeline-dsl/) to pre-render to SVG/HTML.

## Installation

### Community Plugin (coming soon)

The plugin is not yet listed in the Obsidian Community Plugin directory. Once published, it will be installable from **Settings → Community plugins → Browse** by searching for `Timeline DSL`.

### Manual installation (GitHub Release)

1. Go to the [Releases page](https://github.com/keroway/obsidian-tdsl/releases) and download the latest release assets:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Create the plugin directory in your vault (if it does not exist):

   ```sh
   mkdir -p <vault>/.obsidian/plugins/timeline-dsl/
   ```

3. Copy the three downloaded files into that directory.
4. In Obsidian: **Settings → Community plugins → Installed plugins** → enable **Timeline DSL**

> Requires Obsidian ≥ 1.4.0.

### Manual installation (development build)

1. Clone this repository
2. Install dependencies and build:

   ```sh
   npm install
   npm run build
   ```

3. Copy the three output files into your vault:

   ```sh
   # replace <vault> with your actual vault path
   cp main.js manifest.json styles.css <vault>/.obsidian/plugins/timeline-dsl/
   ```

4. In Obsidian: **Settings → Community plugins → Installed plugins** → enable **Timeline DSL**

> Requires Obsidian ≥ 1.4.0.

## Development

```bash
npm install          # install dependencies
npm run dev          # watch mode (rebuilds on save)
npm run build        # production build → main.js
npm run lint         # ESLint (src/)
npm run typecheck    # tsc --noEmit
```

CI runs lint → typecheck → build and verifies that `main.js` is produced. See [CONTRIBUTING.md](./CONTRIBUTING.md) for a full guide.

## Related projects

| Project | Description |
|---|---|
| [keroway/timeline-dsl](https://github.com/keroway/timeline-dsl) | The Timeline DSL compiler (Rust + WASM). CLI, WebUI, GitHub Actions integration |
| [WebUI](https://keroway.github.io/timeline-dsl/) | Real-time browser editor — full Wikidata support |
| [Landing page](https://timeline-dsl-lp.pages.dev/) | Overview and feature tour |
| [VS Code extension](https://marketplace.visualstudio.com/items?itemName=keroway.timeline-dsl) | Syntax highlighting for `.tdsl` files |
| [@keroway/tdsl-wasm](https://www.npmjs.com/package/@keroway/tdsl-wasm) | WASM package used by this plugin |

## License

MIT © keroway

Third-party licenses for bundled dependencies are listed in [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md).
