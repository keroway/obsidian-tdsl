import { describe, expect, it } from "vitest";
import {
	fenceBodyLineRange,
	intersectsVisibleRanges,
	remainingParseBudgetMs,
	TOTAL_PARSE_BUDGET_MS,
} from "./editor-highlight";

/**
 * `editor-highlight.ts` は 147 行すべてが未テストのまま、集約カバレッジ閾値を
 * 通過していた（#191）。ここで検証するのは、壊れても**例外にならない**3 つの
 * 計算 — 予算配分・本文範囲・可視判定。
 *
 * `ViewPlugin` 本体は `EditorView` に密結合なので対象外。
 */

describe("remainingParseBudgetMs", () => {
	it("経過時間ぶんだけ残り予算を減らす", () => {
		expect(remainingParseBudgetMs(0)).toBe(TOTAL_PARSE_BUDGET_MS);
		expect(remainingParseBudgetMs(20)).toBe(TOTAL_PARSE_BUDGET_MS - 20);
	});

	it("使い切ると 0 以下を返す（呼び出し側の打ち切り条件）", () => {
		// buildDecorations は `<= 0` で break する。境界そのものを固定する。
		expect(remainingParseBudgetMs(TOTAL_PARSE_BUDGET_MS)).toBe(0);
		expect(remainingParseBudgetMs(TOTAL_PARSE_BUDGET_MS + 1)).toBeLessThan(0);
	});

	it("使い切る手前では正の予算が残る", () => {
		expect(remainingParseBudgetMs(TOTAL_PARSE_BUDGET_MS - 1)).toBeGreaterThan(
			0,
		);
	});

	it("ブロックごとではなく合計を上限にする（残り予算が単調に減る）", () => {
		// 固定のブロック単位タイムアウトだと合計がブロック数に比例して伸びる。
		// 逐次縮む設計であることを、経過時間を進めて確かめる。
		const budgets = [5, 15, 30, 45].map((elapsed) =>
			remainingParseBudgetMs(elapsed),
		);
		for (let i = 1; i < budgets.length; i++) {
			expect(budgets[i]).toBeLessThan(budgets[i - 1]);
		}
	});
});

describe("fenceBodyLineRange", () => {
	it("0-indexed のフェンス位置を 1-indexed の本文行へ変換する", () => {
		// lines[1] = "```tdsl", lines[2] = 本文, lines[3] = "```" のとき、
		// CodeMirror の 1-indexed では本文は 3 行目だけ。
		expect(fenceBodyLineRange(1, 3)).toEqual({
			startLineNo: 3,
			endLineNo: 3,
		});
	});

	it("複数行の本文を取りこぼさない", () => {
		expect(fenceBodyLineRange(0, 4)).toEqual({
			startLineNo: 2,
			endLineNo: 4,
		});
	});

	it("フェンスが隣接する空ボディでは null を返す", () => {
		// openLine=1, closeLine=2 → startLineNo=3 > endLineNo=2。
		// ここで null を返さないと、閉じフェンス行自体を色付けしてしまう。
		expect(fenceBodyLineRange(1, 2)).toBeNull();
	});

	it("開始行が終了行を越える壊れた範囲でも null を返す", () => {
		expect(fenceBodyLineRange(5, 3)).toBeNull();
	});
});

describe("intersectsVisibleRanges", () => {
	const ranges = [
		{ from: 100, to: 200 },
		{ from: 400, to: 500 },
	];

	it("可視範囲に完全に含まれるブロックを可視と判定する", () => {
		expect(intersectsVisibleRanges(120, 180, ranges)).toBe(true);
	});

	it("可視範囲をまたぐブロックを可視と判定する", () => {
		expect(intersectsVisibleRanges(50, 150, ranges)).toBe(true);
		expect(intersectsVisibleRanges(450, 900, ranges)).toBe(true);
	});

	// 端点でのみ接する場合、既存実装は可視として扱う（`<=` / `>=`）。
	// `visibleRanges` を半開区間 `[from, to)` と解釈するなら不可視が厳密だが、
	// **このテストは現状の挙動を固定するためのもの**で、正しさの主張ではない。
	//
	// 締める側に倒すと「実際には見えているブロックが色付かない」方向に失敗し、
	// 現状のまま緩いと「画面外のブロックを 1 つ余分にパースする」だけで済む。
	// 影響が小さいうえ失敗の向きが安全なので、この PR では変えない（#191 は
	// テスト欠落を埋めるのが目的で、挙動変更は範囲外）。
	it("端で接するだけのブロックも可視と判定する（現状の挙動を固定）", () => {
		expect(intersectsVisibleRanges(200, 300, ranges)).toBe(true);
		expect(intersectsVisibleRanges(0, 100, ranges)).toBe(true);
	});

	it("どの可視範囲とも重ならないブロックは不可視と判定する", () => {
		// これが常に true を返すようになっても描画結果は変わらず、
		// 画面外ブロックを無駄にパースするだけ。テストでしか気づけない。
		expect(intersectsVisibleRanges(250, 350, ranges)).toBe(false);
		expect(intersectsVisibleRanges(600, 700, ranges)).toBe(false);
	});

	it("可視範囲が空なら不可視と判定する", () => {
		expect(intersectsVisibleRanges(120, 180, [])).toBe(false);
	});
});
