// 移植元: ../timeline-dsl/apps/webui/src/lang-tdsl/index.ts
//
// 上流の単一真実源（timeline-dsl リポジトリの CodeMirror StreamLanguage 実装）を
// 手動で追従する。`@keroway/tdsl-wasm` のバージョン追従と同じ運用: 上流で
// tokenizer の挙動が変わったら、このファイルも合わせて手動更新すること
// （CI 等での自動同期はない）。
//
// obsidian API にも `@keroway/tdsl-wasm` にも依存しない、純粋な字句解析ロジック
// 層としてこのファイルを保つこと（親 Issue #114 の下位タスク #174）。
// Obsidian 側への統合（CM6 拡張としての登録）は後続 Issue #175 で行う。
//
// 上流からの改善点（移植時点で上流にはまだ無いもの）:
//   1. 日時リテラルの秒精度・タイムゾーンオフセット対応
//      上流の日付判定は `YYYY-MM-DD` の日付部分のみにマッチし、その後ろに続く
//      `THH:MM(:SS)?(Z|±HH:MM)?` の時刻部分を考慮していなかった。そのため
//      `2024-01-01T12:00:00Z` のような値は日付部分だけが `number` として着色され、
//      残りの `T12:00:00Z` が識別子・句読点として分割着色されてしまう
//      （grammar.pest の `date_time_lit` 規則を参照）。ここでは日時全体にマッチする
//      正規表現を日付単独のものより先に試すことで、値全体を単一の `number` トークン
//      として扱う。
//   2. `label@zh-hans` のような複数セグメントの言語タグに対応
//      上流は `label@[a-z]{2,3}` という ISO 639 の言語コードのみを想定した正規表現
//      だったため、`zh-hans` のようなハイフン区切りの BCP47 風タグや大文字を含む
//      タグ（`label@en-US` 等）にマッチできなかった。grammar.pest の `label_ref` は
//      `"label" ~ "@" ~ ident` であり、`ident` はハイフンを含む一般の識別子なので、
//      ここでは `ident` と同じ文字クラスに合わせて広げている。
//   3. `era` / `target_type` / `target_lane` の除去
//      キーワード表自体の差分（`src/tdsl-keywords.ts` の先頭コメント参照）。

import { LanguageSupport, StreamLanguage } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
	BLOCK_KEYWORDS as BLOCK_KWS,
	ITEM_KEYWORDS as ITEM_KWS,
	MISC_KEYWORDS as MISC_KWS,
} from "./tdsl-keywords";

interface TdslState {
	inBlockComment: boolean;
}

const BLOCK_KEYWORDS = new Set(BLOCK_KWS);
const ITEM_KEYWORDS = new Set(ITEM_KWS);
const MISC_KEYWORDS = new Set(MISC_KWS);

