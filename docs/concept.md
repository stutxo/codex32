# Product concept

Research and proposal updated: 2026-09-04. Product goal: a simple, complete Bitcoin wallet with BIP 93 backup and recovery.

## Could this be useful?

Yes, potentially, for people who care about durable Bitcoin backups and are willing to practice recovery. Our hypothesis is that a coherent experience spanning screen, paper, and rehearsal can make this process easier to understand and complete correctly. Demand has not been validated.

Codex32 supports threshold backups: for example, any two shares in a properly generated two-of-three set recover the seed. It supports checking and reconstruction with paper tools. This is a seed backup mechanism; it does not itself create a multisignature spending policy. [BIP 93](https://github.com/bitcoin/bips/blob/master/bip-0093.mediawiki)

The strongest early audiences are careful self-custody users, educators running backup workshops, and people preparing recovery instructions for a trusted person. The wallet should support ordinary receiving and sending while making backup unusually understandable. Reuse established wallet components so development can concentrate on this experience.

## What could distinguish it?

The scheme already exists. The [official website](https://secretcodex32.com/) provides a guide and interactive worksheets; a [Rust reference implementation](https://github.com/apoelstra/rust-codex32) also exists. We should not claim to invent the scheme or be its first software interface. We have not completed an exhaustive competitor survey or verified a wallet compatibility matrix.

Our proposed distinction is the complete recovery experience:

- Guided practice with an example backup before anyone handles a real secret.
- Physical share cards with readable characters, clear labels, and useful instructions.
- A simple explanation of what happens when a share is lost or stolen.
- Recovery rehearsal that verifies the expected wallet identity.
- A printable recovery guide that remains useful if this project disappears.

The visual theme should support these tasks. Measure successful recovery, not just whether people like the artwork.

## Product shape

| Option | Value | Principal tradeoff | Proposed role |
| --- | --- | --- | --- |
| Shared Rust libraries | Identical backup and wallet rules across interfaces | Needs well-defined boundaries and platform testing | Recommended foundation |
| Web wallet prototype | Quick interaction and recovery experiments | Production secret handling needs a separate security decision | Public fixtures and test networks first |
| Native mobile wallet | Integrated receiving, sending, and backup | Requires native storage, device testing, and release engineering | Recommended first real-funds application |
| Offline recovery utility | Reuses the backup library independently | Requires trustworthy distribution and a documented recovery path | Useful secondary tool |

These are proposed choices, not implemented capabilities.

## First prototype

The initial library milestone is a tested seed-to-shares-to-seed round trip. The first wallet demonstration then creates a test wallet, prepares practice cards, verifies recovery, receives test bitcoin, and sends it. Use a fresh wallet instance for the recovery check and compare its receiving and change addresses with the original.

The interface should begin with “Create wallet” and “Restore wallet,” then show balance, receive, send, and backup. Recommend one backup preset, initially two-of-three, while allowing the underlying library to support the standard's wider range. The exact default seed length and backup presentation remain design decisions. Clearly mark public fixtures and test-network wallets.

Shares are needed for recovery, not each payment. A normal installed wallet retains signing capability, so its device protection matters independently of how its backup is split. The interface must make this understandable without adding ceremony to every payment.

Support familiar language: “Two shares are required to recover,” “This share has a copying error,” and “Practice recovery complete.” Explain the meaning of successful checks precisely.

## Milestones

1. **Reusable backup library:** evaluate existing Rust components, pin the chosen versions, implement the required BIP 93 API, and verify official vectors and native/WASM behavior.
2. **Small working wallet:** integrate BDK and prove creation, recovery, address discovery, receiving, and spending on a local regtest network.
3. **One simple interface:** choose the first application target, add its bindings and storage, and build the illustrated backup experience. Exercise it on a public test network.
4. **Release preparation:** validate recovery with users, test native secret storage and release verification, and independently review the exact implementation before enabling real funds.

Before a real-funds release, resolve the risks in [architecture.md](architecture.md). A visually complete prototype is not that release.

## Questions to validate

Can users explain the difference between recovery shares and spending signers? Can another person recover from the printed instructions without coaching? Do users correctly handle a missing or mistyped share? How does completion time and error rate compare with their current backup method? Does the illustration help orientation or distract from the characters?
