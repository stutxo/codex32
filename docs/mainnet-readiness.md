# Mainnet readiness

Status: experimental library, undergoing hardening. No audited mainnet release exists. The wallet's mainnet restriction remains enabled.

`codex32-core` is independent of Bitcoin networks: a correctly recovered seed is the same on mainnet and on a test network. The library's production requirements concern interoperability, secret handling, randomness, and distribution. Choosing a network happens in the wallet integration.

## Implementation and regression coverage

- BIP 93 parsing, both checksum formats, arbitrary valid padding, seed sizes 16–64 bytes, and thresholds 2–9 are covered by the pinned specification's examples and independent Python comparisons.
- The boundary comparison is a repeatable repository command, `python3 scripts/check-conformance.py`, and runs in CI. It generates public cases in temporary storage; no user backup is read.
- Native debug and release tests run in CI. Actual JavaScript bindings test invalid numeric indices and coercion attempts before derivation.
- The wallet uses BIP 86 single-key Taproot, account zero. Test networks use `m/86'/1'/0'`; mainnet would use `m/86'/0'/0'`. Recovery records must include network and script/derivation policy because BIP 93 stores only seed material and share metadata.
- Verified recovery compares an independently supplied wallet identity. Pending/evicted transactions update persisted wallet accounting. Failed signing leaves the caller's PSBT unchanged, including its signatures.
- Dependency advisory checks run on changes and weekly. They inspect the lockfile against current RustSec data and fail on warnings. This detects published advisories; it does not inspect dependencies for undisclosed defects.

See [validation](validation.md) for commands and observed results. CI configuration is not evidence that a hosted run has passed; validate the actual release commit.

## Library release requirements still open

| Requirement | Evidence needed |
| --- | --- |
| Independent implementation/security review | Review the exact release, including field arithmetic, parsing bounds, randomness failure paths, secret lifetime, and dependency behavior; resolve findings. |
| Sustained coverage-guided fuzzing | Exercise parsing and share operations with saved corpora and reproducible crash cases. Deterministic property tests and boundary matrices supplement this work. |
| Supported runtime and side-channel contract | Select deployment targets, review the generated code and memory model, and test those targets. The library does not promise end-to-end constant-time execution or removal of every secret copy. |
| Distribution and maintenance | Choose the project's license and publication policy, verify vendored sources and release artifacts, document artifact verification, and establish security reporting and update procedures. |
| Independent recovery exercise | Recover public test backups in a second implementation and the intended signer integration, comparing full wallet identity and addresses. The older Rust reference is not a sufficient sole oracle because its length/checksum boundaries are defective. |

## Wallet integration requirements still open

The library does not provide a protected signer or an end-user wallet. Before enabling mainnet in an application, implement and review these integration boundaries:

- Use an assessed cryptographic random source and protected key storage or a reviewed hardware signer. A `TryCryptoRng` implementation supplied by a caller is a contract, not an entropy assessment.
- Keep an authenticated public wallet identity independently of the supplied shares, and compare it during recovery. A valid checksum and a matching four-character identifier do not authenticate a wallet.
- Persist wallet changes atomically before exposing reserved addresses or broadcasting transactions. Handle storage failures, concurrent writers, rollback, pending/conflicting transactions, evictions, and chain reorganizations in the chosen backend.
- Review destination, amount, change, and actual fee for the exact transaction to be signed. Maintain reliable chain synchronization and an explicit rescan/gap policy.
- Implement and review the creation ceremony's encrypted endpoint channel and durable replay store if using the company-assisted hardware design in [the research report](../research/report.md).
- Complete recovery and signer-loss drills on the supported devices. The browser bindings are experimental and are not a protected key vault.

Enabling a network flag is a separate change from satisfying these release requirements. Do not fund public fixtures or example wallets.
