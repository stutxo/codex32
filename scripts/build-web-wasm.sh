#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build --locked --release -p codex32-wasm --target wasm32-unknown-unknown
wasm-bindgen --target web --out-dir web/lib/wasm target/wasm32-unknown-unknown/release/codex32_wasm.wasm
python3 scripts/web-wasm-provenance.py
