# codex32

A simple Bitcoin wallet with BIP 93 backups, inspired by the illustrated [Shamir Secret Sharing Codex](https://secretcodex32.com/docs/2023-03-07--color.pdf).

The idea: make creating, checking, keeping, and recovering physical key backups feel understandable and deliberate. Carry the book's visual character into an interface that helps people practice recovery before they need it.

**Status: experimental Rust foundation.** Backup operations, a BDK wallet core, and WASM recovery bindings are implemented and tested. There is no end-user interface or mobile app yet. The wallet core enables test networks only; this code has not been audited for real funds.

## Starting point

The product goal is a complete, simple wallet: create or restore, receive, send, and manage a Codex32 backup. This first milestone provides the shared implementation:

| Crate | Implemented |
| --- | --- |
| `codex32-core` | Encode and validate BIP 93, generate/split seeds, derive shares, recover seeds |
| `codex32-wallet` | BIP 84 account zero, restore from backups, receive/change addresses, public state persistence, payment proposals and signing |
| `codex32-wasm` | Validate/recover backups and restore test wallets through JavaScript bindings |

The backup crate covers 16–64 byte seeds, both checksum formats, and thresholds 2–9. It accepts exactly the threshold number of distinct shares for recovery. Checksum error correction is not implemented; invalid strings are rejected.

## Try the public practice wallet

Use the pinned Rust toolchain and a C compiler. On NixOS, enter `nix-shell` first.

```sh
cargo run --locked -p codex32-wallet --example recover
```

This restores the published BIP 93 NAME example and prints regtest addresses. All bundled seeds and shares are public test data.

## Verify the implementation

```sh
cargo test --locked --workspace
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
```

For WASM, install the runner matching `Cargo.lock`, then exercise Rust and actual JavaScript calls in Node:

```sh
cargo install wasm-bindgen-cli --version 0.2.127 --locked
bash scripts/test-wasm.sh
```

With Chromium and ChromeDriver available, run the same WASM tests in a browser. On NixOS, use `nix-shell --arg withBrowser true` first:

```sh
WASM_BINDGEN_USE_BROWSER=1 cargo test --locked -p codex32-wasm --target wasm32-unknown-unknown
```

With Bitcoin Core's `bitcoind` and `bitcoin-cli` on PATH, prove receiving and spending against an isolated local node:

```sh
python3 scripts/regtest.py
```

The script creates a temporary regtest node with P2P networking disabled, restores a public backup, funds it with test bitcoin, reloads state from disk, signs and confirms a payment, and verifies the balance after another reload. It terminates its own node and removes its temporary data when finished.

See [validation details](docs/validation.md) for coverage and [the API guide](docs/api.md) for library use.

## Application direction

A browser prototype can exercise public fixtures and test networks. Native mobile is the current recommendation for the first real-funds application; the launch platform has not been selected.

- [Product concept and milestones](docs/concept.md)
- [Visual direction](docs/design.md)
- [Architecture and security questions](docs/architecture.md)
- [Rust library and wallet plan](docs/rust-library.md)

## References

- [Codex32 guide and interactive tools](https://secretcodex32.com/)
- [BIP 93 specification](https://github.com/bitcoin/bips/blob/master/bip-0093.mediawiki)
- [Upstream wallet developer guide](https://github.com/BlockstreamResearch/codex32/blob/master/docs/wallets.md)
- [Rust reference implementation](https://github.com/apoelstra/rust-codex32)

This is an independent project using `codex32` as its working name. No affiliation with the original authors is implied. The pinned BIP text and its derived public fixtures are included with [BSD-3-Clause attribution](tests/fixtures/LICENSE-BIP93); no upstream artwork is included. Dependency licenses remain with their authors.
