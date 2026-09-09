"""Extract original published glyph outlines; normalize each disc to handle-up.

Uses Poppler 26.06.0 exports of the pinned published PDF. No font substitution,
tracing or redrawing is used. Generated assets include a trailing line feed.
"""
from copy import deepcopy
import hashlib
import argparse
import subprocess
import tempfile
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pdf', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--pdftocairo', default='pdftocairo')
args = parser.parse_args()
ROOT = args.output.resolve()
ROOT.mkdir(parents=True, exist_ok=True)
scratch = tempfile.TemporaryDirectory(prefix='codex32-printed-ink-')
source_dir = Path(scratch.name)
NS = 'http://www.w3.org/2000/svg'
XLINK = 'http://www.w3.org/1999/xlink'
ET.register_namespace('', NS)
N = '{' + NS + '}'
X = '{' + XLINK + '}'
PDF_SHA = '9156c7ccf7dbf7fa5eb183af45296bfa132c348bd4583f737c1741482b92c236'
assert hashlib.sha256(args.pdf.read_bytes()).hexdigest() == PDF_SHA

def page_angle(radius):
    return 45 - math.degrees(math.asin(180 / (2 * math.sqrt(2) * radius)))

def center(radius, angle, upper=False):
    a = math.radians(angle)
    dx, dy = -math.sin(a) * radius, math.cos(a) * radius
    return (306 - dx, 396 - dy) if upper else (306 + dx, 396 + dy)

recovery_angle = page_angle(200)
fold_radius = 200 * math.cos(math.pi / 31)
bottom_angle = page_angle(fold_radius)
top_angle = page_angle(227)

jobs = [
    ('recovery-top-annotations.svg', 'recovery-page.svg', 33,
     list(range(241, 244)) + list(range(252, 260)),
     center(202, recovery_angle, True), -90, 480,
     'White Recovery center title; original share to translate label and arrow.'),
    ('recovery-outer-titles.svg', 'recovery-page.svg', 33,
     list(range(146, 210)), center(172, recovery_angle), recovery_angle, 480,
     'Eight repeated Recovery labels on fixed outer disc.'),
    ('fusion-top-annotations.svg', 'translation-fusion-page.svg', 37,
     list(range(450, 456)), center(227, top_angle), top_angle, 480,
     'White Fusion center title, as published (not older Multiplication title).'),
    ('translation-top-annotations.svg', 'translation-fusion-page.svg', 37,
     list(range(499, 510)), center(227, top_angle, True), top_angle + 180, 480,
     'Black Translation center title, as published (not older Recovery typo).'),
    ('translation-zero-reminder.svg', 'translation-fusion-page.svg', 37,
     [510], center(227, top_angle, True), top_angle + 180, 480,
     'Original Q double-arrow Q handle glyphs; replace existing reminder, not additive.'),
    ('fusion-outer-titles.svg', 'ring-bottoms-page.svg', 35,
     list(range(279, 327)), center(fold_radius, bottom_angle), bottom_angle, 480,
     'Eight repeated Fusion labels on fixed outer disc.'),
    ('translation-outer-titles.svg', 'ring-bottoms-page.svg', 35,
     list(range(358, 446)), center(fold_radius, bottom_angle, True), bottom_angle + 180, 480,
     'Eight repeated Translation labels on fixed outer disc.'),
    ('addition-outer-titles.svg', 'addition-bottom-page.svg', 31,
     list(range(9, 81)), (306, 396), 0, 600,
     'Original repeated Addition labels at radius 262; includes original coincident 0/360 repeat.'),
    ('recovery-top-glyphs.svg', 'recovery-page.svg', 33,
     list(range(260, 291)), center(202, recovery_angle, True), -90, 480,
     '31 original inner recovery positions, including blank handle position; no pointers.'),
    ('recovery-bottom-glyphs.svg', 'recovery-page.svg', 33,
     list(range(210, 241)), center(172, recovery_angle), recovery_angle, 480,
     '31 original fixed outer recovery characters, 3 at top; no pointers.'),
    ('fusion-top-glyphs.svg', 'translation-fusion-page.svg', 37,
     list(range(456, 487)), center(227, top_angle), top_angle, 480,
     '31 original inner Fusion symbols, aleph at top; no pointers.'),
    ('translation-top-glyphs.svg', 'translation-fusion-page.svg', 37,
     list(range(511, 542)), center(227, top_angle, True), top_angle + 180, 480,
     '31 original inner Translation characters, P at top; no pointers.'),
    ('fusion-bottom-glyphs.svg', 'ring-bottoms-page.svg', 35,
     list(range(327, 358)), center(fold_radius, bottom_angle), bottom_angle, 480,
     '31 original fixed outer Fusion symbols, aleph at top; no pointers.'),
    ('translation-bottom-glyphs.svg', 'ring-bottoms-page.svg', 35,
     list(range(446, 477)), center(fold_radius, bottom_angle, True), bottom_angle + 180, 480,
     '31 original fixed outer Translation characters, P at top; no pointers.'),
    ('addition-top-glyphs.svg', 'addition-top-page.svg', 29,
     list(range(2, 34)), (306, 396), 0, 600,
     '32 original addition window labels plus original filled double-arrow heads and stems; excludes label boxes, window outlines, cut geometry, artwork and central cross.'),
    ('addition-bottom-glyphs.svg', 'addition-bottom-page.svg', 31,
     list(range(81, 1137)), (306, 396), 0, 600,
     '1,024 permanently printed addition results and 32 outer characters; excludes repeated titles, central title and geometry.'),
]

