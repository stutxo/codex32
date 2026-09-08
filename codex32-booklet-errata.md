# Erratum: codex32 print edition (rev 2303-1) — Module 1 "Share Booklet" produces wrong shares

**Severity: Critical (fund-loss risk in a specific workflow).**
**Affected: both `2023-03-07--color.pdf` and `2023-03-07--bw.pdf` on secretcodex32.com (revision 2303-1-8822ef51).**
**Not affected: the principal tables, checksum tables, §III.1.B derivation tables, Module 2 tables, or the recovery procedure — all verified correct.**

## Summary

The Module 1 Share Booklet — the "much faster way" advertised for the common **k = 2** case — has every table row shifted by one position starting at row **T**. Any share derived with the booklet is wrong. The booklet is unusable as printed.

Found by independently regenerating every table in the book from the codex32 mathematics (GF(32) Lagrange interpolation + the BCH checksum) and diffing against the printed content, cross-checked against BIP 93 and its test vectors.

## What is affected

- **Module 1: Share Booklet** (31 pages, "Page: A" through "Page: 9"). Used to derive extra shares from the two initial shares **A** and **C** when **k = 2**: select the page by the A-share character, the row by the C-share character, and read the derived share's characters across the columns.

**Verified correct (not affected):**

| Component | Result |
|---|---|
| Addition table | 32/32 rows |
| Translation table | 32/32 rows |
| Recovery table | 31/31 rows |
| Fusion table | 31/31 rows |
| Checksum table | 1024/1024 entries |
| Derivation tables k = 2, k = 3 (§III.1.B) | correct |
| Module 2 derivation tables k = 4–8 | correct |
| Module 2 "S-first" tables k = 2–8 | correct |
| Bech32↔binary reference tables | 32/32 both directions |
| Recovery procedure (§III.2) end-to-end | reproduces the canonical BIP 93 secret share exactly |

## The bug

The booklet's rows are **labeled** with the 31 valid share-index characters — `A C D E F G H J K L M N P Q R T U V W X Y Z 0 2 3 4 5 6 7 8 9` (deliberately skipping **S**). But the **data** rows were generated for all 32 bech32 values, *including* `S`.

The `S` data row (which belongs between labels `R` and `T`) was never removed when its label was. The result: **every row from T onward holds the data for the previous character**, and the last character's data row is dropped entirely.

Proof by example (booklet "Page: A"):

| Row label | Printed row | Actually contains data for | Status |
|---|---|---|---|
| T | `S7RQN825JVE4X60WDZHCF3UKGMLPYT` | the excluded value **S** (16) | wrong (shifted) |
| U | `T4LHRCWVU76N8JKFPQY9X5ZMED2GS3` | **T** (11) | wrong (shifted) |
| V | `US5E3L7HDYKTRMF4CG62NQPX08V9JZ` | **U** (28) | wrong (shifted) |

This holds on **all 31 pages**: every page's data rows match the "includes-S" sequence; zero match the correct label sequence. Rows `A`–`R` (positions before the missing `S`) are unaffected. Confirmed both in the PDF text layer and in the rendered page images.

## Impact

Over 2000 random k = 2 share pairs (A, C), deriving one more share with the booklet:

| Outcome | Rate |
|---|---|
| **Blocked**: a data char is `S` → no page/row exists, lookup impossible | 91.4% |
| **Corrupted** share that **fails** its checksum → caught by "Verify Shares" | 8.6% |
| **Corrupted** share that **survives** checksum (truly silent) | 0.0% |
| Correct share | 0.0% |

Notes:

- The block rate is ~91%, not the naive ~76%, because the lookup runs over the whole 45-character share body — the 13 checksum characters are data too, and *both* shares feed the lookup.
- The row shift corrupts data and checksum positions inconsistently, so the wrongly-derived share never passes the codex32 checksum — the failure is almost always **loud**, not silent. But *when* it surfaces depends on the workflow:
  - The booklet contains a way to catch it: the checksum worksheets, and the built-in identity column (column C must equal the row label). But **the booklet procedure never tells the user to verify the derived shares**, and neither does §III.1.B. (The "Critical Step" verification exists only in §III.1.A, for the initial shares.)
  - A user who follows the booklet exactly as written discovers the corruption only at **recovery**, whose step 1 verifies each share's checksum — potentially years later, after shares are distributed and the generation worksheets destroyed. At that point recovery fails outright or requires the online error-correction tool.

