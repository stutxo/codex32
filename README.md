# codex32

A Bitcoin wallet concept centered on thoughtful backup and recovery, inspired by the illustrated [Shamir Secret Sharing Codex](https://secretcodex32.com/docs/2023-03-07--color.pdf).

The idea: make creating, checking, keeping, and recovering physical key backups feel understandable and deliberate. Carry the book's visual character into an interface that helps people practice recovery before they need it.

**Status: concept and planning.** This repository does not yet contain a working wallet or cryptographic implementation. Development will begin with public practice data.

## Starting point

The proposed first product is an offline backup and recovery companion, with a web demo for learning. A complete wallet remains a later option, informed by usability and interoperability work.

- [Product concept and milestones](docs/concept.md)
- [Visual direction](docs/design.md)
- [Architecture and security questions](docs/architecture.md)

## References

- [Codex32 guide and interactive tools](https://secretcodex32.com/)
- [BIP 93 specification](https://github.com/bitcoin/bips/blob/master/bip-0093.mediawiki)
- [Upstream wallet developer guide](https://github.com/BlockstreamResearch/codex32/blob/master/docs/wallets.md)
- [Rust reference implementation](https://github.com/apoelstra/rust-codex32)

This is an independent project using `codex32` as its working name. No affiliation with the original authors is implied. Upstream artwork and code have not been vendored; preserve their applicable notices if reused.
