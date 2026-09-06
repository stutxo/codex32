import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../lib/wasm/codex32_wasm.js';
import reference from './fixtures/volvelles.json' with { type: 'json' };
import {
  add,
  alphabet,
  angleSlot,
  checksumWorksheet,
  freshSession,
  multiply,
  nextSlot,
  publishedSession,
  randomCharacters,
  recoveryOrder,
  recoveryReadout,
  rollDiceCharacter,
  symbol,
  translationLesson,
  wheelData,
  type Pair,
} from '../lib/workshop.ts';

engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});

await test('all 1,024 additions and 1,024 translations match independent BIP93 field tables', () => {
  for (let a = 0; a < 32; a++) {
    assert.equal(symbol(alphabet[a]), reference.alternateAlphabet[a].symbol);
    for (let b = 0; b < 32; b++) {
      assert.equal(
        add(engine, alphabet[a], alphabet[b]),
        alphabet[reference.addition.tableNumericAlphabetRowsAndColumns[a][b]],
      );
      assert.equal(
        multiply(engine, alphabet[a], alphabet[b]),
        alphabet[
          reference.translation.tableNumericAlphabetFactorRowsAndInputColumns[
            a
          ][b]
        ],
      );
    }
  }
});

await test('both 31-position multiplication faces physically align at every nonzero factor', () => {
  for (const order of [wheelData.translationOrder, wheelData.fusionOrder]) {
    assert.equal(order.length, 31);
    assert.equal(new Set(order).size, 31);
    assert.equal(order[0], 'P');
    for (let factor = 0; factor < 31; factor++) {
      for (let input = 0; input < 31; input++) {
        assert.equal(
          order[(factor + input) % 31],
          multiply(engine, order[factor], order[input]),
        );
      }
    }
  }
});

await test('all 29,760 distinct share/target combinations agree with reference weights and physical readouts', () => {
  const indices = alphabet.split('').filter((c) => c !== 'S');
  const shares = Object.fromEntries(
    indices.map((index) => {
      const backup = engine.createPracticeShare(index, 'Q'.repeat(26));
      try {
        return [index, backup.exportText()];
      } finally {
        backup.free();
      }
    }),
  );
  for (const target of alphabet) {
    const order = recoveryOrder(engine, target);
    assert.equal(order.length, 31);
    assert.ok(!order.includes(target));
    assert.equal(recoveryReadout(order, target, 'A'), null);
    for (const p of indices) {
      for (const r of indices) {
        if (p === r) {
          assert.equal(recoveryReadout(order, p, r), null);
          continue;
        }
        const numeric =
          reference.allPairAndTargetWeights.cube[alphabet.indexOf(p)][
            alphabet.indexOf(r)
          ]![alphabet.indexOf(target)];
        const weights = engine
          .interpolationWeights([shares[p], shares[r]], target)
          .toUpperCase();
        assert.equal(weights, alphabet[numeric] + alphabet[numeric ^ 1]);
        if (p !== target && r !== target)
          assert.equal(recoveryReadout(order, p, r), weights[0]);
      }
    }
  }
  assert.equal(
    recoveryOrder(engine, 'S'),
    reference.recovery.outerOrderClockwiseFrom3,
  );
});

await test('every cell in all four published derivation/recovery lessons matches independent worksheet traces', () => {
  const session = publishedSession(engine);
  for (const example of reference.workedExamples) {
    const pair = example.inputs as Pair;
    const target = example.target as 'D' | 'S';
    const lesson = translationLesson(engine, session, pair, target);
    assert.deepEqual(
      lesson.weights,
      example.weights.map((w) => w.character),
    );
    assert.deepEqual(lesson.rows, example.translatedRows);
    assert.deepEqual(lesson.input, example.inputStrings);
    assert.equal(lesson.output, example.output);
    assert.deepEqual(
      lesson.columns,
      example.steps.map((step) => ({
        position: step.positionOneBased,
        region: step.region === 'payload' ? 'share data' : step.region,
        inputs: step.inputs,
        translated: step.translated,
        result: step.result,
      })),
    );
    const reverse = translationLesson(
      engine,
      session,
      [pair[1], pair[0]],
      target,
    );
    assert.equal(reverse.output, example.output);
    assert.deepEqual(reverse.weights, [...lesson.weights].reverse());
  }
  assert.throws(() => translationLesson(engine, session, ['A', 'A'], 'S'));
  assert.throws(() => translationLesson(engine, session, ['A', 'D'], 'D'));
});

await test('checksum generation and verification reproduce all independent forward and backward rows', () => {
  for (const example of reference.checksumWorksheet.cases) {
    const generate = example.backsolveSteps.length > 0;
    const actual = checksumWorksheet(engine, example.output, generate);
    assert.equal(actual.output, example.output);
    assert.equal(actual.checksum, example.checksum);
    assert.equal(actual.initialRow, example.initialRow);
    assert.equal(actual.initialData, example.initialData);
    assert.equal(actual.initialSum, example.initialSum);
    assert.equal(actual.finalForward, example.finalForwardRow);
    assert.deepEqual(
      actual.forward,
      example.forwardSteps.map((step) => ({
        offset: step.inputPositionsOneBased[0] - 4,
        key: step.lookupKey,
        lookup: step.lookupRow,
        following: step.nextData,
        before: step.residueBefore,
        shifted: step.shiftedRow,
        after: step.residueAfter,
      })),
    );
    assert.deepEqual(
      actual.backward,
      example.backsolveSteps.map((step) => ({
        forwardStep: step.forwardStep,
        solved: step.knownResult,
        lookup: step.lookupRow,
        shifted: step.solvedShiftedRow,
        before: step.previousResidue,
        pair: step.solvedData,
        offset: step.solvedInputPositionsOneBased[0] - 4,
      })),
    );
  }
});

