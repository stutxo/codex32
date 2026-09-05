"""Regenerate public volvelle fixtures and display tables from pinned BIP93 math."""
import json
import sys
from pathlib import Path
sys.dont_write_bytecode = True
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'scripts'))
from bip93_reference import load_reference

_, ref = load_reference()
alphabet = ref['CHARSET'].upper()
symbols = list('×ℵαβΓ∆εηΘΛµΞΠρΣΦΨΩ@#%¢¥€¤⊕†‡§¶♦♥')
assert len(symbols) == 32
mul = ref['bech32_mul']
inverse = ref['BECH32_INV']
def describe(value):
    return {'value': value, 'character': alphabet[value], 'symbol': symbols[value]}
def powers(base):
    result = [1]
    for _ in range(30):
        result.append(mul(result[-1], base))
    assert len(set(result)) == 31
    assert mul(result[-1], base) == 1
    return result
def coeff(p, r, target=16):
    if p == r:
        raise ValueError('duplicate share index')
    return mul(target ^ r, inverse[p ^ r])

fixture = json.loads((root / 'web/lib/practice-fixture.json').read_text())
shares = dict(zip(fixture['shareIndices'], fixture['shares']))
shares['s'] = fixture['publishedSecret']
def worked(left, right, target):
    p, r, t = map(lambda c: alphabet.index(c.upper()), (left, right, target))
    weights = [coeff(p, r, t), coeff(r, p, t)]
    assert weights[0] ^ weights[1] == 1
    inputs = [[alphabet.index(c) for c in shares[index][3:]] for index in (left, right)]
    expected = shares[target]
    actual_values = ref['ms32_interpolate'](inputs, t)
    assert 'MS1' + ''.join(alphabet[v] for v in actual_values) == expected
    steps = []
    for pos, (a, b, output) in enumerate(zip(*inputs, actual_values), 4):
        a_translated, b_translated = mul(weights[0], a), mul(weights[1], b)
        assert a_translated ^ b_translated == output
        steps.append({
            'positionOneBased': pos,
            'region': 'header' if pos <= 9 else 'payload' if pos <= 35 else 'checksum',
            'inputs': [alphabet[a], alphabet[b]],
            'translated': [alphabet[a_translated], alphabet[b_translated]],
            'result': alphabet[output],
        })
    return {
        'inputs': [left.upper(), right.upper()],
        'target': target.upper(),
        'weights': [describe(w) for w in weights],
        'inputStrings': [shares[left], shares[right]],
        'translatedRows': [''.join(alphabet[mul(w, c)] for c in inp) for w, inp in zip(weights, inputs)],
        'output': expected,
        'steps': steps,
    }

recovery_base = powers(10)
recovery_order = [x ^ 16 for x in recovery_base]
assert 'S' not in ''.join(alphabet[x] for x in recovery_order)
recovery_symbols = [None if i == 0 else mul(x, inverse[1 ^ x]) for i, x in enumerate(recovery_base)]
# If the handle is at p with ring position j, the other outer index r at k
# reads the inner coefficient at k-j. This verifies physical readout orientation.
for j, p in enumerate(recovery_order):
    for k, r in enumerate(recovery_order):
        if p != r:
            assert recovery_symbols[(k-j) % 31] == coeff(p, r)

workflows = [worked('a', 'c', 'd'), worked('a', 'c', 's'), worked('a', 'd', 's'), worked('c', 'd', 's')]
assert [w['value'] for w in workflows[0]['weights']] == [12, 13]
assert mul(19,23) == 1 # Mirrored faces use mutually inverse generators.
for p in range(32):
    for r in range(32):
        if p == r:
            continue
        for target in range(32):
            if target not in (p,r):
                assert ref['bech32_lagrange']([p,r],target) == [coeff(p,r,target),coeff(r,p,target)]

# Paper checksum table: reduce a*x^14+b*x^13 modulo the BIP93 degree-13 G.
generator = [25, 27, 17, 8, 0, 25, 25, 25, 31, 27, 24, 16, 16]
def poly_zero(values):
    residue = [0] * 13
    for value in values:
        high = residue[0]
        shifted = residue[1:] + [value]
        residue = [a ^ mul(high, b) for a, b in zip(shifted, generator)]
    return residue
def as_text(values):
    return ''.join('?' if value is None else alphabet[value] for value in values)
def as_values(text):
    return [alphabet.index(c.upper()) for c in text]
