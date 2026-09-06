# Original Codex32 artwork

The site reproduces original illustrations, without repainting or color filters.
Functional disc geometry follows the original PostScript generators. Fixed ink,
cut-out windows and handles are separate SVG paper layers; all printed marks rotate
with their own sheet. BIP93/WASM independently checks every reading. Selection
highlights, the enlarged window and keyboard controls are screen aids.

Sources:

- [new-complete branch](https://github.com/apoelstra/codex32/tree/new-complete), pinned at `8ae1268e40bcc37bb84be21b7a33ff2c34b1ac32`.
- [Published color book](https://secretcodex32.com/docs/2023-03-07--color.pdf), revision `2303-1-8822ef51`. The exact PDF and asset hashes are in [provenance.json](public/art/provenance.json).

| Site asset | Original source | Use |
| --- | --- | --- |
| `dragon.png` | `dragon1.php.inc` + `dragon2.php.inc`, clipping box x51 y131 w355 h355 PostScript points | Addition wheel |
| `wheel-lock.png` | `wheel-lock.php.inc`, 312 × 312 points | Recovery wheel |
| `sun.png` | `sun.php.inc`, 178 × 178 points | Translation wheel, site mark |
| `potion.png` | `potion.php.inc`, 177 × 177 points | Fusion wheel |
| `dice-tree.svg` | Published PDF page 18, tree paths and 32 glyph groups, rotated upright | Manual dice worksheet |
| `book-cover.png` | PDF page 1, complete page | Book link and recovery workbench |
| `cover-wizard.png` | PDF page 1, x139 y338 w226 h341 | Dice lesson |
| `cover-top-border.png` | PDF page 1, x145 y52 w329 h43 | Vine border |
| `illuminated-t.png` | PDF page 8, x36 y235 w63.800781 h63.800781 | Home heading |
| `illuminated-c.png` | PDF page 8, x36 y104 w63.800781 h63.800781 | Derivation/checksum headings |
| `illuminated-b.png` | PDF page 11, x36 y132 w63.800781 h63.800781 | Recovery heading |
| `illuminated-f.png` | PDF page 12, x36 y170 w64 h63.800781 | Fresh-share heading |

PDF pages are one-based, counting the cover. PDF crop coordinates are in points
from the top left. Wheel art was wrapped in an appropriately sized PostScript page
and rasterized with Ghostscript at 216 dpi (`pngalpha`, 4-bit text/graphics antialiasing).
The cover was rendered with `pdftoppm -f 1 -l 1 -scale-to 1584 -png -singlefile`.
Cover details use 216 dpi; initials use 288 dpi. Only the original paths inside the
specified initial boxes were retained. PNGs are smaller than the equivalent SVG
exports and retain sufficient resolution for the displayed artwork.

The original green-gray circles behind the wheel illustrations and purple background
in the wizard detail are part of the artwork. The area outside the wheel circles is
transparent. The vine strip repeats at its original aspect ratio. No generated
illustration is used on the site.

Cover and volvelle illustrations: **Micaela Paez**. Illuminated letters and inline
illustrations: **M. Lutfi’ As’ad**. Edited and produced by **Arri Isak Beck**.
Copyright © 2020–2022 Blockstream. Both original MIT notices accompany the artwork
in [LICENSE.txt](public/art/LICENSE.txt).

The addition geometry reproduces `/showTopWheelPage` and `/drawBottomWheelPage` in
`SSS32.ps` (top: printed p.21/PDF p.29; bottom: printed p.22/PDF p.31). Recovery,
Fusion and Translation reproduce the two-disc generators, including their handle
windows. The data orders remain those validated against current BIP93.

`dice-tree.svg` contains original vector paths and glyphs from PDF page 18 (printed
p.11), rendered with Poppler `pdftocairo -svg -f 18 -l 18`. The tree paths and leaf
glyphs (root children 31–64) and their glyph definitions are retained, transformed
by `matrix(0 1 -1 0 792 0)` into viewBox `320 84 430 327`. An independent red path
marks the learner's choices without changing the drawing. Its hash is recorded in
the provenance manifest.
