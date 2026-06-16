# obsidian-tdsl

[![CI](https://github.com/keroway/obsidian-tdsl/actions/workflows/ci.yml/badge.svg)](https://github.com/keroway/obsidian-tdsl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/keroway/obsidian-tdsl)](./LICENSE)
[![npm: @keroway/tdsl-wasm](https://img.shields.io/npm/v/@keroway/tdsl-wasm?label=npm%20%40keroway%2Ftdsl-wasm)](https://www.npmjs.com/package/@keroway/tdsl-wasm)
[![timeline-dsl](https://img.shields.io/badge/upstream-keroway%2Ftimeline--dsl-blue)](https://github.com/keroway/timeline-dsl)

An [Obsidian](https://obsidian.md) plugin that renders [Timeline DSL](https://github.com/keroway/timeline-dsl) (`tdsl`) code blocks as interactive SVG timelines in the live preview.

> 日本語版: [README.ja.md](./README.ja.md)

## Preview

<!-- Replace with actual screenshots once available -->
<!-- Light mode: docs/assets/preview-light.png -->
<!-- Dark mode:  docs/assets/preview-dark.png -->

> **Note:** Screenshots coming soon. The plugin renders `tdsl` code blocks as SVG timelines with full dark mode support.

## Features

- **SVG timeline preview** — `tdsl` code blocks are rendered as SVG directly in the Obsidian live preview / reading view
- **Inline syntax errors** — Parse and semantic errors are shown with line/column numbers inside the note, without leaving the editor
- **Dark mode support** — Automatically follows Obsidian's `body.theme-dark` class; colour palette adapts to Catppuccin-style dark colours
- **XSS-safe SVG insertion** — SVG output is parsed via `DOMParser` and inserted with `document.adoptNode`; no `innerHTML`, no script execution
- **Mobile compatible** — Works on both desktop and mobile Obsidian (`isDesktopOnly: false`)
- **Zero network requests** — The [Timeline DSL WASM](https://www.npmjs.com/package/@keroway/tdsl-wasm) renderer is bundled inline; no external calls at render time

## Usage

Write a `tdsl` fenced code block in any note:

````markdown
```tdsl
timeline "Heian Period" {
  unit year
  range 794 to 1185
}

lane "Emperor" as emperor {}

span emperor 781..806 "Kanmu" {}
span emperor 806..809 "Heizei" {}
span emperor 809..823 "Saga" {}
```
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
// Duration (start..end)
span han -206..220 "Han Dynasty" { tags ["dynasty"]; }

// Point event
event han -209 "Dazexiang Uprising" {}

// Range event (wars, disasters, etc.)
event_range han 184..204 "Yellow Turban Rebellion" { tags ["war"]; }
```

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

span emperor 710..794 "Nara Period" { tags ["imperial"]; }
span emperor 794..1185 "Heian Period" { tags ["imperial"]; }

span kamakura  1185..1336 "Kamakura Shogunate" { tags ["military"]; }
span muromachi 1336..1573 "Muromachi Shogunate" { tags ["military"]; }
span edo       1603..1868 "Edo Shogunate" { tags ["military"]; }

event kamakura 1185 "Minamoto no Yoritomo appointed Shogun" {}
event edo      1868 "Meiji Restoration" {}
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
   cp main.js manifest.json styles.css <vault>/.obsidian/plugins/obsidian-tdsl/
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
