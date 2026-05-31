# obsidian-tdsl

[Timeline DSL](https://github.com/keroway/timeline-dsl) の Obsidian プラグイン。

ノートに ` ```tdsl ` コードブロックを書くと、プレビュー時に SVG 年表として描画されます。

## 使い方

````markdown
```tdsl
timeline "平安時代" {
  unit year
  range 794 to 1185
}
lane "天皇" as emperor {}
span emperor 781..806 "桓武天皇" {}
span emperor 806..809 "平城天皇" {}
span emperor 809..823 "嵯峨天皇" {}
```
````

## 制限事項

- Wikidata インポート（`import wikidata`）はブラウザから実行不可のため未対応。静的アイテム（`span` / `event` / `event_range`）のみ描画されます。

## インストール（開発版）

1. このリポジトリをクローン
2. `npm install && npm run build`
3. 生成された `main.js` / `manifest.json` / `styles.css` を Obsidian vault の `.obsidian/plugins/obsidian-tdsl/` にコピー
4. Obsidian の「コミュニティプラグイン」から有効化

## 開発

```bash
npm install
npm run dev   # ウォッチモード
npm run build # プロダクションビルド
npm run lint  # ESLint
```

## ライセンス

MIT © keroway
