# Codex32 practice companion

A static, illustrated volvelle workshop using the repository's Rust/WASM library.
The workbench uses built-in public examples and Signet address previews. The share
checker accepts text for local validation; do not enter real backups. There is no
account, storage, chain connection, balance, signing, or broadcast flow.

The home page `/` starts with an empty new-key worksheet; the published example
is loaded only when requested. The recovery workbench, share checker, and printable
cards share the main page in a workbench tab. Previous `/workshop` and `/workbench`
URLs redirect to the corresponding view on the main page.
The workshop offers draggable Recovery, Translation, Addition, and Fusion wheels,
keyboard controls, character-by-character derivation/recovery, and the paper's
48-character checksum worksheet. Its dice exercise creates disposable fresh test
keys from browser cryptographic randomness: two independent 26-character initial
shares determine a 128-bit seed, and every pair of the resulting A/C/D shares must
recover the same encoded S before the session is accepted. Sessions stay in memory.
The persistent “Create my test backup” action preserves any rolled characters and
securely fills the rest. Completing each worksheet advances through checksum A,
checksum C, share D, and recovery; earlier stages remain available for review.
The Recovery ring's default target is S; the D lesson explicitly relabels it. The
Addition wheel uses a digital window layout for the paper's XOR lookup table.

## Development

From this directory: `npm ci`, `npm run dev`, `npm test`, `npm run typecheck`,
and `npm run build`. The production static export is `dist/client/`. The committed browser
WASM makes this frontend independently buildable. It loads from the site's own
assets and is used only in the browser. System fonts avoid external font requests.

After Rust changes, run `bash scripts/build-web-wasm.sh` from the parent repository
with its Rust toolchain and matching wasm-bindgen CLI installed. This records input
hashes in `lib/wasm/provenance.json`. Include your wasm-bindgen installation in PATH
when using the repository's Nix shell.

## Verification and scope

`npm test` instantiates the same browser WASM shipped to users and tests every pair
in both orders, fixed independently derived address expectations, invalid choices,
checksum and case failures, formatting, secret-index handling, and the optional
agent action contract. It also tests rejection of an incorrect derived address.
`npm run typecheck` checks the frontend integration. Primary actions share one
button component with explicit native appearance and readable enabled/disabled
colors. Regressions check its rendered contrast without a stylesheet and enforce
its use throughout the workshop and workbench.

The 30 automated tests also check all 1,024 additions and multiplications,
physical alignment on both multiplication faces, 29,760 pair/target weight cases,
all cells in four published recovery/derivation lessons, eight independent checksum
traces, fresh sessions, malformed WASM arguments, unbiased sampling, rejected dice
ties/out-of-range bytes, randomness failure, and wheel position wrapping.
They also cover creating backups from partial dice drafts, failure before replacing
a session, automatic stage progression, alternate checksum order, the new-key default,
and progress retained across workbench visits and review/reset actions.

Regenerate the public wheel fixtures and display tables from the pinned BIP93 Python
reference with `python3 scripts/generate-volvelle-fixtures.py` in the repository root.
`lib/wheel-data.json` contains only display order and the paper checksum lookup table;
Rust/WASM performs each field operation and verifies the resulting complete strings.

`lib/practice-fixture.json` comes from BIP93 test vector 2. A, C, D, S and the seed
are published vectors. The three expected Signet addresses were derived separately
using native Bitcoin BIP32/BIP86 APIs from the published raw seed, checking its
published master xprv first. They are local expectations, not published BIP93
address vectors. Their path is `m/86'/1'/0'/0/{0,1,2}`. Every pair must match both
the encoded S and all three addresses.

The checker strips only ASCII spaces, tabs, CR and LF for grouping. It preserves
case and punctuation, never corrects errors, and never reflects input in errors.
Rust objects are explicitly freed. Browser JavaScript memory is not reliably
erasable; this site is not suitable for real secrets.

There is no application telemetry, input persistence, external font loading, or
request carrying entered strings. The workbench's print action uses fixed public cards,
independent of checker input or current tab. Each card gets its own monochrome page
with A4/Letter-friendly margins.

An optional `document.modelContext` tool exposes only public practice recovery.
Its pure contract has automated tests. No supported browser WebMCP context was
available to verify registration and live page state. A Chromium smoke test of
the root-domain export verified the new-key default, enabled create-button
contrast, actual WASM loading, public-example recovery and its three addresses,
and both legacy redirects without browser or internal request errors. Visual
review across browsers and physical print testing were not performed.

## GitHub Pages

The repository's main workflow publishes `dist/client` to GitHub Pages after the
Rust, WASM, and website checks pass. Pull requests run verification without publishing.
The Pages configuration supplies `NEXT_PUBLIC_BASE_PATH`: an empty value for
`https://codex32.com/`, or `/codex32` when hosting at the default
`https://stutxo.github.io/codex32/` address without a custom domain.

To reproduce the custom-domain build locally:

```sh
NEXT_PUBLIC_BASE_PATH='' npm run build
NEXT_PUBLIC_BASE_PATH='' npm run check:export
```

To reproduce the project-path build locally:

```sh
NEXT_PUBLIC_BASE_PATH=/codex32 npm run build
NEXT_PUBLIC_BASE_PATH=/codex32 npm run check:export
```

The export check requires all three routes, checks local asset/link targets, and
compares the exported WASM with the tested module. A normal `npm run build` keeps
root hosting available for the existing Sites preview.

The build includes a version-guarded workaround for Vinext beta.6's prerender
requests omitting the base path and trailing-slash normalization. It also removes
the redundant base-path directory from exported framework assets. Review these
scripts when upgrading Vinext; the workaround fails if its expected source changes.

The custom-domain configuration uses `codex32.com` in the repository's Pages
settings, GitHub Pages A/AAAA records for the apex, and a `www` CNAME pointing to
`stutxo.github.io` (without a repository path). Preserve unrelated DNS records,
including email forwarding. Configure the Pages domain before changing DNS, and
rerun the workflow after changing the domain so it builds for the new root path.
GitHub manages the HTTPS certificate and redirects `www` to the apex; enable
HTTPS enforcement once the certificate is ready.

This repository publishes through GitHub Actions. Its custom domain is managed in
Pages settings; a source `CNAME` file is ignored by this publishing method.
See GitHub's [custom-domain documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).

## Credits

Original artwork is reproduced directly from the [Codex32 book](https://secretcodex32.com/docs/2023-03-07--color.pdf)
and the [new-complete source branch](https://github.com/apoelstra/codex32/tree/new-complete):
the four wheel illustrations, book cover and wizard detail, red vine border, and
illuminated initials. The wheel centers rotate with the interactive discs; calculated
readouts remain outside the artwork. The paper scales are digital adaptations.

Cover/volvelle artwork: Micaela Paez. Illuminated letters/inline artwork: M. Lutfi’ As’ad.
Edited and produced by Arri Isak Beck. The book and branch MIT notices are preserved
in `public/art/LICENSE.txt`; [ARTWORK.md](ARTWORK.md) records exact provenance and exports.
Public vectors retain their BSD-3-Clause notice in `public/LICENSE-BIP93.txt`.
This remains an independent companion, with no implied endorsement.
