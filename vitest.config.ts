import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
		coverage: {
			provider: "v8",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/wasm.d.ts",
				// main.ts は Obsidian の `Plugin` ライフサイクルと `App` API に
				// 密結合したエントリポイントで、単体テストの費用対効果が低い。
				// 一方 src/ 全体 5,220 行のうち約 1/4 を占めるため、計測に含めたままだと
				// 「main.ts が育つたびに閾値を下げる」運用になり、ゲートの意味が消える（#188）。
				// 除外する代わりに、残りのモジュールへは実測に沿った高い閾値を課している。
				// main.ts からロジックを切り出してテスト可能にする改善（#188 の案 B）は別途。
				"src/main.ts",
			],
			thresholds: {
				// 除外後の実測値に沿ったラチェット。下げるのではなく、
				// 実態が上がったら上げること（下げる変更は理由を PR に書く）。
				// 実測 (2026-08-11, main.ts 除外後):
				//   statements 87.63 / branches 86.62 / functions 86.36 / lines 88.00
				// 直下に置いて、通常の変動では落ちず実質的な劣化では落ちるようにする。
				statements: 86,
				branches: 85,
				functions: 85,
				lines: 87,
			},
		},
	},
});
