#!/usr/bin/env bash
set -euo pipefail

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$ROOT"

if [[ "${CODEX32_BENCH_NIX:-0}" != 1 ]] \
    && { ! command -v python3 >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; }; then
    exec env CODEX32_BENCH_NIX=1 nix-shell --run 'bash autoresearch.sh'
fi

export CARGO_NET_OFFLINE=true
export LC_ALL=C
export TZ=UTC
export SOURCE_DATE_EPOCH=0
export PYTHONHASHSEED=0

exec python3 scripts/autoresearch-benchmark.py