await test('fresh practice sessions preserve all input characters, check every pair, and produce valid worksheets', () => {
  const secrets = new Set<string>();
  for (const offset of [0, 1, 7, 31, 128, 255]) {
    const characters = randomCharacters(52, (bytes) =>
      bytes.forEach((_, i) => {
        bytes[i] = i + offset;
      }),
    );
    const session = freshSession(engine, characters);
    assert.equal(session.kind, 'fresh');
    assert.equal(session.shares.A.slice(9, 35), characters.slice(0, 26));
    assert.equal(session.shares.C.slice(9, 35), characters.slice(26));
    assert.match(session.shares.A, /^MS12TESTA/);
    assert.equal(session.addresses.length, 3);
    session.addresses.forEach((address) => assert.match(address, /^tb1p/));
    secrets.add(session.secret);
    for (const pair of [
      ['A', 'C'],
      ['A', 'D'],
      ['C', 'D'],
    ] as Pair[]) {
      assert.equal(
        translationLesson(engine, session, pair, 'S').output,
        session.secret,
      );
    }
    assert.equal(
      translationLesson(engine, session, ['A', 'C'], 'D').output,
      session.shares.D,
    );
    for (const encoded of [...Object.values(session.shares), session.secret]) {
      assert.equal(checksumWorksheet(engine, encoded).output, encoded);
      assert.equal(
        checksumWorksheet(engine, encoded, false).finalForward,
        'SECRETSHARE32',
      );
    }
  }
  assert.ok(secrets.size >= 4);
  for (const bad of [
    '',
    'Q'.repeat(51),
    'Q'.repeat(53),
    'q'.repeat(52),
    'B'.repeat(52),
  ]) {
    assert.throws(() => freshSession(engine, bad));
  }
});

await test('practice generation and symbol WASM boundaries reject malformed inputs', () => {
  for (const bad of ['', 'AA', 'S', 'B', '🔑', ' A'])
    assert.throws(() => engine.createPracticeShare(bad, 'Q'.repeat(26)));
  for (const bad of [
    '',
    'Q'.repeat(25),
    'Q'.repeat(27),
    'B'.repeat(26),
    'Q'.repeat(25) + 'p',
  ])
    assert.throws(() => engine.createPracticeShare('A', bad));
  for (const bad of ['', 'AA', 'B', '🔑', ' P']) {
    assert.throws(() => engine.addSymbols(bad, 'P'));
    assert.throws(() => engine.multiplySymbols('P', bad));
    assert.throws(() => engine.interpolationWeights([], bad));
  }
  const session = publishedSession(engine);
  assert.throws(() => engine.interpolationWeights([session.shares.A], 'S'));
  assert.throws(() =>
    engine.interpolationWeights([session.shares.A, session.shares.A], 'S'),
  );
  assert.throws(() =>
    engine.deriveBackup([session.shares.A, session.shares.C], 'S'),
  );
});

await test('random sampling is uniform over byte values, clears scratch memory, and propagates RNG failure', () => {
  const counts = Array<number>(32).fill(0);
  let observed: Uint8Array | undefined;
  for (let byte = 0; byte < 256; byte++) {
    const character = randomCharacters(1, (bytes) => {
      observed = bytes;
      bytes[0] = byte;
    });
    counts[alphabet.indexOf(character)]++;
    assert.equal(observed![0], 0);
  }
  assert.deepEqual(counts, Array<number>(32).fill(8));
  assert.throws(
    () =>
      randomCharacters(26, (bytes) => {
        observed = bytes;
        bytes.fill(99);
        throw new Error('unavailable');
      }),
    /unavailable/,
  );
  assert.ok(observed!.every((byte) => byte === 0));
  assert.throws(
    () =>
      rollDiceCharacter(() => {
        throw new Error('unavailable');
      }),
    /unavailable/,
  );
  for (const count of [-1, 53, NaN, 0.5, Infinity])
    assert.throws(() => randomCharacters(count));
});

await test('dice reject out-of-range bytes, reroll ties, and map the five comparisons in order', () => {
  const sequence = [255, 252, 0, 0, 0, 5, 5, 0, 1, 4, 4, 1, 2, 3];
  const observed: Uint8Array[] = [];
  const roll = rollDiceCharacter((bytes) => {
    assert.ok(sequence.length);
    bytes[0] = sequence.shift()!;
    observed.push(bytes);
  });
  assert.equal(sequence.length, 0);
  assert.deepEqual(roll, {
    dice: [
      { first: 1, second: 6, bit: 1, ties: 1 },
      { first: 6, second: 1, bit: 0, ties: 0 },
      { first: 2, second: 5, bit: 1, ties: 0 },
      { first: 5, second: 2, bit: 0, ties: 0 },
      { first: 3, second: 4, bit: 1, ties: 0 },
    ],
    bits: '10101',
    character: '4',
  });
  assert.ok(observed.every((bytes) => bytes[0] === 0));
  assert.throws(
    () => rollDiceCharacter((bytes) => bytes.fill(255)),
    /unbiased/,
  );
  assert.throws(() => rollDiceCharacter((bytes) => bytes.fill(0)), /distinct/);
});

await test('dragging and stepping wrap correctly at every wheel position', () => {
  for (const count of [31, 32]) {
    for (let slot = 0; slot < count; slot++) {
      const angle = (slot / count) * Math.PI * 2 - Math.PI / 2;
      assert.equal(
        angleSlot(Math.cos(angle) * 145, Math.sin(angle) * 145, count),
        slot,
      );
      assert.equal(nextSlot(nextSlot(slot, 1, count), -1, count), slot);
    }
    assert.equal(nextSlot(0, -1, count), count - 1);
    assert.equal(nextSlot(count - 1, 1, count), 0);
  }
});
