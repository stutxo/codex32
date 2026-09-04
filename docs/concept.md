# Product concept

Research and initial proposal: 2026-09-04.

## Could this be useful?

Yes, potentially, for people who care about durable Bitcoin backups and are willing to practice recovery. Our hypothesis is that a coherent experience spanning screen, paper, and rehearsal can make this process easier to understand and complete correctly. Demand has not been validated.

Codex32 supports threshold backups: for example, any two shares in a properly generated two-of-three set recover the seed. It supports checking and reconstruction with paper tools. This is a seed backup mechanism; it does not itself create a multisignature spending policy. [BIP 93](https://github.com/bitcoin/bips/blob/master/bip-0093.mediawiki)

The strongest early audiences are careful self-custody users, educators running backup workshops, and people preparing recovery instructions for a trusted person. Everyday payments are a weaker starting point because they add substantial wallet engineering without testing the core idea.

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
| Web learning tool | Easy to try and share | Live delivery is a poor trust boundary for secrets | First prototype, public examples only |
| Offline companion | Focused backup, checking, and recovery | Requires trustworthy distribution and compatible wallet import | Main product hypothesis |
| Complete wallet | Integrated receiving and spending | Adds signing, chain access, fee handling, and device integrations | Later decision |

These are proposed choices, not implemented capabilities.

## First prototype

The initial journey is: learn the threshold idea, choose a sample backup, prepare practice cards, verify them, simulate losing one, and recover the example wallet. Clearly mark practice material and never generate fundable backup material for the demo.

Support familiar language: “Two shares are required to recover,” “This share has a copying error,” and “Practice recovery complete.” Explain the meaning of successful checks precisely.

## Milestones

1. **Practice experience:** build the visual prototype with fixed public examples, print layouts, and mobile and keyboard support.
2. **Validated core:** choose a maintained implementation, pin its version, check official vectors, and compare recovery with an independent implementation.
3. **Offline pilot:** define release verification, demonstrate recovery without network access, and document one proven wallet integration.
4. **Product decision:** observe users completing backup and recovery; decide whether a companion solves the need or a full wallet adds enough value.

Before a real-funds release, resolve the risks in [architecture.md](architecture.md). A visually complete prototype is not that release.

## Questions to validate

Can users explain the difference between recovery shares and spending signers? Can another person recover from the printed instructions without coaching? Do users correctly handle a missing or mistyped share? How does completion time and error rate compare with their current backup method? Does the illustration help orientation or distract from the characters?
