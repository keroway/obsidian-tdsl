#!/bin/bash
# Capture light/dark preview screenshots for the README via the Obsidian CLI.
#
# Prerequisite (one-time, MANUAL): enable the CLI in Obsidian:
#   Settings → General → Advanced → "Command line interface" → ON
# and make sure Obsidian is running with the target vault open.
#
# This script then:
#   1. opens the preview note (vault: tdsl-preview.md)
#   2. switches to light theme, screenshots → docs/assets/preview-light.png
#   3. switches to dark theme,  screenshots → docs/assets/preview-dark.png
#
# Run from the repo root:  bash scripts/capture-screenshots.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$REPO_ROOT/docs/assets"
NOTE="tdsl-preview"

if ! obsidian help >/dev/null 2>&1; then
	echo "ERROR: Obsidian CLI not reachable."
	echo "  - Make sure Obsidian is running with the vault open."
	echo "  - Enable: Settings → General → Advanced → Command line interface."
	exit 1
fi

mkdir -p "$ASSETS"

echo "Opening preview note…"
obsidian open file="$NOTE" >/dev/null 2>&1 || obsidian open path="$NOTE.md" >/dev/null 2>&1 || true
sleep 2

echo "Light mode…"
obsidian eval code="app.changeTheme && app.changeTheme('moonstone')" >/dev/null 2>&1 ||
	obsidian eval code="app.customCss.setTheme('')" >/dev/null 2>&1 || true
sleep 2
obsidian dev:screenshot path="$ASSETS/preview-light.png"

echo "Dark mode…"
obsidian eval code="app.changeTheme && app.changeTheme('obsidian')" >/dev/null 2>&1 || true
sleep 2
obsidian dev:screenshot path="$ASSETS/preview-dark.png"

echo "Screenshots captured:"
ls -la "$ASSETS"/preview-*.png

# --- Patch READMEs: uncomment image lines, drop the "coming soon" notes ---
patch_readme() {
	local f="$1" caption_l="$2" caption_d="$3" note_re="$4"
	python3 - "$f" "$caption_l" "$caption_d" "$note_re" <<'PY'
import re, sys
f, cap_l, cap_d, note_re = sys.argv[1:5]
s = open(f, encoding="utf-8").read()
block = (
    f"![{cap_l}](docs/assets/preview-light.png)\n\n"
    f"![{cap_d}](docs/assets/preview-dark.png)"
)
# Replace the three HTML-comment placeholder lines with real image embeds.
s = re.sub(r"<!--[^\n]*-->\n<!--[^\n]*preview-light\.png[^\n]*-->\n<!--[^\n]*preview-dark\.png[^\n]*-->", block, s)
# Drop the "coming soon" Note line (+ following blank line).
s = re.sub(note_re + r"\n\n", "", s)
open(f, "w", encoding="utf-8").write(s)
print(f"patched {f}")
PY
}

patch_readme "$REPO_ROOT/README.md" \
	"Timeline DSL rendered in Obsidian (light mode)" \
	"Timeline DSL rendered in Obsidian (dark mode)" \
	r"> \*\*Note:\*\* Screenshots coming soon\.[^\n]*"

patch_readme "$REPO_ROOT/README.ja.md" \
	"Obsidian でのレンダリング（ライトモード）" \
	"Obsidian でのレンダリング（ダークモード）" \
	r"> \*\*Note:\*\* スクリーンショットは近日追加予定[^\n]*"

echo "Done. Review: git diff README.md README.ja.md docs/assets/"
