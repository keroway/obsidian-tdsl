# CLAUDE.md — obsidian-tdsl

Obsidian 用 Timeline DSL プラグイン。`.tdsl` コードブロックを WASM レンダラーで SVG に変換して表示する。

## コマンド

```bash
pnpm run build         # esbuild で main.js を生成（本番ビルド）
pnpm run dev           # ウォッチモードでビルド（開発用）
pnpm run typecheck     # tsc --noEmit（型チェックのみ）
pnpm run lint          # biome lint .（lint のみ）
pnpm run format        # biome format --write .（整形を適用）
pnpm run format:check  # biome format .（CI 用。未整形があれば失敗）
pnpm run check         # biome check + typecheck + test（コミット前の全通し）
```

パッケージマネージャは **pnpm 11**、Node は **24**（`mise.toml` でピン）。
git hooks は **lefthook**（`lefthook.yml`、`pnpm install` 時に自動設置）。

## フォーマット方針

lint / format ともに **Biome**（`biome.json`、recommended preset）。
ESLint は撤去済み（ワークスペース標準化で Biome に一本化）。

- 設定は `quoteStyle: double` / `trailingCommas: all` / `semicolons: always` / `indentStyle: tab`。
  これは pi-lens がエディタ保存時に適用する Biome デフォルトと一致させてあり、
  ズラすと保存のたびに差分が出続けるので変更しないこと。
- 対象は JS/TS/JSON/JSONC/CSS。Biome が扱わない YAML / Markdown は `.editorconfig` で
  インデントを定義している（YAML はスペース 2、コードはタブ）。
- `main.js`（ビルド成果物）と `.claude/` `.pi/`（エージェントローカル）は対象外。
- CI（`.github/workflows/ci.yml` の lint ジョブ）で `format:check` が走る。

---

## 壊すと破綻するポイント（不変条件）

### WASM インライン化ローダー

`esbuild.config.mjs` の `loader: { '.wasm': 'binary' }` を外すと、`init()` に渡す `BufferSource` が得られず WASM 初期化が失敗し、全コードブロックが描画不能になる。

esbuild はこの設定によって `.wasm` ファイルを `Uint8Array` としてバンドルに埋め込む。Obsidian プラグインは URL fetch できないため、このインライン化が唯一の配布手段。

### WASM 型宣言

`src/wasm.d.ts` の `declare module '*.wasm'` を削除すると、`src/main.ts` の WASM import が TypeScript の型エラーになり `typecheck` が落ちる。

### 遅延初期化フラグ

`src/main.ts` の `ensureWasm()` / `wasmReady` フラグは `init()` の重複呼び出しを防ぐモジュール状態。`wasmReady` チェックを外すと複数のコードブロックが同時にレンダリングされたとき `init()` が並列実行されてクラッシュする。

### WASM API シグネチャ

`@keroway/tdsl-wasm` のエクスポートに依存している：

- `check_source(source: string): string` — 診断 JSON（`[{severity, message, line, col}]`）を返す
- `render_svg_from_source_with_options(source: string, scale: number, opts: JsRenderOptions): string` — SVG 文字列を返す。`scale` は 1 年あたりピクセル数（`0` で自動）。`opts` は `grid` / `theme` / `orientation` / `show_event_labels` / `show_table` を持つ
- `JsRenderOptions` は **1 回の render 呼び出しで WASM 側に free される**。使い回すと `null pointer passed to rust` でクラッシュするため、呼び出しごとに `new` すること。

`scale` / `grid` / `theme` などは `.tdsl` 内の `//! key: value` コメント行（`src/utils.ts` の `parseRenderDirectives`）で指定する。`//` は通常の DSL コメントなのでコンパイラは無視する。

`@keroway/tdsl-wasm ^1.22.0` を前提にしている。メジャーバージョンアップでシグネチャが変わると描画全体が破綻する。依存バージョンを上げるときは API 互換性を必ず確認すること。

### DSL 構文の不変条件（README サンプルの前提）

- `timeline { … }` 内の各プロパティは `;` で終わる（`unit year;` `range -300..300;`）
- 範囲は `start..end`。`start to end` は構文エラー
- `span` / `event` / `event_range` は `{ … }` ブロックの後ろに**末尾 `;` が必須**（`span a 1..2 "x" {};`）
- `lane` / `group` 宣言には末尾 `;` を**付けない**

### XSS セーフな SVG 挿入

`src/main.ts` の SVG 挿入は `DOMParser` + `document.adoptNode` を使っている。`innerHTML` に置き換えるとスクリプト注入が可能になりセキュリティ不変条件が崩れる。この実装は意図的なものであり変更禁止。

```ts
// Parse as SVG/XML — avoids innerHTML and does not execute scripts or event handlers.
const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
wrapper.appendChild(document.adoptNode(doc.documentElement));
```

### 配布 3 点セット

Obsidian プラグインのインストール手順はこの 3 ファイルを vault の `.obsidian/plugins/timeline-dsl/` にコピーすることを前提にしている：

- `main.js`（esbuild ビルド成果物、リポジトリにコミット済み）
- `manifest.json`
- `styles.css`

これらのファイル名・配置を変えるとインストール手順が壊れる。

### バージョン整合

以下 3 ファイルのバージョン番号は常に同期していなければならない：

- `manifest.json` → `"version"`
- `package.json` → `"version"`
- `versions.json` → キー（プラグインバージョン）と値（minAppVersion）

どれか 1 つでもズレると Obsidian のプラグイン更新チェックが誤動作する。
バージョンを上げるときは `pnpm version patch` / `pnpm version minor` /
`pnpm version major` を使い、`version-bump.mjs` 経由で 3 ファイルを同時に更新すること。

---

## アーキテクチャ概要

```text
src/
  main.ts      — プラグインエントリポイント。Plugin クラスと MarkdownRenderChild を定義
  wasm.d.ts    — esbuild binary loader 向け .wasm 型宣言
esbuild.config.mjs  — ビルド設定（WASM インライン化・バンドル）
main.js        — ビルド成果物（コミット済み、vault にコピーして使う）
manifest.json  — Obsidian プラグインメタデータ
versions.json  — バージョン↔minAppVersion マッピング
```

外部依存：

- `@keroway/tdsl-wasm` — Rust/WASM レンダラー（`check_source` / `render_svg_from_source`）
- `obsidian` — Obsidian プラグイン API（`external` として esbuild からは除外）
