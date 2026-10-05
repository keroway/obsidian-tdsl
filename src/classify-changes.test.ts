// tsconfig は `types` を指定しない（TS 7 の既定は空）ので、プラグイン本体に Node の
// グローバルを漏らさないよう、node: を使うこのテストだけで型を読み込む。
/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// scripts/classify-changes.sh は CI の `changes` ジョブが呼ぶ分類ルール本体（#286）。
// 実際に bash で起動し、変更パス → 起動するジョブ集合の対応を固定する。

const SCRIPT = fileURLToPath(
	new URL("../scripts/classify-changes.sh", import.meta.url),
);

const JOBS = ["test", "lint", "typecheck", "build", "audit", "typos"] as const;
type Job = (typeof JOBS)[number];

/** 変更ファイル一覧を渡し、`true` になったジョブ名を返す。 */
function classify(files: string[]): Job[] {
	const result = spawnSync("bash", [SCRIPT], {
		input: files.join("\n"),
		encoding: "utf8",
	});
	expect(result.status, result.stderr).toBe(0);
	const out = new Map(
		result.stdout
			.trim()
			.split("\n")
			.map((line) => line.split("=") as [string, string]),
	);
	// 出力契約: 全ジョブ分のキーが必ず true/false で出る（ci.yml の outputs が前提にする）。
	expect([...out.keys()]).toEqual([...JOBS]);
	return JOBS.filter((job) => out.get(job) === "true");
}

describe("classify-changes.sh", () => {
	const ALL = [...JOBS];

	it.each([
		// #286: これまで分類が無く、変更しても検査が 1 つも起動しなかったパス
		[["lefthook.yml"], ["lint", "typos"]],
		[["justfile"], ["lint", "typos"]],
		[["scripts/capture-screenshots.sh"], ["typos"]],
		// .github 配下（ci.yml 以外）
		[[".github/workflows/release.yml"], ["typos"]],
		[[".github/agent-automation.yml"], ["typos"]],
		// 既存の分類（挙動を変えていないこと）
		[["src/main.ts"], ["test", "lint", "typecheck", "build", "typos"]],
		[["esbuild.config.mjs"], ["lint", "build"]],
		[["vitest.config.ts"], ["test", "lint", "typecheck"]],
		[["tsconfig.json"], ["lint", "typecheck"]],
		[["biome.json"], ["lint"]],
		[["version-bump.mjs"], ["lint"]],
		[["manifest.json"], ["lint"]],
		[["README.md"], ["typos"]],
		[["docs/guide.md"], ["typos"]],
		[["_typos.toml"], ["typos"]],
	] as [string[], Job[]][])("%j → %j", (files, expected) => {
		expect(classify(files)).toEqual(expected);
	});

	it.each([
		"__all__",
		".github/workflows/ci.yml",
		"scripts/classify-changes.sh",
		"mise.toml",
		"package.json",
		"pnpm-lock.yaml",
		"pnpm-workspace.yaml",
	])("%s は全ジョブを起動する", (file) => {
		expect(classify([file])).toEqual(ALL);
	});

	it.each([
		".claude/settings.json",
		"plans/001-foo.txt",
		"docs/assets/preview-light.png",
		".gitignore",
		".editorconfig",
		"LICENSE",
	])("%s は起動不要と確認済みなので何も起動しない", (file) => {
		expect(classify([file])).toEqual([]);
	});

	it("未分類のパスは全ジョブを起動する（分類の足し忘れで検査が飛ばない）", () => {
		expect(classify(["some-new-config.toml"])).toEqual(ALL);
		expect(classify(["new-dir/file.txt"])).toEqual(ALL);
	});

	it("複数ファイルは和集合になる", () => {
		expect(classify(["lefthook.yml", "tsconfig.json"])).toEqual([
			"lint",
			"typecheck",
			"typos",
		]);
		expect(classify(["biome.json", "scripts/capture-screenshots.sh"])).toEqual([
			"lint",
			"typos",
		]);
	});

	it("起動不要なファイルが混ざっても他の分類を打ち消さない", () => {
		expect(classify([".gitignore", "lefthook.yml"])).toEqual(["lint", "typos"]);
	});

	it("空の変更一覧では何も起動しない（空行を未分類として全起動しない）", () => {
		expect(classify([])).toEqual([]);
		expect(classify(["", ""])).toEqual([]);
	});

	it("末尾改行が無い最終行も読む", () => {
		const result = spawnSync("bash", [SCRIPT], {
			input: "lefthook.yml",
			encoding: "utf8",
		});
		expect(result.stdout).toContain("lint=true");
	});
});