checksum_table = [[poly_zero([a, b] + [0] * 13) for b in range(32)] for a in range(32)]
assert as_text(checksum_table[29][29]) == 'STP2KRRLRGTP5' # Printed AA table entry.
assert as_text(checksum_table[24][29]) == 'CYANSPPRLRTC0' # Printed CA table entry.
initial_integer = ref['ms32_polymod']([0] * 13)
initial_row = [(initial_integer >> (5*i)) & 31 for i in reversed(range(13))]
assert as_text(initial_row) == '33XW87RR3YLJG'
target_row = as_values('SECRETSHARE32')
def worksheet(encoded, generate=False):
    values = as_values(encoded[3:])
    assert len(values) == 45
    if generate:
        values[-13:] = [None] * 13
    residue = [a ^ b for a, b in zip(initial_row, values[:13])]
    first_sum = residue.copy()
    steps = []
    for offset in range(13, 45, 2):
        head = residue[:2]
        assert None not in head
        lookup = checksum_table[head[0]][head[1]]
        following = values[offset:offset+2]
        shifted = residue[2:] + following
        output = [None if a is None else a ^ b for a, b in zip(shifted, lookup)]
        steps.append({
            'step': len(steps)+1,
            'inputPositionsOneBased': [offset+4, offset+5],
            'residueBefore': as_text(residue),
            'lookupKey': as_text(head),
            'lookupRow': as_text(lookup),
            'nextData': as_text(following),
            'shiftedRow': as_text(shifted),
            'residueAfter': as_text(output),
        })
        residue = output
    backwards = []
    if generate:
        after = target_row.copy()
        recovered_values = values.copy()
        for step_index in reversed(range(len(steps))):
            step = steps[step_index]
            lookup = as_values(step['lookupRow'])
            shifted = [a ^ b for a,b in zip(after, lookup)]
            head = as_values(step['lookupKey'])
            before = head + shifted[:11]
            offset = 13 + step_index * 2
            for at, value in enumerate(shifted[-2:], offset):
                assert recovered_values[at] in (None, value)
                recovered_values[at] = value
            backwards.append({
                'forwardStep': step['step'],
                'knownResult': as_text(after),
                'lookupRow': step['lookupRow'],
                'solvedShiftedRow': as_text(shifted),
                'solvedInputPositionsOneBased': step['inputPositionsOneBased'],
                'solvedData': as_text(shifted[-2:]),
                'previousResidue': as_text(before),
            })
            after = before
        assert after == first_sum
        assert as_text(recovered_values) == encoded[3:]
        reference_checksum = ref['ms32_create_checksum'](recovered_values[:-13])
        assert reference_checksum == recovered_values[-13:]
    else:
        assert residue == target_row
        assert ref['ms32_verify_checksum'](values)
    return {
        'input': encoded[:-13] if generate else encoded,
        'output': encoded,
        'initialRow': as_text(initial_row),
        'initialData': as_text(values[:13]),
        'initialSum': as_text(first_sum),
        'forwardSteps': steps,
        'finalForwardRow': as_text(residue),
        'backsolveSteps': backwards,
        'checksum': encoded[-13:],
    }
checksum_cases = [worksheet(shares[c], generate) for c in ('a','c','d','s') for generate in (False,True)]

