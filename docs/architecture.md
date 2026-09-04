# Architecture and security questions

Proposed direction; no implementation has been selected or audited. The goal is a complete wallet backed by shared Rust libraries; see [the library plan](rust-library.md) for component boundaries and the first build milestone.

## Separate backup logic from platform secret handling

The hosted learning demo should operate only on fixed public examples; wallet experiments should initially use test networks. A production application's delivery and secret storage need their own design. Native mobile is the recommended first production target, with encrypted local signing material and operating-system protection for its storage key.

The reusable BIP 93 library should operate without network access or storage. It can also support a versioned, verifiable offline recovery artifact with bundled dependencies and assets. Disabling networking does not make an already compromised device or downloaded program trustworthy. A mobile wallet that signs ordinary payments is still a hot wallet even when its recovery operations work offline.

The [original guide](https://secretcodex32.com/docs/2023-03-07--color.pdf) explicitly cautions against entering secrets into websites. Browser technology could still provide a local interface, but offline use requires an intentional distribution and verification design.

Keep parsing, checksum validation, share operations, and seed decoding separate from wallet transaction logic and the interface. Evaluate the [Rust reference implementation](https://github.com/apoelstra/rust-codex32) and the current [bech32 primitives](https://docs.rs/bech32/latest/bech32/) for actual coverage, dependencies, licensing, and review history. “Reference implementation” is not an audit claim; its README describes incomplete and rough areas. WASM and native bindings should expose the same tested Rust operations.

Keep signing material inside the Rust wallet object where practical, with explicit import and backup export operations. Displaying or entering backup material necessarily crosses a UI boundary. Rust and WASM cannot make a compromised host interface trustworthy or guarantee that all copies of displayed secrets are erased.

## Recovery compatibility

Codex32 encodes a BIP32 master seed, not BIP39 mnemonic entropy. Importing an existing mnemonic must preserve the seed derived from its words and passphrase, which may require the long Codex32 format. Re-encoding mnemonic entropy directly would change the resulting wallet. [BIP 93](https://github.com/bitcoin/bips/blob/master/bip-0093.mediawiki)

Proposed acceptance check: restore a public fixture independently and compare several receiving and change addresses. A checksum alone is insufficient evidence that the intended wallet was recovered.

A recovery package should also document the network, wallet policy, derivation paths, and required software. Evaluate an accompanying descriptor export. Treat public keys and descriptors as privacy-sensitive even though they cannot spend funds by themselves. Multisignature recovery needs the full wallet policy and relevant cosigner data.

## Failure cases to design for

| Risk | Proposed treatment |
| --- | --- |
| Compromised web delivery or dependencies | Keep production secrets out of the hosted demo; verify offline releases and dependencies |
| Weak randomness or faulty sharing | Use vetted generation logic and operating-system randomness; verify against independent implementations |
| Duplicate, mismatched, or damaged shares | Validate inputs before recovery; provide actionable errors |
| Wrong wallet after restoration | Verify against expected wallet data and preserve recovery metadata |
| Logs, browser storage, screenshots, clipboard, or print spool leaks | Minimize secret exposure; exclude secrets from telemetry and persistence; make export deliberate |
| Too few surviving shares | Explain the threshold clearly and rehearse loss scenarios |
| Enough stolen shares to recover | Explain that distribution across independent locations matters |
| Deliberately altered backup | Do not present a checksum as authentication; check the recovered wallet identity |

Memory cleanup in a browser is best effort; do not promise guaranteed erasure. Printing secrets also involves the printer and spooler. Favor blank templates for handwritten backups and explicitly labeled practice sheets in the prototype.

The upstream [wallet developer guide](https://github.com/BlockstreamResearch/codex32/blob/master/docs/wallets.md) describes input validation and correction workflows. Any proposed correction must be visible and accepted by the user. Do not advertise error correction until the chosen implementation meets its stated guarantees.

## Evidence needed before real use

- Official valid and invalid vectors, plus round-trip and independent compatibility checks for every supported format.
- Tests covering threshold failures, duplicate shares, mismatches, boundary lengths, and malformed input.
- An observed offline recovery using a documented wallet integration and public test data.
- Dependency and security review of the exact release, plus a reproducible build and release verification procedure.
- A usable recovery document and a clear statement of which devices and formats were actually tested.

No real seeds, shares, private keys, wallet files, or recovery screenshots belong in this repository, its issues, or build artifacts. Use clearly identified public fixtures during development.