export const tdslLanguage = StreamLanguage.define<TdslState>({
	name: "tdsl",
	tokenTable: {
		keyword: tags.keyword,
		definitionKeyword: tags.definitionKeyword,
		modifier: tags.modifier,
		string: tags.string,
		number: tags.number,
		atom: tags.atom,
		lineComment: tags.lineComment,
		blockComment: tags.blockComment,
		directive: tags.meta,
		punctuation: tags.punctuation,
		special: tags.special(tags.variableName),
	},
	startState(): TdslState {
		return { inBlockComment: false };
	},
	copyState(state): TdslState {
		return { inBlockComment: state.inBlockComment };
	},
	token(stream, state): string | null {
		// ブロックコメント継続
		if (state.inBlockComment) {
			if (stream.match("*/")) {
				state.inBlockComment = false;
				return "blockComment";
			}
			stream.next();
			return "blockComment";
		}

		if (stream.eatSpace()) return null;

		// `//! key: value` ディレクティブコメント — 通常の行コメントと区別する。
		// src/utils.ts の parseRenderDirectives（`^[ \t]*\/\/!`）と同じく、行頭
		// から空白のみを挟んだ位置に現れる場合だけディレクティブとして扱う。
		// eatSpace() は既に行頭の空白を消費済みなので、ここでの判定は
		// 「この行でここまでに空白以外の文字が出ていないか」で行う。
		if (
			/^\s*$/.test(stream.string.slice(0, stream.pos)) &&
			stream.match("//!")
		) {
			stream.skipToEnd();
			return "directive";
		}

		// 行コメント
		if (stream.match("//")) {
			stream.skipToEnd();
			return "lineComment";
		}

		// ブロックコメント開始
		if (stream.match("/*")) {
			state.inBlockComment = true;
			while (!stream.eol()) {
				if (stream.match("*/")) {
					state.inBlockComment = false;
					break;
				}
				stream.next();
			}
			return "blockComment";
		}

		// 文字列リテラル
		if (stream.peek() === '"') {
			stream.next();
			while (!stream.eol()) {
				const c = stream.next();
				if (c === "\\") {
					stream.next();
					continue;
				}
				if (c === '"') break;
			}
			return "string";
		}

		// claim(...).xxx 式（関数呼び出し＋プロパティアクセス）
		if (stream.match(/^claim\s*\(/)) {
			let depth = 1;
			while (!stream.eol() && depth > 0) {
				const c = stream.next();
				if (c === "(") depth++;
				if (c === ")") depth--;
			}
			stream.match(/^(\.\w+)*/);
			return "special";
		}

		// label@lang 式
		// grammar.pest の label_ref（`"label" ~ "@" ~ ident`）に合わせ、ハイフンを
		// 含む複数セグメントの言語タグ（例: `label@zh-hans`）も 1 トークンとして扱う。
		if (stream.match(/^label@[a-zA-Z_][a-zA-Z0-9_-]*/)) {
			return "special";
		}

		// wd:QXX（Wikidata エンティティ参照）
		if (stream.match(/^wd:[A-Z][0-9]+/)) {
			return "atom";
		}

		// 数値リテラル — 日時（秒精度・タイムゾーンオフセット付きを含む）・日付
		// （YYYY-MM-DD）・年月（YYYY-MM）・年（-?YYYY）。識別子の前にチェックする。
		//
		// 日時（`YYYY-MM-DDTHH:MM(:SS)?(Z|±HH:MM)?`）は日付単独のパターンより先に
		// 試す必要がある。そうしないと `2024-01-01T12:00:00Z` の日付部分だけが
		// マッチしてしまい、残りの `T12:00:00Z` が識別子・句読点に分割されてしまう。
		if (
			stream.match(
				/^-?\d{1,4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})?/,
			)
		) {
			return "number";
		}
		if (stream.match(/^-?\d{1,4}-\d{2}-\d{2}/)) {
			return "number";
		}
		if (stream.match(/^-?\d{1,4}-\d{2}(?!-?\d)/)) {
			return "number";
		}
		if (stream.match(/^-?\d+(\.\d+)?/)) {
			return "number";
		}

		// 識別子・キーワード
		// grammar.pest の ident（2 文字目以降にハイフンを許す）に合わせる。
		// これがないと `my-span` が `my` / `-` / `span` に分割され、末尾の
		// `span` がキーワードとして誤着色される（上流 #395）。
		const wordMatch = stream.match(/^[a-zA-Z_][a-zA-Z0-9_-]*/);
		if (wordMatch) {
			const word = Array.isArray(wordMatch) ? wordMatch[0] : "";
			if (!word) return null;
			// QID / PID: 識別子パターンに引っかかった場合のフォールバック
			if (/^Q\d+$/.test(word) || /^P\d+$/.test(word)) return "atom";
			if (BLOCK_KEYWORDS.has(word)) return "keyword";
			if (ITEM_KEYWORDS.has(word)) return "definitionKeyword";
			if (MISC_KEYWORDS.has(word)) return "modifier";
			return null;
		}

		// punctuation
		const ch = stream.peek();
		if (ch && "{}[];,".includes(ch)) {
			stream.next();
			return "punctuation";
		}
		if (stream.match("..")) return "punctuation";
		if (ch === ".") {
			stream.next();
			return "punctuation";
		}

		stream.next();
		return null;
	},
});

export function tdsl(): LanguageSupport {
	return new LanguageSupport(tdslLanguage);
}
