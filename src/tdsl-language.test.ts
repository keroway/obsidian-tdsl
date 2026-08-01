import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { tdslLanguage } from "./tdsl-language";

interface Token {
	type: string;
	text: string;
}

/**
 * `EditorState` 経由で `StreamLanguage` の tokenizer を直接叩き、生成された
 * トークン列を返す。`EditorView` は jsdom が必要になるため使わず、
 * `syntaxTree` で構文木を取り出して各リーフノードをトークンとして読む。
 */
function tokenize(source: string): Token[] {
	const state = EditorState.create({
		doc: source,
		extensions: [tdslLanguage],
	});
	const tree = syntaxTree(state);
	const tokens: Token[] = [];
	tree.iterate({
		enter: (node) => {
			if (node.type.isTop) return;
			tokens.push({
				type: node.name,
				text: state.doc.sliceString(node.from, node.to),
			});
		},
	});
	return tokens;
}

/** 種別トークン（punctuation や無名トークンを除く）だけを `[type, text]` の組で返す。 */
function significantTokens(source: string): [string, string][] {
	return tokenize(source)
		.filter((t) => t.type !== "punctuation")
		.map((t) => [t.type, t.text]);
}

describe("tdslLanguage tokenizer", () => {
	it("classifies block keywords", () => {
		expect(significantTokens("timeline")).toEqual([["keyword", "timeline"]]);
		expect(significantTokens("lane")).toEqual([["keyword", "lane"]]);
		expect(significantTokens("group")).toEqual([["keyword", "group"]]);
		expect(significantTokens("import")).toEqual([["keyword", "import"]]);
		expect(significantTokens("map")).toEqual([["keyword", "map"]]);
		expect(significantTokens("template")).toEqual([["keyword", "template"]]);
		expect(significantTokens("apply")).toEqual([["keyword", "apply"]]);
		expect(significantTokens("color_map")).toEqual([["keyword", "color_map"]]);
		expect(significantTokens("policy")).toEqual([["keyword", "policy"]]);
	});

	it("classifies item keywords as definitionKeyword", () => {
		expect(significantTokens("span")).toEqual([["definitionKeyword", "span"]]);
		expect(significantTokens("event")).toEqual([
			["definitionKeyword", "event"],
		]);
		expect(significantTokens("event_range")).toEqual([
			["definitionKeyword", "event_range"],
		]);
	});

	it("classifies misc keywords as modifier", () => {
		expect(significantTokens("unit")).toEqual([["modifier", "unit"]]);
		expect(significantTokens("range")).toEqual([["modifier", "range"]]);
		expect(significantTokens("calendar")).toEqual([["modifier", "calendar"]]);
		expect(significantTokens("kind")).toEqual([["modifier", "kind"]]);
		expect(significantTokens("proleptic_gregorian")).toEqual([
			["modifier", "proleptic_gregorian"],
		]);
	});

	it("does not classify removed keywords (era / target_type / target_lane) as keywords", () => {
		for (const word of ["era", "target_type", "target_lane"]) {
			const tokens = tokenize(word);
			// null 型トークンは StreamLanguage 上、通常 "" という無名ノード名になる。
			expect(tokens.every((t) => t.type !== "modifier")).toBe(true);
		}
	});

	it("tokenizes line comments", () => {
		const tokens = tokenize("// これはコメント\ntimeline");
		expect(tokens[0]?.type).toBe("lineComment");
		expect(tokens[0]?.text).toBe("// これはコメント");
		const kw = tokens.find((t) => t.text === "timeline");
		expect(kw?.type).toBe("keyword");
	});

	it("tokenizes block comments spanning multiple lines", () => {
		const tokens = tokenize("/* block\ncomment */\ntimeline");
		const blockComments = tokens.filter((t) => t.type === "blockComment");
		expect(blockComments.length).toBeGreaterThan(0);
		const kw = tokens.find((t) => t.text === "timeline");
		expect(kw?.type).toBe("keyword");
	});

	it("tokenizes single-line block comments", () => {
		expect(significantTokens("/* inline */")).toEqual([
			["blockComment", "/* inline */"],
		]);
	});

	it("tokenizes string literals", () => {
		expect(significantTokens('"hello world"')).toEqual([
			["string", '"hello world"'],
		]);
	});

	it("tokenizes string literals containing escaped quotes", () => {
		expect(significantTokens('"say \\"hi\\""')).toEqual([
			["string", '"say \\"hi\\""'],
		]);
	});

	it("tokenizes plain year numbers", () => {
		expect(significantTokens("1969")).toEqual([["number", "1969"]]);
		expect(significantTokens("-300")).toEqual([["number", "-300"]]);
	});

	it("tokenizes year-month values", () => {
		expect(significantTokens("2024-06")).toEqual([["number", "2024-06"]]);
	});

	it("tokenizes date values", () => {
		expect(significantTokens("2024-06-10")).toEqual([["number", "2024-06-10"]]);
	});

	it("tokenizes minute-precision date-time values", () => {
		expect(significantTokens("2024-06-10T10:00")).toEqual([
			["number", "2024-06-10T10:00"],
		]);
	});

	it("tokenizes second-precision date-time values as a single number token", () => {
		// 上流の既知の穴: 日付部分だけが number として着色され、`T13:39:15Z` が
		// 別トークンに分割されてしまっていた。ここでは値全体が 1 トークンになる
		// ことを固定する。
		expect(significantTokens("2024-03-04T13:39:15Z")).toEqual([
			["number", "2024-03-04T13:39:15Z"],
		]);
	});

	it("tokenizes date-time values with a positive timezone offset", () => {
		expect(significantTokens("2024-06-10T10:00+09:00")).toEqual([
			["number", "2024-06-10T10:00+09:00"],
		]);
	});

	it("tokenizes date-time values with a negative timezone offset", () => {
		expect(significantTokens("2024-06-10T09:00-05:00")).toEqual([
			["number", "2024-06-10T09:00-05:00"],
		]);
	});

	it("tokenizes second-precision date-time values with a timezone offset", () => {
		expect(significantTokens("2024-03-04T13:39:15+09:00")).toEqual([
			["number", "2024-03-04T13:39:15+09:00"],
		]);
	});

	it("tokenizes the range operator as punctuation", () => {
		const tokens = tokenize("2020..2030");
		const dots = tokens.filter((t) => t.text === "..");
		expect(dots).toHaveLength(1);
		expect(dots[0]?.type).toBe("punctuation");
	});

	it("does not split hyphenated identifiers into keyword fragments", () => {
		// grammar.pest の ident は 2 文字目以降にハイフンを許すため、`my-span` は
		// 単一の識別子として扱われ、末尾の `span` がキーワードとして誤着色されない
		// （上流 #395 の回帰）。
		//
		// 無名（`null` を返す）トークンは StreamLanguage の構文木にノードとして
		// 現れないため、「`my-span` 全体がプレーンな識別子として消費された」ことは
		// 「先頭の `span`（item keyword）以外にキーワード系トークンが一切現れない」
		// ことで確認する。もし `my-span` が `my` / `-` / `span` に分割されて末尾の
		// `span` がキーワード扱いされていれば、ここで 2 件目の
		// definitionKeyword/keyword ノードが現れてしまう。
		const tokens = tokenize("span my-span 2020");
		const definitionKeyword = tokens.filter(
			(t) => t.type === "definitionKeyword",
		);
		expect(definitionKeyword).toHaveLength(1);
		expect(definitionKeyword[0]?.text).toBe("span");
		expect(tokens.some((t) => t.text === "my-span")).toBe(false);
		expect(tokens.some((t) => t.text === "my")).toBe(false);
		const numberToken = tokens.find((t) => t.type === "number");
		expect(numberToken?.text).toBe("2020");
	});

	it("tokenizes wd:Qnn wikidata references as atom", () => {
		expect(significantTokens("wd:Q42")).toEqual([["atom", "wd:Q42"]]);
	});

	it("tokenizes bare QID/PID fallbacks as atom", () => {
		expect(significantTokens("Q42")).toEqual([["atom", "Q42"]]);
		expect(significantTokens("P31")).toEqual([["atom", "P31"]]);
	});

	it("tokenizes claim(...) expressions as special", () => {
		expect(significantTokens("claim(P31).time")).toEqual([
			["special", "claim(P31).time"],
		]);
	});

	it("tokenizes label@lang expressions as special", () => {
		expect(significantTokens("label@en")).toEqual([["special", "label@en"]]);
	});

	it("tokenizes label@lang expressions with long BCP47-like tags as a single token", () => {
		// 上流の既知の穴: `label@[a-z]{2,3}` は ISO 639 の 2〜3 文字コードしか
		// 想定しておらず、`zh-hans` のようなハイフン入りの複数セグメントタグや
		// 大文字を含むタグ（`en-US`）にマッチできなかった。
		expect(significantTokens("label@zh-hans")).toEqual([
			["special", "label@zh-hans"],
		]);
		expect(significantTokens("label@en-US")).toEqual([
			["special", "label@en-US"],
		]);
	});
});
