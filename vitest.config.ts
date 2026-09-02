import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// Node by default: every module but one is DOM-free, and a global DOM
		// implementation would slow the whole suite down. The tests that do need
		// one opt in per file with a `// @vitest-environment happy-dom` docblock
		// (currently only svg-accessibility.test.ts).
		environment: "node",
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.d.ts",
				// main.ts は Obsidian の `Plugin` ライフサイクルと `App` API に
				// 密結合したエントリポイントで、単体テストの費用対効果が低い。
				// 一方 src/ 全体 5,220 行のうち約 1/4 を占めるため、計測に含めたままだと
				// 「main.ts が育つたびに閾値を下げる」運用になり、ゲートの意味が消える（#188）。
				// 除外する代わりに、残りのモジュールへは実測に沿った高い閾値を課している。
				// #219（#188 の案 B）で純粋ロジック 4 件を切り出したが、残りは
				// Plugin ライフサイクルと DOM 配線で、ホストアプリを模さない限り
				// 単体テストから到達できない（除外を外すと 0% のまま集約値が
				// 90% → 52% に落ち、閾値を実質無効化する）。除外は維持し、
				// 代わりに src/main-budget.test.ts の行数バジェットで肥大を検知する。
				"src/main.ts",
			],
			thresholds: {
				// 除外後の実測値に沿ったラチェット。下げるのではなく、
				// 実態が上がったら上げること（下げる変更は理由を PR に書く）。
				// 実測 (2026-09-02, #219 の切り出し 4 件を反映):
				//   statements 90.54 / branches 88.57 / functions 88.54 / lines 90.76
				// 直下に置いて、通常の変動では落ちず実質的な劣化では落ちるようにする。
				statements: 89,
				branches: 87,
				functions: 87,
				lines: 89,
				// 集約値だけでは「1 ファイルが丸ごと 0% でも全体は通る」（#191）。
				// 実際 editor-highlight.ts は 147 行すべて未テストのまま
				// 87.63% の集約閾値を通過していた。ファイル単位の下限で塞ぐ。
				//
				// ViewPlugin 本体は EditorView に密結合でテスト対象外のため
				// 到達可能な上限は高くない。切り出した純関数（予算配分・本文範囲・
				// 可視判定）のテストが消えたら落ちる高さに置く。
				// 実測 (2026-08-11): statements 24.44 / branches 22.22 /
				//                    functions 40 / lines 24.32
				"src/editor-highlight.ts": {
					statements: 22,
					branches: 20,
					functions: 38,
					lines: 22,
				},
			},
		},
	},
});