data = {
    'publicResearchOnly': True,
    'sources': {
        'paper': 'https://secretcodex32.com/docs/2023-03-07--color.pdf',
        'paperRevision': '2303-1-8822ef51',
        'math': 'https://secretcodex32.com/docs/2023-08-23--math.pdf',
        'source': 'https://github.com/BlockstreamResearch/codex32/blob/1a1c22aa895d78f2d385303feb9491d155e14cf7/SSS32.ps',
        'bip93': fixture['provenance']['url'],
    },
    'field': {'polynomial': 'x^5 + x^3 + 1', 'reductionMask': 41, 'numericAlphabet': alphabet, 'zero': 'Q', 'one': 'P', 'secretIndex': 'S'},
    'alternateAlphabet': [describe(v) for v in range(32)],
    'addition': {
        'outerOrderClockwiseFromA': 'ACDEFGHJKLMNPQRSTUVWXYZ023456789',
        'positions': 32,
        'operation': 'decode(a) XOR decode(b)',
        'readout': 'Point the handle at a; read the window labelled b. There are 32 distinct windows and 1024 table entries, not two modular-addition scales.',
        'tableNumericAlphabetRowsAndColumns': [[a ^ b for b in range(32)] for a in range(32)],
    },
    'fusion': {
        'generator': describe(19),
        'clockwiseInnerAndOuterFromIdentity': [describe(v) for v in powers(19)],
        'readout': 'Align inner identity aleph/1 with outer multiplier sigma. An inner factor tau points to outer sigma*tau. Set that output at the handle for the next factor.',
        'positions': 31,
    },
    'translation': {
        'generator': describe(23),
        'clockwiseInnerAndOuterFromP': ''.join(alphabet[v] for v in powers(23)),
        'readout': 'Set factor sigma on Fusion face, flip to Translation face without moving the discs, then read each inner share character at its outer arrow. Q maps to Q separately. Digital equivalent: align inner P with outer character encoding sigma.',
        'positions': 31,
        'tableNumericAlphabetFactorRowsAndInputColumns': [[mul(a, b) for b in range(32)] for a in range(32)],
    },
    'recovery': {
        'generatorBeforeRelabelling': describe(10),
        'outerOrderClockwiseFrom3': ''.join(alphabet[v] for v in recovery_order),
        'innerReadoutsClockwiseFromHandle': [None if v is None else describe(v) for v in recovery_symbols],
        'positions': 31,
        'operation': '(other XOR S) / (other XOR shareBeingTranslated), over GF(32)',
        'readout': 'Point Share to translate handle at p on outer ring. Other outer index r points inward to its factor. Never swap the handle and lookup roles. Equal indices hit blank; S is absent.',
        'physicalOrientation': 'With outer p at slot j and outer r at slot k, read inner slot (k-j) mod31.',
        'table': [{'shareToTranslate': alphabet[p], 'otherShare': alphabet[r], 'factor': describe(coeff(p,r))} for p in recovery_order for r in recovery_order if p != r],
    },
    'allPairAndTargetWeights': {
        'indexing': 'cube[p][r][target] is weight of share p. Axes use numericAlphabet. Weight of r is 1 XOR this weight. Duplicate inputs p==r are null. p==target gives1, r==target gives0. These generalized weights include S inputs; the paper Recovery ring itself excludes S and fixes target S.',
        'cube': [[None if p == r else [coeff(p,r,t) for t in range(32)] for r in range(32)] for p in range(32)],
    },
    'checksumWorksheet': {
        'scope': 'The actual 48-character paper worksheet, 16-byte payload and 13-character short checksum. Do not silently apply to long Codex32 strings or odd data layouts.',
        'polynomial': 'x^13 + E*x^12 + M*x^11 + 3*x^10 + G*x^9 + Q*x^8 + E*x^7 + E*x^6 + E*x^5 + L*x^4 + M*x^3 + C*x^2 + S*x + S',
        'generatorCoefficientsHighToLow': generator,
        'initialBip93ResidueHex': '0x23181b3',
        'initialPrefilledRow': as_text(initial_row),
        'targetFinalRow': 'SECRETSHARE32',
        'initialOperation': 'XOR the first13 characters after MS1 with initialPrefilledRow. Their full-string positions are4 through16 inclusive.',
        'rowOperation': 'Take a,b=first two characters of the current13-character residue. Fetch table[a][b], the remainder of a*x^14+b*x^13 moduloG. XOR it with residue[2:] concatenated with the next2 data characters. Repeat16 times. Full-string positions17 through48 are consumed.',
        'verification': 'The final13-character row must equal SECRETSHARE32. This equals the BIP93 checksum residue test.',
        'generation': 'Use the32 known data characters afterMS1 and leave the last13 checksum cells unknown. Every table lookup key remains known. Run the forward rows, preserving unknown cells. Set the final row toSECRETSHARE32, then walk backward: shifted=result XOR tableRow; shifted[-2:] gives the consumed input pair, and previousResidue=lookupKey + shifted[:11]. This fills all13 checksum cells and reproduces BIP93 create_checksum.',
        'sourceTypos': 'The math companion prints33XW87RRYLJG in prose (12 chars); correct PDF worksheet and independently computed prefill is33XW87RR3YLJG (13). It also momentarily reverses degree labels in prose; table key a,b corresponds to a*x^14+b*x^13.',
        'tableNumericAlphabetFirstAndSecondCharacter': [[as_text(row) for row in rows] for rows in checksum_table],
        'cases': checksum_cases,
    },
    'workedExamples': workflows,
    'worksheetRule': 'Operate on all 45 data characters after MS1, including six header characters and 13 checksum characters; prepend MS1 unchanged. Intermediate translated rows are not complete valid Codex32 strings.',
    'minimalFlow': [
        'Load published A/C initial shares and verify both checksums.',
        'Select target D; show derivation-table factors Pi/V for A and rho/D for C.',
        'Set each Translation factor, inspect one payload column, then step through or fill the remaining 45 columns.',
        'Use Addition on translated columns to obtain published D. Verify its exact string/checksum.',
        'Set A aside; use Recovery wheel on C and D to obtain their separate factors for target S.',
        'Translate and add the 45 columns to recover published S; verify exact S and existing independently derived Signet addresses.',
    ],
}

(root / 'web/tests/fixtures/volvelles.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')
display = {
    'sources': data['sources'],
    'alphabet': alphabet,
    'symbols': symbols,
    'additionOrder': data['addition']['outerOrderClockwiseFromA'],
    'translationOrder': data['translation']['clockwiseInnerAndOuterFromP'],
    'fusionOrder': ''.join(item['character'] for item in data['fusion']['clockwiseInnerAndOuterFromIdentity']),
    'recoveryOrder': data['recovery']['outerOrderClockwiseFrom3'],
    'recoveryReadouts': [None if item is None else item['character'] for item in data['recovery']['innerReadoutsClockwiseFromHandle']],
    'checksumTable': data['checksumWorksheet']['tableNumericAlphabetFirstAndSecondCharacter'],
}
(root / 'web/lib/wheel-data.json').write_text(json.dumps(display, ensure_ascii=False, separators=(',', ':')) + '\n')
print('Regenerated independent volvelle fixtures and display tables.')
