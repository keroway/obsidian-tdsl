# keroway 標準 justfile（package.json scripts への薄い委譲のみ）。

default:
    @just --list

build:
    pnpm run build

test:
    pnpm test

lint:
    pnpm run lint

format:
    pnpm run format

# lint / format:check / typecheck / test をまとめて実行（コミット前の全通し確認）
check:
    pnpm run check

# 誤字検査（typos CLI が必要。brew install typos-cli / cargo install typos-cli）
typos:
    typos
