# First milestone validation

This records tests of the experimental library foundation on 2026-09-04. It is not an independent security audit or a production approval.

## Conformance and generation

- 31 distinct official valid strings round-trip, including uppercase and lowercase input.
- All 64 official invalid strings are rejected.
- 25 official encoded-seed examples decode to the expected bytes and derive the specified BIP 32 master keys, including nonzero padding variants.
- 392 independent Python reference cases cover every seed length from 16 through 64 bytes and every threshold from 2 through 9. Recovery and new-share derivation match the reference exactly.
- 15 additional reference cases compare direct encoding, splitting, and fresh generation byte for byte at 16, 32, 46, 47, and 64 bytes, with thresholds 2, 3, and 9.
- Generated 31-share sets recover across every contiguous threshold-sized subset for all supported sizes and thresholds; the published three-of-five example recovers from every three-share combination.
- Negative checks cover random-source failures, invalid parameters, duplicate/mismatched shares, wrong share counts, malformed input, and redacted Debug/errors.
- A repeatable Python/Rust differential harness covers 27,072 parser cases, including every threshold character, all payload lengths from 0 through 110 symbols, both letter cases, and every share index at length boundaries. It compares acceptance, canonical export, metadata, and decoded seed bytes.
- 4,968 deterministic text mutations and arbitrary Unicode/ASCII inputs exercise parser failure and successful round-trip invariants. These are bounded property tests; sustained coverage-guided fuzzing remains separate work.
- RNG regressions exercise failure after partially writing a buffer and after earlier successful seed/share draws. Recovery and new-share derivation are checked with reordered inputs and a recovered S input against independent fixtures.

The pinned source and regeneration procedure are documented in [the fixture directory](../tests/fixtures/README.md). The older Rust reference was inspected but is not a dependency; the Python reference provides the independent comparison.

## Wallet and platform checks

Native tests compare BIP 86 receiving and change addresses after recovery across all supported seed lengths. Public-state reload preserves the next address index and rejects another seed, a different network, or an unsupported state version. Verified recovery rejects independently valid shares that have matching metadata but reconstruct a different wallet, and rejects a mismatched expected network identity.

Pending-spend and eviction tests check balances, coin selection, and persistence across reloads. Signing failure tests cover excessive/negative fees, malformed PSBT maps and UTXO data, and unsupported sighashes; the supplied PSBT must remain unchanged on failure. Payment-boundary tests reject amounts above the maximum supply and fee rates above the signer's extraction limit, including values that previously panicked in BDK arithmetic. Synthetic blocks in these unit tests exercise accounting; the separate Bitcoin Core test checks transaction acceptance.

The shared recovery fixtures have run in WASM under both Node and headless Chromium. The hardening changes are checked under Node. The JavaScript smoke script exercises actual generated bindings, argument conversion, metadata access, recovery, wallet addresses, state export, explicit object cleanup, and exception propagation. Both keychains reject fractional, negative, overflowing, nonfinite, and nonnumeric indices before conversion. Tests include the maximum valid index and ensure previews and rejected calls leave public state unchanged.

The isolated regtest journey restores a public BIP 93 backup, compares eight receiving/change addresses, receives 1 test BTC, persists and reloads state, signs a 0.25 BTC payment, and checks Bitcoin Core's mempool acceptance. It records and reloads the pending spend before broadcasting, verifies that the original funds cannot be selected again, then mines a confirmation and verifies the resulting balance after another disk reload.

Formatting and Clippy run on the workspace. CI covers debug and release native tests, independent parser comparison, fixture regeneration, WASM tests under Node, and the JavaScript ABI. It also rebuilds the browser module and runs the practice website's integration tests, type checks, and static export. Browser and Bitcoin Core regtest checks are documented local commands. The dependency-advisory workflow runs on changes and weekly.

## Public practice website

The illustrated `web/` companion uses the release Rust/WASM module for public example
recovery, local share checks, and Signet address previews. Twenty-eight frontend integration
tests pass against that exact browser module, covering all three share pairs in both
orders, published S equality, independently derived address expectations, failure on
an incorrect address, invalid selections, display grouping, checksum and case errors,
and the optional agent action contract. TypeScript, authored-code lint, and the static
export pass. The npm dependency audit reports no known vulnerabilities as of 2026-09-05.

The volvelle workshop adds fresh disposable educational sessions and the paper's
48-character checksum worksheet. Independent pinned Python fixtures check all 1,024
additions and multiplications, both physical multiplication-ring orientations,
29,760 pair/target weight combinations, all 45 cells in four published derivation
and recovery workflows, and eight checksum verification/generation traces. Fresh
sessions check all three recovery pairs and preserve the supplied payload's padding.
Additional tests cover malformed WASM arguments, uniform byte-to-character sampling,
randomness failures, dice rejection sampling and tied pairs, and wheel-position wrapping.
The guided-flow regressions cover creation from empty, partial, and complete dice
drafts, preservation of rolled characters, failure before session replacement, the
complete checksum A → checksum C → share D → recovery sequence, alternate checksum
order, and review/reset behavior. The creation action remains available while
rolling and securely fills any missing characters when explicitly selected.
CI regenerates both the reference fixtures and runtime display tables and checks for drift.
Eleven new native tests cover payload construction, all legal padding values, and
interpolation factors across every supported seed length and threshold. All 45
native tests pass in debug and release, together with Clippy and the Node WASM tests.

`scripts/build-web-wasm.sh` rebuilds the browser module and records Rust input hashes
and compiler versions. The exported WASM hash was checked against that tested module.
Browser interaction and visual checks, live WebMCP registration, and physical print
testing were not performed. These are distinct from the earlier library-level browser
tests. The website handles published examples and disposable test material and has no
chain or payment connection. It is not suitable for real backups or funds.

The 2026-09-04 dependency check used cargo-audit 0.22.1 with RustSec revision `5a0ebedfe8bdd2e295b171f4162f8c977bcad9a5` (2026-09-02): 90 locked dependencies, zero reported vulnerabilities or warnings. Repeat this check against current advisory data for each release.

## Reproduce the hardening checks

Use the pinned Rust toolchain; on NixOS enter `nix-shell`. Install the matching wasm-bindgen runner as described in the README.

```sh
cargo fmt --all --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo test --locked --workspace
cargo test --locked --workspace --release
python3 scripts/check-conformance.py
python3 scripts/generate-fixtures.py
git diff --exit-code -- tests/fixtures/bip93.json
bash scripts/test-wasm.sh
python3 scripts/regtest.py
cargo audit --deny warnings
```

The independent corpus integration test is intentionally ignored by plain `cargo test`; the Python command generates its temporary corpus and explicitly runs it. Regtest needs `bitcoind` and `bitcoin-cli`; the advisory check needs cargo-audit and network access. The library tests and pinned reference comparison use only vendored dependencies and local public fixtures.

## Remaining work

Error correction, native mobile bindings, protected key storage, production chain adapters, atomic persistence, a full wallet interface, broader device/browser testing, sustained fuzzing, and independent security review remain. The wallet disables mainnet; the backup core is a general BIP 93 implementation and should still be treated as unaudited. See the [mainnet readiness record](mainnet-readiness.md) for the remaining evidence and integration requirements.
