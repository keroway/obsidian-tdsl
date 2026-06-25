# スクリーンショット撮影ガイド（#6 用）

README のライト / ダークのスクリーンショットを **一貫した見た目** で撮るための手順とサンプル `tdsl` を置いています。
プラグインの描画は同じ DSL ならライト / ダークで自動的に切り替わる（`theme: auto`）ので、**同じノートをモード切替して 2 枚撮る**だけで揃います。

## 出力先 / ファイル名

README が参照しているパスに合わせてください（変更する場合は README 側も更新）。

- ライト: `docs/assets/preview-light.png`
- ダーク: `docs/assets/preview-dark.png`

## 撮影手順

1. このプラグインを有効化した Vault で新規ノートを作成。
2. 下の **ヒーロー用サンプル** のコードブロックを丸ごと貼り付け、リーディングビュー（または Live Preview）で描画を確認。
3. **設定 → 外観 → ベースカラースキーム** を「ライト」にして 1 枚撮影 → `preview-light.png`。
4. 同じく「ダーク」にして 1 枚撮影 → `preview-dark.png`。
5. 余白はコードブロック（`.tdsl-preview`）の枠が収まる範囲でトリミング。横幅は 1200px 前後を推奨。

> ヒント: 横長になりすぎる場合は先頭に `//! scale: fit` を足すとノート幅に収まります（撮影しやすさ優先のとき）。

---

## ヒーロー用サンプル（メインのスクリーンショット）

グループ・`color_map`・グリッド・イベントラベルをすべて含み、プラグインの表現力が一目で伝わる構成です（描画サイズ ≒ 1140×420）。

````markdown
```tdsl
//! grid: decade
//! events: on
timeline "西洋音楽史" {
    title "西洋音楽史 — 大作曲家の生涯";
    unit year;
    range 1680..1920;
    color_map {
        baroque: "#b45309";
        classical: "#2563eb";
        romantic: "#9333ea";
    }
}

group "バロック" {
    lane "J.S. バッハ" as bach { kind baroque; order 1; }
    lane "ヘンデル" as handel { kind baroque; order 2; }
}

group "古典派" {
    lane "モーツァルト" as mozart { kind classical; order 3; }
    lane "ベートーヴェン" as beethoven { kind classical; order 4; }
}

group "ロマン派" {
    lane "ショパン" as chopin { kind romantic; order 5; }
    lane "ブラームス" as brahms { kind romantic; order 6; }
}

span bach 1685..1750 "J.S. バッハ" { tags ["baroque"]; };
span handel 1685..1759 "ヘンデル" { tags ["baroque"]; };
span mozart 1756..1791 "モーツァルト" { tags ["classical"]; };
span beethoven 1770..1827 "ベートーヴェン" { tags ["classical"]; };
span chopin 1810..1849 "ショパン" { tags ["romantic"]; };
span brahms 1833..1897 "ブラームス" { tags ["romantic"]; };

event bach 1722 "平均律クラヴィーア曲集 第1巻" {};
event beethoven 1824 "交響曲第9番 初演" {};
```
````

---

## コンパクト用サンプル（補助・横長バナー向け）

2 レーンの薄型（描画サイズ ≒ 1140×180）。機能紹介の小さな差し込み画像や、ライト/ダーク横並びに向きます。

````markdown
```tdsl
//! grid: decade
timeline "日本の元号（近現代）" {
    title "日本の元号 — 明治〜令和";
    unit year;
    range 1860..2030;
    color_map { era: "#0ea5e9"; event: "#f43f5e"; }
}
lane "元号" as era { kind era; order 1; }
lane "主な出来事" as ev { kind event; order 2; }

span era 1868..1912 "明治" { tags ["era"]; };
span era 1912..1926 "大正" { tags ["era"]; };
span era 1926..1989 "昭和" { tags ["era"]; };
span era 1989..2019 "平成" { tags ["era"]; };
span era 2019..2030 "令和" { tags ["era"]; };

event ev 1872 "鉄道開業" {};
event ev 1964 "東京五輪" {};
event ev 1995 "Windows 95" {};
```
````

---

## 撮影後

`README.md` / `README.ja.md` の「プレビュー」節にあるコメントアウト済みプレースホルダを、実画像への参照に差し替えてください。

```markdown
![Timeline DSL preview (light)](docs/assets/preview-light.png)
![Timeline DSL preview (dark)](docs/assets/preview-dark.png)
```

> 上記 2 サンプルは `@keroway/tdsl-wasm` の `check_source` でエラーなしを確認済みです。
> 文法を変更した場合は `npm run build` 後に再確認してください。
