# docs/assets

Place screenshot images here. These are referenced from the root `README.md` and `README.ja.md`.

| File | Description |
|---|---|
| `preview-light.png` | Plugin rendering a `tdsl` block in Obsidian light mode |
| `preview-dark.png` | Plugin rendering a `tdsl` block in Obsidian dark mode |

To capture screenshots:

1. Install the development build into your Obsidian vault (`npm run build` then copy `main.js`, `manifest.json`, `styles.css`)
2. Open a note with a `tdsl` code block (see the example in the root README)
3. Switch between light and dark mode in Obsidian settings and capture each
4. Save images as PNG at the paths above and uncomment the image lines in `README.md` / `README.ja.md`
