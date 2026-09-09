# Book-fidelity audit

Reference: [published color book, revision 2303-1-8822ef51](https://secretcodex32.com/docs/2023-03-07--color.pdf).
Audit: 2026-09-09. PDF page numbers below include the cover.

This is the book's **128-bit, k=2 translation-worksheet method**, practiced with
initial shares A/C and derived share D. It is not a transcription of every page
or support for every threshold/module in the book.

| Paper operation | Website implementation | Reference |
| --- | --- | --- |
| Generate two initial shares | Five dice-pair comparisons per character, original decision tree, 26 characters per share | §III.1.A, PDF 15 and 18 |
| Generate each checksum | Given endpoint; starting addition; table lookup, shift and addition downward; solve upward only until all pink cells are filled | PDF 20 |
| Verify a separate copy | Copy all 48 characters, work downward, require SECRETSHARE32 | PDF 21 |
| Derive D | k=2 derivation-table column D: A gets Π/V, C gets ρ/D | §III.1.B, PDF 16 |
| Translate each complete share | Set the factor on the fusion face, flip, read all 45 characters after MS1 at the same setting | §II.2, PDF 13; translation worksheet, PDF 25 |
| Finish D or S | Use the addition wheel on the two completed translated rows | PDF 25 |
| Recover S | Verify the selected shares; point the printed recovery wheel at each share and read the other share's symbol; set/flip/translate, then add | §III.2, PDF 16–17 |

The printed recovery wheel is only for S. The renderer rejects other targets;
the generic mathematical target mapping remains an independent test utility.
The alternate Share Booklet is deliberately not used: see the documented
[row error](https://github.com/BlockstreamResearch/codex32/issues/77).

## Screen helpers, not extra paper operations

- Browser randomness simulates dice; practice names/shares are fixed to TEST and A/C/D.
- Single-entry and current-step auto-fill use the same answer validation as manual work.
- Both guided and detailed views pause at each new operation. Setting a factor
  does not flip the instrument or record a character. Auto-fill cannot cross Next.
- Highlights, enlarged readings, pointer/keyboard/touch controls, answer checking,
  and browser-local saved progress assist the paper calculation.
- Complete 13-character working rows include confirmations of already-known
  columns; `?` represents a pink square left blank on paper.
- Wallet import and Signet address previews are clearly labeled digital extras.
  No real funds or private backups belong in this practice site.

The artwork and printed-disc details are documented separately in
[ARTWORK.md](ARTWORK.md), with byte hashes in the public provenance manifest.

## Regression checks

The test suite checks arithmetic against the shipped Rust/WASM engine, fixed
printed-wheel geometry, stage boundaries, all three recovery pairs, and saved-work
migrations. The real detailed-view button handlers are tested at factor setup,
flip, and a legacy save that previously let one click fill a later translated row.
Generation now ends at `up-6-copy` (70 entries); the full mathematical backsolve
remains independently tested. Older longer worksheets retain their required
checked prefix and partial drafts.

This audit used the original PDF/source, static artwork inspection, rendered
component tests and interaction-handler tests. It did not include fresh browser
UI or physical-device testing.
