// 移植元: ../timeline-dsl/apps/webui/src/lang-tdsl/keywords.ts
//         ../timeline-dsl/apps/webui/src/lang-tdsl/keywords.json
//
// 上流の単一真実源（timeline-dsl リポジトリの keywords.json）を手動で追従する。
// `@keroway/tdsl-wasm` のバージョン追従と同じ運用: 上流でキーワードが追加・変更
// されたら、このファイルも合わせて手動更新すること（CI 等での自動同期はない）。
//
// obsidian-tdsl 側の DSL には存在しない（または非推奨の）キーワードは上流の
// MISC_KEYWORDS から除去している:
//   - `target_type` / `target_lane` — grammar.pest 上は `map ... to <ident>` の
//     ident 部分を指す内部的な文法規則名で、DSL 上のリテラルキーワードではない
//     （`"target_type"` / `"target_lane"` という文字列トークンは grammar.pest 中に
//     一度も現れない）
//   - `era` — レーン種別（`kind` の値）として上流の keywords.rs には残っているが、
//     tdsl-core::ir::LaneKind::parse が受理するのは `custom` / `dynasty` /
//     `person` / `country` のみで `era` は含まれない（非対応の値）

export const BLOCK_KEYWORDS: readonly string[] = [
	"timeline",
	"lane",
	"group",
	"import",
	"map",
	"template",
	"apply",
	"color_map",
	"policy",
];

export const ITEM_KEYWORDS: readonly string[] = [
	"span",
	"event",
	"event_range",
];

export const MISC_KEYWORDS: readonly string[] = [
	"as",
	"query",
	"wikidata",
	"unit",
	"range",
	"calendar",
	"kind",
	"order",
	"tags",
	"source",
	"label",
	"start",
	"end",
	"time",
	"id",
	"merge_by_source",
	"overwrite_imported",
	"keep_manual",
	"proleptic_gregorian",
	"year",
	"month",
	"day",
	"hour",
	"minute",
	"second",
	"now",
	"dynasty",
	"person",
	"country",
	"custom",
	"title",
	"field_priority",
	"origin",
	"note",
	"link",
	"color",
	"expand",
	"qualifier",
];
