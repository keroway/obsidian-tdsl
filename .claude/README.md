# obsidian-tdsl — Claude Code Setup

このディレクトリは Claude Code / Codex / pi 等の AI コーディングエージェントの動作をこのプロジェクト用に
整える共有設定です。`CLAUDE.md`（リポジトリルート）と一緒に読んでください。

## 構成

```
.claude/
├── hooks/
│   └── post-stop-check.sh     # Stop: 変更があれば biome / tsc / vitest を実行
├── settings.json               # 共有設定（hook 登録等、コミット対象）
├── settings.local.json         # 個人設定（.gitignore で除外）
└── claude-security-guidance.md # security-guidance プラグイン向けの不変条件
```

## 依存ツール

| ツール | 用途 | 必須？ |
|---|---|---|
| `pnpm` | lint・typecheck・test の実行 | 必須（hook が PATH を要求、無いと Stop hook が exit 2 で通知） |
| `jq` | hook 内 JSON 抽出 | 無い環境では非依存フォールバックで動作 |

## Hooks の挙動

### Stop: `post-stop-check.sh`

- 発火条件: Claude が応答を終えたとき（変更ファイルが無ければ即終了）
- 動作: 変更ファイル（uncommitted + untracked + 未 push commit）が 1 件でもあれば、
  CI (`.github/workflows/ci.yml`) の lint / typecheck / test ジョブと同じコマンドを実行する
  - `pnpm run format:check` + `pnpm run lint`（lint job 相当）
  - `pnpm run typecheck`（typecheck job 相当）
  - `pnpm run test`（test job 相当）
  - build job の「main.js 生成確認」は対象外（`main.js` は `.gitignore` 済みの成果物で、
    コミットされないためターン終了時に検証する対象がない）
- 失敗時: exit 2 で Claude にフィードバック（ブロッキング）
- pnpm が見つからない等「検証できない」場合も exit 2（silent-pass しない）
- 一時的に止めたい場合: `TDSL_SKIP_STOP_HOOK=1`

このリポジトリはほぼ全ファイルが `src/` 配下の TS/CSS で、コンテンツ用の別ツールチェーンを
持たないため、astro-blog のような「変更領域ごとにコマンドを出し分ける」分類はしていない
（変更があれば常に lint + typecheck + test をまとめて実行する）。

## Rules の参照階層

`CLAUDE.md`（最上位、本リポジトリと `keroway/CLAUDE.md` ワークスペース共通ルール）を参照する。
矛盾があればリポジトリルートの `CLAUDE.md` が優先。

## 他環境への移植

このディレクトリは macOS / Linux いずれでも動作するように書かれています:

- hook スクリプトは `#!/usr/bin/env bash`
- 絶対パスは `$CLAUDE_PROJECT_DIR` で解決する

新しい開発者がリポジトリをクローンした場合、追加でやることはありません。Claude Code が
`settings.json` を読み込めば hook が有効になります。
