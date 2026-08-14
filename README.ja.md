# obsidian-tdsl

[![CI](https://github.com/keroway/obsidian-tdsl/actions/workflows/ci.yml/badge.svg)](https://github.com/keroway/obsidian-tdsl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/keroway/obsidian-tdsl)](./LICENSE)
[![npm: @keroway/tdsl-wasm](https://img.shields.io/npm/v/@keroway/tdsl-wasm?label=npm%20%40keroway%2Ftdsl-wasm)](https://www.npmjs.com/package/@keroway/tdsl-wasm)
[![timeline-dsl](https://img.shields.io/badge/upstream-keroway%2Ftimeline--dsl-blue)](https://github.com/keroway/timeline-dsl)

[Timeline DSL](https://github.com/keroway/timeline-dsl) の `tdsl` コードブロックをライブプレビューで SVG 年表として描画する [Obsidian](https://obsidian.md) プラグイン。

> English: [README.md](./README.md)

## プレビュー

![Obsidian でのレンダリング（ライトモード）](docs/assets/preview-light.png)

![Obsidian でのレンダリング（ダークモード）](docs/assets/preview-dark.png)

## 機能

- **SVG 年表プレビュー** — `tdsl` コードブロックを Obsidian のライブプレビュー / 閲覧ビューで直接 SVG として描画
- **インライン構文エラー表示** — パース・意味エラーを行番号・列番号つきでノート内に表示。エディタを離れずに確認可能
- **ダークモード対応** — Obsidian の `body.theme-dark` クラスに自動追従。Catppuccin 系ダーク配色に切り替わる
- **XSS 安全な SVG 挿入** — `DOMParser` で SVG をパースして `document.adoptNode` で挿入。`innerHTML` 未使用、スクリプト実行なし
- **パン/ズーム・フルスクリーン** — 描画された年表それぞれにホイールズーム・ドラッグパン・フルスクリーンボタンを提供。既定で有効。`//! scale: fit` や横スクロールと共存する。設定タブで切り替え可能
- **エクスポートツールバー** — 描画された年表それぞれに Copy SVG / Copy standalone HTML / Copy PNG / Save as file のツールバーを提供
- **モバイル対応** — デスクトップ・モバイル両対応（`isDesktopOnly: false`）
- **外部通信なし** — [Timeline DSL WASM](https://www.npmjs.com/package/@keroway/tdsl-wasm) レンダラはバンドル済み。描画時に外部リクエストなし

## 使い方

任意のノートに `tdsl` コードブロックを書くだけです:

````markdown
```tdsl
timeline "平安時代" {
  unit year;
  range 781..1185;
}

lane "天皇" as emperor {}

span emperor 781..806 "桓武天皇" {};
span emperor 806..809 "平城天皇" {};
span emperor 809..823 "嵯峨天皇" {};
```

> **構文の注意:** `timeline { … }` ブロック内の各プロパティは `;` で終わります。
> 範囲は `start..end`（`start to end` ではありません）。
> `span` / `event` / `event_range` は `{ … }` ブロックの後ろに `;` が必要です。
> `lane` / `group` 宣言には末尾の `;` を**付けません**。
````

### Obsidian で使える DSL 構文

#### `timeline` ブロック

タイトル・時間単位・表示範囲・カラーマッピングを宣言します。

```
timeline "中国王朝" {
    title "中国王朝";
    unit year;
    range -500..2000;
    calendar proleptic_gregorian;
    color_map {
        dynasty: "#3366cc";
        war:     "#cc0000";
    }
}
```

`unit` には `year`（年）、`month`（月）、`day`（日）、`hour`（時）、`minute`（分）、
`second`（秒）を指定できます。

`calendar` は省略可能で、`proleptic_gregorian`（既定）または `julian` を指定できます。
日付リテラルの解釈に影響し、省略時は `proleptic_gregorian` と同等です。

日未満の単位を使うときは、範囲を ISO 8601 の日時で書きます。UTC オフセット（または `Z`）は
**日時リテラルの中**に書きます。`timeline` ブロックにタイムゾーン用のプロパティはありません:

```
timeline "打ち上げ当日" {
    unit hour;
    range 2026-01-01T00:00:00+09:00..2026-01-02T00:00:00+09:00;
}
```

#### `lane` 宣言

縦方向のカテゴリを定義します。`as` でスパン・イベント配置に使う内部 ID を指定します。

```
lane "漢" as han { kind dynasty; order 20; }
```

#### `group` ブロック

複数のレーンをグループ化して、ラベルと境界線を描画します。

```
group "古代中国" {
    lane "秦" as qin { kind dynasty; order 10; }
    lane "漢" as han { kind dynasty; order 20; }
}
```

#### `span` / `event` / `event_range`

レーンに配置する 3 種類の時間要素:

```
// 期間（start..end）— ブロックの後ろに ; が必要
span han -206..220 "漢王朝" { tags ["dynasty"]; };

// 点イベント
event han -209 "大沢郷の乱" {};

// 範囲イベント（戦争・災害など）
event_range han 184..204 "黄巾の乱" { tags ["war"]; };
```

##### `now` — 終端が未確定の範囲

`span` と `event_range` は範囲の**終端**に `now` を書けます（「現在も継続中」の意）。
開始側には書けず、点イベントの `event` でも使えません:

```
span main 2010..now "進行中のプロジェクト" {};
event_range main 2020..now "継続中" {};
```

`now` は描画時の**年**（UTC）に解決されるため、`unit year` と組み合わせて使ってください。
`unit day` で `2026-03-01..now` のように日付リテラルと混ぜると、終端が年に解決される結果
「start > end」の警告が出ます。

終端が開いた項目には `tdsl-item-open-ended` クラスが付くため、vault の CSS スニペットで
装飾できます（端をぼかす、破線にするなど）。ツールチップの終了表記も数値ではなく
「進行中」になります。

##### `note` / `link` / `color` ブロックオプション

`span` / `event` / `event_range` のブロックでは、次の 3 つのオプションを指定できます
（`kind` と `order` しか受け付けない `lane` / `group` では使えません）:

```
span main 1603..1868 "江戸時代" {
    note "鎖国期";
    link "https://ja.wikipedia.org/wiki/江戸時代";
    color "#8b5cf6";
};
```

| オプション | 値 | 効果 |
|---|---|---|
| `id` | 識別子文字列 | 項目の安定した識別子。`Fix lint issues in current tdsl block` コマンドは欠落した `id` を自動補完する |
| `note` | 文字列 | ツールチップ / アクセシブル名に 1 行追加する |
| `link` | `http://` または `https://` の URL | ツールチップに 1 行として表示される。**クリックはできない**（レンダラは `<a>` を出力しない）。他のスキームはコンパイルエラー |
| `color` | `#RGB` / `#RGBA` / `#RRGGBB` / `#RRGGBBAA` または単純な CSS 色キーワード | 項目の塗り色を上書きする。レーン色や `color_map` より優先される。`rgb()` / `url()` などは受け付けない |
| `source` | 文字列 | 出典・典拠の注記。SVG レンダラではツールチップ / アクセシブル名のテキストとして表示される。**リンクにはならない** |
| `origin` | 文字列 | 項目の由来（例: `manual` / `import`）を示す |

`note` と `link` は項目の `<title>` / `aria-label` / `data-tdsl-tooltip` 属性に載るため、
ホバー時のブラウザ標準ツールチップとして表示され、スクリーンリーダーからも読み上げられます。

#### 描画オプション（`//!` ディレクティブ）

Obsidian はコードブロックの本文しかレンダラに渡さないため、図ごとのオプションは
`//!` コメント行（コンパイラが無視する通常の DSL コメント）で指定します。
ブロック内のどこに書いても構いません:

```tdsl
//! scale: 3
//! grid: decade
//! orientation: vertical
//! layout_style: gantt
//! events: on
timeline "Demo" { unit year; range 0..100; }
lane "Main" as main {}
span main 10..50 "ある時代" {};
```

| ディレクティブ | 値 | 効果 |
|---|---|---|
| `scale` | 正の数 または `fit` | 1 年あたりのピクセル数。大きいほど横に広がり読みやすい。`fit` はノート幅に縮小（横スクロールなし）。省略で自動 |
| `grid` | `none`, `decade`, `year`, `month` | グリッド線の密度 |
| `theme` | `default`, `dark`, `print`, `pastel` | 組み込みカラーテーマ |
| `orientation` | `horizontal`, `vertical` | レイアウト方向 |
| `layout_style` | `timeline`, `gantt`, `group-bands`, `zigzag` | レンダラーのレイアウトスタイル。未知の値は無視される。省略でレンダラー既定値 |
| `events` | `on` / `off` | `event` / `event_range` のラベル表示 |
| `table` | `on` / `off` | データ表の併記 |
| `legend` | `on` / `off` | 凡例の併記 |
| `lane_height` | 正の整数 | レーン 1 本あたりの縦幅（px）。省略（または `0`）でレンダラー既定値（60px） |

年表は本来のサイズで描画され、ノート幅より広い場合は縮小せず横スクロールします
（縮小するとラベルが読めなくなるため）。まばらな年表を広げたいときは数値の `scale`、
一覧性を優先してノート幅に収めたいときは `//! scale: fit` を使ってください（ラベルも一緒に縮小されます）。

#### 既定値（設定タブ）

**設定 → コミュニティプラグイン → Timeline DSL** で vault 全体の既定値を設定できます。
毎ブロックに同じディレクティブを書かずに済みます:

| 設定 | 値 | 既定 |
|---|---|---|
| 既定テーマ | `auto`, `default`, `dark`, `print`, `pastel` | `auto`（プラグイン CSS で Obsidian のライト/ダークに追従） |
| 既定グリッド | `none`, `decade`, `year`, `month` | `none` |
| 既定スケール | `auto` / `fit` / 正の数 | `auto` |
| イベントラベルを既定で表示 | on / off | off |
| 既定のレイアウト方向 | `horizontal`, `vertical` | `horizontal` |
| 既定レイアウトスタイル | `auto`, `timeline`, `gantt`, `group-bands`, `zigzag` | `auto`（レンダラー既定値） |
| データ表を既定で表示 | on / off | off |
| 凡例を既定で表示 | on / off | off |
| 既定レーン高さ | 空 / `0` または正の整数（px） | `0`（レンダラー既定値 60px） |
| パン/ズームを有効化 | on / off | on |

優先順位は **ブロック `//!` ディレクティブ > 設定の既定値 > 組み込み既定**。
変更は開いている全てのノートに即座に反映されます（開き直す必要はありません）。

### コマンド

マークダウンコードブロックのプレビューに加えて、本プラグインは Obsidian のコマンドパレットに 3 つのコマンドを追加します:

| コマンド | 動作するカーソル位置 | 内容 |
|---|---|---|
| `Format current tdsl block` | ` ```tdsl ` ブロック内 | 現在のブロックの DSL 本文を WASM フォーマッタで整形する。**カーソルがブロック内にある必要がある。** |
| `Fix lint issues in current tdsl block` | ` ```tdsl ` ブロック内 | 現在のブロックに対して自動修正可能な lint ルール（`missing_id` など）を適用する。修正対象が無ければ何もしない。**カーソルがブロック内にある必要がある。** |
| `Insert timeline template` | ノート内のどこでも | ピッカーを開いて選択したスターター年表（`History` / `Project plan` / `Biography` / `Reading log`）をカーソル位置に挿入する。既存のブロックは不要。 |

### 年表ツールバー

描画された年表それぞれに、以下のアクションを持つツールバー（`role="toolbar"`）が表示されます:

| ボタン | 内容 |
|---|---|
| `Fullscreen` | 年表をフルスクリーンモーダルで開く。パン/ズームの操作領域を広げるためのもの。パン/ズームを無効にしている場合は非表示。 |
| `Copy SVG` | 描画された SVG マークアップをクリップボードにコピーする |
| `Copy standalone HTML` | 年表を埋め込んだ単体で開ける HTML ドキュメントをクリップボードにコピーする |
| `Copy PNG` | 年表をラスタライズした PNG をクリップボードにコピーする |
| `Save as file` | 描画された SVG を vault 内にファイルとして保存する |

パン/ズーム（ホイールズーム・ドラッグパン）は既定で有効になっており、設定タブで
無効化できます。`//! scale: fit` や横スクロールと共存します。

### フルサンプル

```tdsl
timeline "日本史" {
    title "奈良〜江戸";
    unit year;
    range 710..1868;
    color_map {
        dynasty: "#8b5cf6";
        war:     "#ef4444";
    }
}

group "朝廷" {
    lane "天皇" as emperor { kind dynasty; order 1; }
}

group "武家政権" {
    lane "鎌倉幕府" as kamakura { kind dynasty; order 2; }
    lane "室町幕府" as muromachi { kind dynasty; order 3; }
    lane "江戸幕府" as edo      { kind dynasty; order 4; }
}

span emperor 710..794 "奈良時代" { id "nara"; tags ["dynasty"]; };
span emperor 794..1185 "平安時代" { id "heian"; tags ["dynasty"]; };

span kamakura  1185..1336 "鎌倉幕府" { id "kamakura-shogunate"; tags ["war"]; };
span muromachi 1336..1573 "室町幕府" { id "muromachi-shogunate"; tags ["war"]; };
span edo       1603..1868 "江戸幕府" { id "edo-shogunate"; tags ["war"]; };

event kamakura 1185 "源頼朝、征夷大将軍就任" { id "yoritomo-appointed"; };
event edo      1868 "明治維新" { id "meiji-restoration"; };
```

## 制限事項

以下の [Timeline DSL](https://github.com/keroway/timeline-dsl) 機能はネットワークアクセスやサーバーサイド処理が必要なため、Obsidian 内では**非対応**です:

| 機能 | 理由 |
|---|---|
| `import wikidata` | ブラウザレンダラから Wikidata への HTTP リクエスト不可 |
| `map` ブロック | `import wikidata` の解決結果に依存 |
| `template` / `apply` 構文 | `import wikidata` の解決結果に依存 |

`import wikidata` を含む `tdsl` ブロックがある場合、プラグインは警告 notice を表示し、ソース内の静的アイテム（`span` / `event` / `event_range`）のみを描画します。

Wikidata 連携が必要な場合は、[tdsl CLI](https://github.com/keroway/timeline-dsl) または [WebUI](https://keroway.github.io/timeline-dsl/) で SVG / HTML に事前レンダリングしてください。

## インストール

### コミュニティプラグイン（近日公開予定）

現時点では Obsidian コミュニティプラグインディレクトリへの申請準備中です。公開後は **設定 → コミュニティプラグイン → 閲覧** で `Timeline DSL` を検索してインストールできるようになります。

### 手動インストール（GitHub Release）

1. [Releases ページ](https://github.com/keroway/obsidian-tdsl/releases) から最新リリースの以下 3 ファイルをダウンロード:
   - `main.js`
   - `manifest.json`
   - `styles.css`
2. Vault にプラグインディレクトリを作成（存在しない場合）:

   ```sh
   mkdir -p <vault>/.obsidian/plugins/timeline-dsl/
   ```

3. ダウンロードした 3 ファイルをそのディレクトリにコピー。
4. Obsidian で **設定 → コミュニティプラグイン → インストール済みプラグイン** から **Timeline DSL** を有効化

> Obsidian 1.4.0 以上が必要です。

### 手動インストール（開発ビルド）

1. このリポジトリをクローン
2. 依存関係をインストールしてビルド:

   ```sh
   pnpm install
   pnpm run build
   ```

3. 生成された 3 ファイルを Vault にコピー:

   ```sh
   # <vault> は自分の Vault のパスに置き換えてください
   cp main.js manifest.json styles.css <vault>/.obsidian/plugins/timeline-dsl/
   ```

4. Obsidian で **設定 → コミュニティプラグイン → インストール済みプラグイン** から **Timeline DSL** を有効化

> Obsidian 1.4.0 以上が必要です。

## 開発

```bash
pnpm install          # 依存関係のインストール
pnpm run dev          # ウォッチモード（保存時に自動リビルド）
pnpm run build        # プロダクションビルド → main.js
pnpm run lint         # Biome lint
pnpm run typecheck    # tsc --noEmit
```

CI は lint → typecheck → build の順に実行し、`main.js` の生成を確認します。詳細は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照してください。

## 関連プロジェクト

| プロジェクト | 説明 |
|---|---|
| [keroway/timeline-dsl](https://github.com/keroway/timeline-dsl) | Timeline DSL コンパイラ本体（Rust + WASM）。CLI / WebUI / GitHub Actions 対応 |
| [WebUI](https://keroway.github.io/timeline-dsl/) | ブラウザで動くリアルタイムエディタ。Wikidata 連携もフル対応 |
| [ランディングページ](https://timeline-dsl-lp.pages.dev/) | 機能紹介・概要 |
| [VS Code 拡張](https://marketplace.visualstudio.com/items?itemName=keroway.timeline-dsl) | `.tdsl` ファイルのシンタックスハイライト |
| [@keroway/tdsl-wasm](https://www.npmjs.com/package/@keroway/tdsl-wasm) | このプラグインが使用する WASM パッケージ |

## ライセンス

MIT © keroway

同梱依存のサードパーティライセンスは [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md) を参照してください。
