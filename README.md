# codex32

A simple Bitcoin wallet with BIP 93 backups, inspired by the illustrated [Shamir Secret Sharing Codex](https://secretcodex32.com/docs/2023-03-07--color.pdf).

The idea: make creating, checking, keeping, and recovering physical key backups feel understandable and deliberate. Carry the book's visual character into an interface that helps people practice recovery before they need it.

**Status: concept and planning.** This repository does not yet contain a working wallet or cryptographic implementation. Development will begin with public practice data.

## Starting point

The product goal is a complete, simple wallet: create or restore, receive, send, and manage a Codex32 backup. The recommended implementation starts with a reusable Rust BIP 93 library, adds a shared wallet core using Bitcoin Dev Kit, and exposes that core through thin web or mobile bindings.

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

This is an independent project using `codex32` as its working name. No affiliation with the original authors is implied. Upstream artwork and code have not been vendored; preserve their applicable notices if reused.
