# Visual direction

Reference: [Shamir Secret Sharing Codex, revision 2303](https://secretcodex32.com/docs/2023-03-07--color.pdf), especially the illustrated cover and the introduction on PDF page 8.

## Character

The reference combines an illuminated manuscript cover with practical technical pages: parchment, indigo, red ornament, botanical borders, circular emblems, expressive ink outlines, serif typography, and illustrated initials. Inside, red headings organize white pages with black diagrams and text.

Our proposed interpretation is a useful personal field guide for Bitcoin recovery. Let a few memorable illustrations give it character while the active task stays readable and calm.

## Proposed palette

These are starting values for the interface, not exact colors sampled from the PDF. Verify contrast before implementation.

| Role | Color | Use |
| --- | --- | --- |
| Paper | `#F5EEDB` | Main reading surface |
| Parchment | `#D4C69E` | Covers and secondary panels |
| Ink | `#221E1B` | Body text and strong outlines |
| Indigo | `#493D87` | Primary navigation and illustration fields |
| Vermilion | `#A52E39` | Headings and limited ornament |
| Leaf | `#47654B` | Supporting accents |
| Gold | `#D8AA42` | Small decorative details |

Use a readable serif for titles and explanatory prose, clear control labels, and a monospaced face with distinct glyphs for shares. Never render secret characters in a decorative font. Bundle font assets in any offline artifact.

## Interface ideas

- **The cover:** a restrained illustrated entrance with a short explanation and a prominent practice action.
- **The workbench:** one step at a time, spacious character entry, and a diagram showing recovery progress.
- **The share card:** plain, legible data with consistent labels and one decorative border outside the data area.
- **The recovery guide:** numbered instructions that print cleanly and make sense without the app.
- **The paper wheel:** an optional interactive explanation of the reference's circular tools, with an accessible text equivalent.

Keep illustrative animation away from entry and checking. Label actions directly, such as “Check share” and “Practice recovery.” Avoid fantasy terminology for operations that affect access to funds.

## Legibility and physical output

Make labels, error messages, and progress understandable without color. Preserve character positions on small screens, support keyboard navigation and screen readers, and offer reduced motion. Uppercase four-character display groups are recommended by the [upstream wallet guide](https://github.com/BlockstreamResearch/codex32/blob/master/docs/wallets.md); presentation spacing must not alter the encoded data.

Design separate print layouts for A4 and US Letter. Keep each practice card on one page, avoid textured backgrounds behind characters, and provide a monochrome version. Mark every demonstration card as public practice data. Default early print experiments to blank templates or fixed public examples.

## Artwork provenance

The PDF credits cover and wheel illustrations to Micaela Paez, and illuminated letters and inline illustrations to M. Lutfi’ As’ad. It contains an MIT notice attributed to Blockstream. Link to the reference while prototyping original interface elements; preserve applicable license and attribution notices if incorporating upstream assets. Do not imply endorsement by the original project.
