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

The pinned source and regeneration procedure are documented in [the fixture directory](../tests/fixtures/README.md). The older Rust reference was inspected but is not a dependency; the Python reference provides the independent comparison.

## Wallet and platform checks

Native tests compare receiving and change addresses after recovery across all supported seed lengths. Public-state reload preserves the next address index and rejects another seed, a different network, or an unsupported state version. Invalid payment inputs fail before signing.

The shared recovery fixtures run in WASM under both Node and headless Chromium. The JavaScript smoke script exercises actual generated bindings, argument conversion, metadata access, recovery, wallet addresses, state export, explicit object cleanup, and exception propagation.

The isolated regtest journey restores a public BIP 93 backup, compares eight receiving/change addresses, receives 1 test BTC, persists and reloads state, signs a 0.25 BTC payment, and checks Bitcoin Core's mempool acceptance. It broadcasts on regtest, mines a confirmation, and verifies the resulting balance after another disk reload. The first successful run paid 281 satoshis in fees.

Formatting and Clippy run on the workspace. CI covers native tests, fixture regeneration, WASM tests under Node, and the JavaScript ABI. Browser and Bitcoin Core regtest checks are documented local commands.

## Remaining work

Error correction, native mobile bindings, protected key storage, production chain adapters, atomic persistence, an end-user interface, broader device/browser testing, fuzzing, and independent security review remain. The wallet disables mainnet; the backup core is a general BIP 93 implementation and should still be treated as unaudited.
