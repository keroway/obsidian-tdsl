#!/bin/bash
# Capture light/dark preview screenshots for the README via the Obsidian CLI.
#
# Prerequisite (one-time, MANUAL): enable the CLI in Obsidian:
#   Settings → General → Advanced → "Command line interface" → ON
# and make sure Obsidian is running with the DEV vault open (the one that contains
# the preview note, tdsl-preview.md). The script captures whatever vault is active, so
# it refuses to run when the note is missing instead of photographing another vault.
#
# This script then:
#   1. opens the preview note (vault: tdsl-preview.md) and checks it is the active file
#   2. switches to light theme, checks the theme, screenshots → light image
#   3. switches to dark theme,  checks the theme, screenshots → dark image
#   4. only when BOTH images were written and differ, moves them to docs/assets/ and patches the READMEs
#
# Any failed step aborts with a non-zero exit BEFORE docs/assets/ or the READMEs are
# touched. The theme that was active at the start is restored on exit.
#
# Run from the repo root:  bash scripts/capture-screenshots.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ASSETS="$REPO_ROOT/docs/assets"
NOTE="tdsl-preview"
STAGE="$(mktemp -d)"
ORIGINAL_THEME=""

THEME_JS="document.body.classList.contains('theme-dark') ? 'dark' : (document.body.classList.contains('theme-light') ? 'light' : 'unknown')"

die() {
	echo "ERROR: $*" >&2
	exit 1
}

# The Obsidian CLI exits 0 even when a command fails and prints `Error: ...` to stdout
# instead, so an exit code (or `|| true`) says nothing. Look at the output.
cli() {
	local out
	out="$(obsidian "$@" 2>&1)" || die "obsidian $1 failed: $out"
	case "$out" in
	Error:* | *$'\n'Error:*) die "obsidian $1: $out" ;;
	esac
	printf '%s\n' "$out"
}

# Evaluate a JS expression in Obsidian and print its value (the part after "=> ").
js() {
	local out
	out="$(cli eval code="$1")"
	case "$out" in
	"=> "*) printf '%s' "${out#=> }" ;;
	*) die "unexpected eval output for [$1]: $out" ;;
	esac
}

# Like js, but reports failure through the return code so the caller can fall back.
try_js() {
	local out
	out="$(obsidian eval code="$1" 2>&1)" || return 1
	case "$out" in
	Error:* | *$'\n'Error:*) return 1 ;;
	esac
}

# Poll (up to ~10s) until the JS expression evaluates to the expected value.
wait_for() {
	local expr="$1" expected="$2" got=""
	for _ in $(seq 1 20); do
		got="$(js "$expr" 2>/dev/null || true)"
		[ "$got" = "$expected" ] && return 0
		sleep 0.5
	done
	echo "  expected '$expected', last saw '${got:-<none>}'" >&2
	return 1
}

set_theme() {
	local want="$1"
	if [ "$want" = "dark" ]; then
		try_js "app.changeTheme('obsidian')" && wait_for "$THEME_JS" dark && return 0
	else
		try_js "app.changeTheme('moonstone')" && wait_for "$THEME_JS" light && return 0
		try_js "app.customCss.setTheme('')" && wait_for "$THEME_JS" light && return 0
	fi
	return 1
}

# Best effort by design: this runs on every exit path (including failures), and a
# failure to restore the theme must not hide the original error.
cleanup() {
	rm -rf "$STAGE"
	if [ -n "$ORIGINAL_THEME" ] && [ "$(js "$THEME_JS" 2>/dev/null || true)" != "$ORIGINAL_THEME" ]; then
		set_theme "$ORIGINAL_THEME" >/dev/null 2>&1 || true
	fi
}
trap cleanup EXIT

if ! obsidian help >/dev/null 2>&1; then
	echo "ERROR: Obsidian CLI not reachable."
	echo "  - Make sure Obsidian is running with the vault open."
	echo "  - Enable: Settings → General → Advanced → Command line interface."
	exit 1
fi

VAULT="$(js "app.vault.getName()")"
echo "Vault: $VAULT"

# Resolve the note the way a wikilink would, and stop before touching anything else
# when it is not in the active vault.
NOTE_PATH="$(js "app.metadataCache.getFirstLinkpathDest('$NOTE', '')?.path ?? 'missing'")"
if [ "$NOTE_PATH" = "missing" ]; then
	die "note '$NOTE' not found in vault '$VAULT'. Open the dev vault that contains tdsl-preview.md and retry. Nothing was changed."
fi

ORIGINAL_THEME="$(js "$THEME_JS")"
[ "$ORIGINAL_THEME" = "unknown" ] && ORIGINAL_THEME=""

echo "Opening preview note ($NOTE_PATH)…"
cli open path="$NOTE_PATH" >/dev/null
wait_for "app.workspace.getActiveFile()?.path ?? 'none'" "$NOTE_PATH" ||
	die "'$NOTE_PATH' did not become the active file."

capture() {
	local theme="$1"
	echo "${theme} mode…"
	set_theme "$theme" || die "could not switch to the $theme theme."
	sleep 2 # let the theme finish repainting before the capture
	[ "$(js "$THEME_JS")" = "$theme" ] || die "theme is no longer $theme right before the capture."
	cli dev:screenshot path="$STAGE/preview-$theme.png" >/dev/null
	[ -s "$STAGE/preview-$theme.png" ] || die "screenshot for the $theme theme was not written."
}

capture light
capture dark

# The two themes must not produce the same picture; if they do, the capture did not
# follow the theme change and the README would show one image twice.
if cmp -s "$STAGE/preview-light.png" "$STAGE/preview-dark.png"; then
	die "the light and dark screenshots are byte-identical; the theme change did not reach the capture."
fi

# Both captures succeeded: only now touch docs/assets/ and the READMEs.
mkdir -p "$ASSETS"
mv "$STAGE/preview-light.png" "$STAGE/preview-dark.png" "$ASSETS/"

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