manifest = {
    'source': 'https://secretcodex32.com/docs/2023-03-07--color.pdf',
    'revision': '2303-1-8822ef51',
    'pdf_sha256': PDF_SHA,
    'method': 'Poppler pdftocairo SVG glyph outlines, selected by published page group indices and transformed into original centered disc coordinates.',
    'placement': 'Ring overlays: image x=-240 y=-240 width=480 height=480. Addition overlay: x=-300 y=-300 width=600 height=600. All top overlays belong inside the rotating top-disc group; all outer-title overlays belong inside fixed bottom-disc group.',
    'geometry_source': 'Published revision source /angleinbox and original /drawTopDisc /drawBottomDisc: centers derived from 612x792 page, radius200, recovery innerRadius170, bottomfoldline=200*cos(pi/31), topfoldline227.',
    'serialization': 'Original extracted paths serialized as UTF-8 with one trailing line feed.',
    'assets': [],
}

version = subprocess.run([args.pdftocairo, '-v'], capture_output=True, text=True, check=True)
if '26.06.0' not in version.stdout + version.stderr:
    raise RuntimeError('Use Poppler 26.06.0 to reproduce the recorded glyph group indices.')
for source, page in sorted({(job[1], job[2]) for job in jobs}):
    subprocess.run([args.pdftocairo, '-svg', '-f', str(page), '-l', str(page),
                    str(args.pdf.resolve()), str(source_dir / source)], check=True)

for filename, source, page, selected, (cx, cy), angle, size, description in jobs:
    doc = ET.parse(source_dir / source).getroot()
    definitions = {g.attrib['id']: g for g in doc.iter(N + 'g') if 'id' in g.attrib}
    # Page35 wraps every glyph in a page-layout clip; other pages' selected
    # large-disc glyphs are root children. Only glyph geometry is retained.
    candidates = doc.iter(N + 'g') if page == 35 else iter(doc)
    groups = [g for g in candidates if g.find(N + 'use') is not None]
    out = ET.Element(N + 'svg', {
        'viewBox': f'{-size // 2} {-size // 2} {size} {size}',
        'width': str(size), 'height': str(size),
    })
    ET.SubElement(out, N + 'title').text = description
    normalized = ET.SubElement(out, N + 'g', {
        'transform': f'rotate({-angle:.12f}) translate({-cx:.12f} {-cy:.12f})',
    })
    glyph_count = 0
    for index in selected:
        original = groups[index]
        wrapper = ET.SubElement(normalized, N + 'g', dict(original.attrib))
        for use in original:
            assert use.tag == N + 'use'
            glyph = definitions[use.attrib[X + 'href'][1:]]
            placed = ET.SubElement(wrapper, N + 'g', {
                'transform': f'translate({use.attrib["x"]} {use.attrib["y"]})',
            })
            for path in glyph:
                assert path.tag == N + 'path'
                placed.append(deepcopy(path))
            glyph_count += 1
    arrow_paths = []
    if filename == 'addition-top-glyphs.svg':
        for window in range(32):
            for index in [5351 + 5*window, 5352 + 5*window]:
                path = doc[index]
                assert path.tag == N+'path'
                normalized.append(deepcopy(path))
                arrow_paths.append(index)
        assert len(arrow_paths) == 64
    content = ET.tostring(out, encoding='utf-8', xml_declaration=True) + b'\n'
    (ROOT / filename).write_bytes(content)
    record = {
        'file': filename, 'source_pdf_page_one_based': page,
        'source_poppler_svg': source,
        'source_group_selection': 'recursive use-containing g elements' if page == 35 else 'root child use-containing g elements',
        'source_glyph_group_indices_zero_based': selected,
        'source_disc_center_top_left_pdf_points': [cx, cy],
        'source_disc_clockwise_rotation_degrees': angle,
        'viewBox': out.attrib['viewBox'],
        'glyph_count': glyph_count, 'bytes': len(content),
        'sha256': hashlib.sha256(content).hexdigest(),
        'description': description,
    }
    if arrow_paths:
        record['source_root_child_arrow_path_indices_zero_based'] = arrow_paths
        record['arrow_path_count'] = len(arrow_paths)
        record['includes_label_boxes_or_window_outlines'] = False
    manifest['assets'].append(record)
    print(filename, glyph_count, len(content))

(ROOT / 'printed-ink-provenance.json').write_text(json.dumps(manifest, indent=2) + '\n')


scratch.cleanup()
