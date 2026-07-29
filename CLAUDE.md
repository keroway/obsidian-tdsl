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

### WASM 初期化の single-flight ガード

`src/main.ts` の `ensureWasm` は `src/wasm-init.ts` の `createWasmInitializer()` が返すクロージャ。
内部の `ready` / `initPromise` が「同時に走った初期化を 1 本の Promise に束ねる」役割を持つ。
Obsidian は複数の `tdsl` ブロックを同時に描画するため、このガードを外すと各ブロックが
「まだ未初期化」と判断して `init()` を並列に呼び、クラッシュする。

初期化が失敗したときは `initPromise` を `null` に戻して次の描画でリトライできるようにしている。
成功後に `ready` を立てる順序も含めて挙動は `src/wasm-init.test.ts` で固定されているので、
変更するときはテストを先に読むこと。

### WASM API シグネチャ

`@keroway/tdsl-wasm` のエクスポートに依存している：

- `check_source(source: string): string` — 診断 JSON（`[{severity, message, line, col}]`）を返す
- `render_svg_from_source_with_options(source: string, scale: number, opts: JsRenderOptions): string` — SVG 文字列を返す。`scale` は 1 年あたりピクセル数（`0` で自動）。`opts` は `src/main.ts` の `renderSvg()` が設定する 8 つのフィールドを持つ：
  - `grid` — `//! grid: ...` / 設定の Default grid
  - `theme` — `//! theme: ...` / 設定の Default theme（`"auto"` は未設定として扱う）
  - `orientation` — `//! orientation: ...` / 設定の Default orientation
  - `layout_style` — `//! layout_style: ...` / 設定の Default layout style（`"auto"` は未設定として扱う）
  - `show_event_labels` — `//! events: ...` / 設定の Show event labels
  - `show_table` — `//! table: ...` / 設定の Render table
  - `show_legend` — `//! legend: ...` / 設定の Render legend
  - `lane_height` — `//! lane_height: ...` / 設定の Default lane height（`0` は未設定として扱う）
- `JsRenderOptions` は **1 回の render 呼び出しで WASM 側に free される**。使い回すと `null pointer passed to rust` でクラッシュするため、呼び出しごとに `new` すること。`renderSvg()` が実際に上記フィールドを代入しているので、WASM 側に新しいフィールドが追加された場合もそこを確認する。
  所有権の移譲は wasm-bindgen が Rust 側へ入る**前**に `__destroy_into_raw()` で行うため、render が
  throw した場合でもインスタンスは消費済みになる。`src/main.ts` の `renderSvg()` はこの前提で
  「所有権が移る前に throw した経路だけ `free()` する」フラグを持つ。無条件に `free()` すると二重 free になる。

`scale` / `grid` / `theme` などは `.tdsl` 内の `//! key: value` コメント行（`src/utils.ts` の `parseRenderDirectives`）で指定する。`//` は通常の DSL コメントなのでコンパイラは無視する。

`@keroway/tdsl-wasm ^1.27.0` を前提にしている（`package.json` の `dependencies` が正）。
メジャーバージョンアップでシグネチャが変わると描画全体が破綻する。依存バージョンを上げるときは
API 互換性を必ず確認し、この記述も合わせて更新すること。

**caret 指定でも実際に動くのは lockfile が解決したバージョン**である点に注意。
`pnpm-lock.yaml` が `1.27.0` をピンしており、さらに配布される `main.js` は
その WASM をビルド時にインライン化した成果物なので、npm 上に新しいマイナーが出ていても
vault 側の挙動は変わらない。バージョンを上げるときは
`pnpm update @keroway/tdsl-wasm` → `pnpm run build`（`main.js` の再生成）→ 描画確認
までを 1 セットで行うこと。

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

- `main.js`（esbuild ビルド成果物。`.gitignore` 済みで、GitHub Release の資産から入手するかローカルで `pnpm run build` を実行して生成する）
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

加えて **`CHANGELOG.md` に対応するバージョンのエントリを追加する**こと。
`version-bump.mjs` は CHANGELOG を触らないため、ここだけは手作業になる。
新しい見出し（`## [x.y.z] - YYYY-MM-DD`）と、ファイル末尾のリンク参照
（`[Unreleased]` の compare 先を新バージョンへ張り替え、`[x.y.z]` を追加）の
両方を更新する。実例として 1.0.0 のエントリはリリース後しばらく欠落していた（issue #120）。

---

## アーキテクチャ概要

```text
src/
  main.ts               — プラグインエントリポイント。Plugin クラス・設定タブ・MarkdownRenderChild を定義
  utils.ts              — 純関数群（`parseRenderDirectives` / 診断の整形 / 設定値の検証）。
                          Obsidian API にも WASM にも依存しないのでそのままユニットテストできる
  fence.ts              — エディタ内の `tdsl` フェンス検出（整形コマンドがカーソル位置から範囲を求める）
  wasm-init.ts          — `createWasmInitializer()`。WASM 初期化の single-flight ガード
  obsidian-rerender.ts  — 非公開 API `previewMode.rerender()` の薄いラッパー。
                          設定変更時に開いているプレビューを再描画するために使う
  wasm.d.ts             — esbuild binary loader 向け .wasm 型宣言
  *.test.ts             — 上記モジュールの Vitest ユニットテスト
esbuild.config.mjs  — ビルド設定（WASM インライン化・バンドル）
main.js        — `.gitignore` 済みのビルド成果物（GitHub Release の資産から入手するか、`pnpm run build` で生成して vault にコピーする）
manifest.json  — Obsidian プラグインメタデータ
versions.json  — バージョン↔minAppVersion マッピング
```

外部依存：

- `@keroway/tdsl-wasm` — Rust/WASM レンダラー。`src/main.ts` が import しているのは
  `init` / `check_source` / `lint_source` / `format_source` / `render_svg_from_source_with_options` / `JsRenderOptions`
- `obsidian` — Obsidian プラグイン API（`external` として esbuild からは除外）
