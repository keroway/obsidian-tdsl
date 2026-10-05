#!/usr/bin/env bash
# 変更ファイル一覧（stdin、1 行 1 パス。`__all__` は「全ジョブ実行」の合図）から、
# CI のどのジョブを起動するかを `name=true|false` で標準出力へ書く。
# .github/workflows/ci.yml の `changes` ジョブが呼び出し、結果を GITHUB_OUTPUT へ流す。
# 分類ルールの検証は src/classify-changes.test.ts。
#
# 未分類のパスは全ジョブを起動する（`*)` の fallback）。新しい種類のファイルを足したとき、
# 分類を足し忘れても検査が黙って飛ばないようにするため（#286）。検査が不要と分かっている
# パスは「ジョブ不要」の分岐へ明示的に列挙する。
set -euo pipefail

test=false
lint=false
typecheck=false
build=false
audit=false
typos=false

all() {
	test=true
	lint=true
	typecheck=true
	build=true
	audit=true
	typos=true
}

while IFS= read -r file || [[ -n "${file}" ]]; do
	[[ -z "${file}" ]] && continue
	case "${file}" in
	# CI 自身・この分類・依存/ツールチェーン定義は、どのジョブにも影響しうる。
	__all__ | .github/workflows/ci.yml | scripts/classify-changes.sh | mise.toml | \
		package.json | pnpm-lock.yaml | pnpm-workspace.yaml)
		all
		;;
	src/*)
		test=true
		lint=true
		typecheck=true
		build=true
		typos=true
		;;
	esbuild.config.mjs)
		lint=true
		build=true
		;;
	vitest.config.ts)
		test=true
		lint=true
		typecheck=true
		;;
	tsconfig.json)
		lint=true
		typecheck=true
		;;
	biome.json | version-bump.mjs | styles.css | manifest.json | versions.json)
		lint=true
		;;
	# ローカルフック設定・just タスク。biome の対象外だが lint ジョブの設定面と地続き。
	lefthook.yml | justfile)
		lint=true
		typos=true
		;;
	# 運用スクリプト・その他の workflow / .github 配下。専用のジョブは無く、
	# workflow-lint / gitleaks が別 workflow で常時走るので、ここでは typos だけ。
	scripts/* | .github/*)
		typos=true
		;;
	*.md | _typos.toml)
		typos=true
		;;
	# 検査ジョブの対象になく、起動する必要が無いと確認済みのパス。
	.claude/* | plans/* | docs/* | .gitignore | .editorconfig | LICENSE)
		;;
	*)
		all
		;;
	esac
done

echo "test=${test}"
echo "lint=${lint}"
echo "typecheck=${typecheck}"
echo "build=${build}"
echo "audit=${audit}"
echo "typos=${typos}"
