#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo test --locked -p codex32-wasm --target wasm32-unknown-unknown
cargo build --locked -p codex32-wasm --target wasm32-unknown-unknown
wasm-bindgen --target nodejs --out-dir target/wasm-node target/wasm32-unknown-unknown/debug/codex32_wasm.wasm
node scripts/wasm-smoke.cjs
