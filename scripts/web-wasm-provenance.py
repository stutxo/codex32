"""Record the local Rust inputs and compiler used for the committed browser module."""
import hashlib
import json
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parents[1]
files = [root / "Cargo.lock", root / "Cargo.toml", root / "rust-toolchain.toml"]
for crate in ("codex32-core", "codex32-wallet", "codex32-wasm"):
    files.extend((root / "crates" / crate / "src").glob("**/*.rs"))
    files.append(root / "crates" / crate / "Cargo.toml")
digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
record = {
    "rustc": subprocess.check_output(["rustc", "--version"], text=True).strip(),
    "wasmBindgen": subprocess.check_output(["wasm-bindgen", "--version"], text=True).strip(),
    "profile": "release",
    "target": "wasm32-unknown-unknown",
    "sourceSha256": {str(path.relative_to(root)): digest(path) for path in sorted(files)},
    "wasmSha256": digest(root / "web/lib/wasm/codex32_wasm_bg.wasm"),
}
(root / "web/lib/wasm/provenance.json").write_text(json.dumps(record, indent=2) + "\n")
