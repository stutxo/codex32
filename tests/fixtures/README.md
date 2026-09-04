# Public conformance fixtures

All seeds, shares, randomness tapes, and master keys here are public test data.

`bip-0093.mediawiki` is copied from bitcoin/bips revision
`24e96e870fffaa257b465ce1f0370c14aac588e8`.

Source: https://github.com/bitcoin/bips/blob/24e96e870fffaa257b465ce1f0370c14aac588e8/bip-0093.mediawiki

SHA-256: `45b1758805014b121145765c4e551486347433c7872e1b3277c26815728be5a5`.

The source and derived fixtures carry the BIP's BSD-3-Clause license; see `LICENSE-BIP93`.

Regenerate `bip93.json` with `python3 scripts/generate-fixtures.py`. The script checks the source hash before extracting and executing its inline Python reference. It does not execute downloaded or unpinned code.

The JSON includes the official valid/invalid strings and seed/master-key examples. Additional deterministic cases use the independent Python reference across all seed lengths and thresholds, with nonzero padding, plus byte-for-byte generation cases at the short/long boundary and other representative sizes.