The danger is real in two scenarios:

1. **Dormant corruption discovered at recovery.** The user derives shares with the booklet, distributes them, and destroys intermediates as instructed. The bad share is caught only when someone tries to recover — with reduced redundancy and no initial shares to fall back on.
2. **Corrupted-header share.** Even the constant threshold character is corrupted (in the `NAME` test case, booklet position 0 yields `6` where `2` belongs), so wallets reject booklet-derived shares with confusing errors.

## Reproduce

Using the BIP 93 `NAME` k = 2 test vectors:

- Share A: `MS12NAMEA320ZYXWVUTSRQPNMLKJHGFEDCAXRPP870HKKQRM`
- Share C: `MS12NAMECACDEFGHJKLMNPQRSTUVWXYZ023FTR2GDZMPY6PN`
- True share D: `MS12NAMEDLL4F8JLH4E5VDVULDLFXU2JHDNLSM97XVENRXEG`

Derive share D with the printed booklet. It yields `6NAMEDLL4F8JLH4E?VDVU?X6XU0S45ACLMM47XTENEJEG` — 16 of 26 data characters wrong and 2 positions un-lookable (they require row `S`, which the booklet omits — the page for S exists but is likewise misaligned and unusable for A+C derivation).

Quick visual check: on any booklet page, column `C` of every row should equal that row's label. On page A, row T starts with `S` instead of `T` — and this fails on every row from T onward.

## Root cause

Specific to the **2303-1 print edition**. In `SSS32.ps` (the source of the served PDFs, also posted as `2023-03-07--bw.ps`), function `showShareTable` draws the row **labels** from `permNoS` (31 values, S excluded) but computes the row **data** by indexing `perm` (32 values, with S=16 at index 15). The two arrays diverge from index 15 onward, so every row from T onward computes data for the previous character, and the last row's data is dropped. The same shift affects the `Page: S` table, which is printed but is unusable for the A+C scheme and equally misaligned.

One-line fix (line 2748):

```diff
-      page exch perm 3 index get exch makeShare code exch get glyphshow
+      page exch permNoS 3 index get exch makeShare code exch get glyphshow
```

Rendering the patched source with Ghostscript produces a booklet in which every row satisfies the identity invariant (column C = row label), and all 31 rows of Page A match an independent BIP 93 Lagrange computation exactly.

The booklet generator in the *public* git branches (`BlockstreamResearch/codex32`, `apoelstra/SSS32`) is a different, older draft (`alpha-4.6`, S+A scheme, pre-BIP 93) that does not share this code path — the 2303-1 source appears to exist only on the website, not under public version control.

## Why it went unnoticed

- The book prints on the order of 50,000 machine-generated table glyphs; reviewers trust generation and spot-check.
- The four principal tables have visible self-consistency invariants (addition row A is the identity, fusion is symmetric, the checksum table is self-keyed) that make errors obvious. The booklet has no such invariant — a shifted row is indistinguishable from a correct one without independently computing the Lagrange coefficients.
- The booklet does embed a tripwire (column `C` must equal the row label), but nobody hand-verifies a 31×31 grid.
- The documented *primary* derivation method (§III.1.B translation worksheet and volvelles) is correct, so end-to-end tests and the reference implementation all pass. Only booklet users hit the failure.

## Recommendations for users of this print edition

1. **Do not use Module 1 (the Share Booklet).** Derive extra shares with **§III.1.B** (translation worksheet + derivation tables).
2. **Checksum-verify every share you create**, including derived shares — not just the first.
3. Perform a full test recovery before moving funds.

## Suggested fix (for maintainers)

Apply the one-line `perm` → `permNoS` change above; and add an explicit step to checksum-verify each derived share to the derivation instructions (III.1.B and the booklet intro). Optionally also drop the misaligned `Page: S` table (it serves no purpose in the A+C scheme), or re-add the S row label+data consistently if the booklet is meant to double as a general interpolation table.
