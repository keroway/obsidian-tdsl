# obsidian-tdsl セキュリティ指針

## XSS セーフな SVG 挿入

`src/main.ts` の SVG 挿入は `DOMParser` + `document.adoptNode` を使う。
`innerHTML` に置き換えるとスクリプト注入が可能になる。この実装は意図的なもので、
`innerHTML` への置き換えを提案しない。

```ts
const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
wrapper.appendChild(document.adoptNode(doc.documentElement));
```
