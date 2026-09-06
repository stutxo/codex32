import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import {
  alphabet,
  autoDiceCharacter,
  emptyDiceEntry,
  freshSession,
  publishedSession,
  rollDiceCharacter,
  sessionFromInitial,
} from '../lib/workshop.ts';
import {
  checksumExercise,
  shareExercise,
  emptyLesson,
  emptyWorkbooks,
  prepareLesson,
  restoreWorkbooks,
  type Exercise,
} from '../lib/workbook.ts';
import {
  selectOperand,
  autoNextEntry,
  autoChecksum,
  visibleShare,
} from '../lib/workbook-guide.ts';
import legacy from './fixtures/play-workbook.json' with { type: 'json' };

engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});
const session = publishedSession(engine);
const checksum = checksumExercise(engine, session.shares.A);
function at(exercise: Exercise, cursor: number) {
  return {
    ...emptyLesson(),
    cursor,
    answers: exercise.steps.slice(0, cursor).map((step) => step.answer),
  };
}

await test('guided operands reject every wrong character and premature reads without entering answers', () => {
  const start = { ...at(checksum, 1), draft: '·X' };
  for (const letter of alphabet) {
    if (letter !== '2')
      assert.equal(selectOperand(checksum, start, 'primary', letter), start);
    assert.equal(selectOperand(checksum, start, 'other', letter), start);
  }
  const turned = selectOperand(checksum, start, 'primary', '2');
  for (const letter of alphabet)
    if (letter !== '3')
      assert.equal(selectOperand(checksum, turned, 'other', letter), turned);
  const read = selectOperand(checksum, turned, 'other', '3');
  assert.deepEqual(read, { ...start, primary: '2', other: '3' });
  const next = { ...read, column: 1 };
  assert.equal(selectOperand(checksum, next, 'primary', '2'), next);
  for (const cursor of [2, checksum.steps.length]) {
    const progress = at(checksum, cursor);
    assert.equal(selectOperand(checksum, progress, 'primary', 'Q'), progress);
  }
  const unknownIndex = checksum.steps.findIndex(
    (step) => step.kind === 'addition' && step.answer.includes('?'),
  );
  const unknown = {
    ...at(checksum, unknownIndex),
    column: checksum.steps[unknownIndex].answer.indexOf('?'),
  };
  assert.equal(selectOperand(checksum, unknown, 'other', 'Q'), unknown);
});

await test('guided examples clamp to the displayed entry and preserve every manual progress field', () => {
  const progress = {
    ...at(checksum, 8),
    draft: 'MYDRAFT',
    exampleCursor: 0,
    parked: { sample: { draft: 'Q' } },
  };
  const turned = selectOperand(checksum, progress, 'primary', '2', true);
  const result = selectOperand(checksum, turned, 'other', '3', true);
  assert.deepEqual(result, {
    ...progress,
    exampleWheel: { ...progress.exampleWheel, primary: '2', other: '3' },
  });
});

await test('translation requires its reading face, supports input Q and clamps saved columns', () => {
  const recovery = shareExercise(engine, session, ['A', 'C'], 'S');
  const cursor = recovery.steps.findIndex(
    (step) => step.kind === 'translation' && step.right === 'Q',
  );
  assert.ok(cursor > 0);
  const step = recovery.steps[cursor];
  const start = { ...at(recovery, cursor), column: 12 };
  const turned = selectOperand(recovery, start, 'primary', step.left!);
  assert.equal(selectOperand(recovery, turned, 'other', 'Q'), turned);
  const read = selectOperand(
    recovery,
    { ...turned, factorSide: false },
    'other',
    'Q',
  );
  assert.equal(read.other, 'Q');
  assert.equal(read.answers.length, cursor);
  const identity: Exercise = {
    title: 'Identity factor',
    output: '',
    steps: [
      {
        id: 'identity',
        title: '',
        instruction: '',
        kind: 'translation',
        left: 'P',
        right: 'Q',
        answer: 'Q',
      },
    ],
  };
  assert.equal(
    selectOperand(
      identity,
      { ...emptyLesson(), factorSide: false },
      'other',
      'Q',
    ).other,
    'Q',
  );
  for (const kind of ['addition', 'recovery'] as const) {
    const zero: Exercise = {
      ...identity,
      steps: [{ ...identity.steps[0], kind, left: 'Q', right: 'C' }],
    };
    assert.equal(selectOperand(zero, emptyLesson(), 'other', 'C').other, 'C');
  }
});

await test('auto-next fills exactly one cell, keeps other entries and validates before advancing', () => {
  const start = { ...at(checksum, 1), draft: '·X··Y' };
  const result = autoNextEntry(checksum, start);
  assert.equal(result.progress.draft, checksum.steps[1].answer[0] + 'X··Y');
  assert.equal(result.progress.answers.length, 1);
  assert.equal(result.progress.column, 1);
  const copy = at(checksum, 2);
  const one = autoNextEntry(checksum, copy).progress;
  assert.equal(one.draft, checksum.steps[2].answer[0]);
  assert.equal(one.answers.length, 2);
  let next = one;
  for (let i = 1; i < 13; i++) next = autoNextEntry(checksum, next).progress;
  assert.equal(next.cursor, 3);
  assert.equal(next.answers[2], checksum.steps[2].answer);
  const corrupt = { ...start, answers: ['WRONG'] };
  assert.equal(autoNextEntry(checksum, corrupt).progress, corrupt);
  const reviewing = { ...start, cursor: 0 };
  assert.equal(autoNextEntry(checksum, reviewing).progress, reviewing);
});

await test('full checksum shortcut follows the existing rows and does not complete verification or another share', () => {
  const start = prepareLesson(checksum);
  const result = autoChecksum(checksum, start);
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.progress.answers,
    checksum.steps.map((step) => step.answer),
  );
  const saved = emptyWorkbooks();
  saved.books.fresh.initial = [session.shares.A, session.shares.C];
  saved.books.fresh.lessons['checksum-A'] = result.progress;
  const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh;
  assert.equal(restored.flow.checksums.A, true);
  assert.equal(restored.flow.checksums.C, false);
  assert.equal(restored.flow.verified.A, false);
  assert.equal(restored.flow.verified.C, false);
  assert.deepEqual(
    restored.lessons['checksum-A'].answers,
    result.progress.answers,
  );
  const wrong = { ...start, answers: ['WRONG'] };
  assert.equal(autoChecksum(checksum, wrong).progress, wrong);
  const derive = shareExercise(engine, session, ['A', 'C'], 'D');
  assert.equal(autoChecksum(derive, start).progress, start);
});

await test('whole-share display reveals checksum characters only from accepted upward entries', () => {
  assert.equal(
    visibleShare(checksum, prepareLesson(checksum)),
    session.shares.A.slice(0, 35) + '?'.repeat(13),
  );
  for (let cursor = 1; cursor <= checksum.steps.length; cursor++) {
    const progress = at(checksum, cursor);
    const display = visibleShare(checksum, progress);
    assert.equal(display.length, 48);
    for (let i = 0; i < 48; i++)
      if (display[i] !== '?') assert.equal(display[i], session.shares.A[i]);
  }
  assert.equal(
    visibleShare(checksum, at(checksum, checksum.steps.length)),
    session.shares.A,
  );
  assert.equal(visibleShare(checksum, emptyLesson(), true), session.shares.A);
  const verification = checksumExercise(engine, session.shares.A, true);
  assert.equal(visibleShare(verification, emptyLesson()), session.shares.A);
});

await test('single-letter shortcuts can finish generation and verification without skipping partial rows', () => {
  for (const exercise of [
    checksum,
    checksumExercise(engine, session.shares.A, true),
  ]) {
    let progress = prepareLesson(exercise);
    let count = 0;
    while (progress.cursor < exercise.steps.length) {
      assert.ok(++count < 2000);
      const result = autoNextEntry(exercise, progress);
      assert.equal(result.correct, true);
      assert.ok(result.progress.answers.length <= progress.answers.length + 1);
      progress = result.progress;
      if (count % 17 === 0) {
        const saved = emptyWorkbooks();
        saved.books.fresh.initial = [session.shares.A, session.shares.C];
        const key = exercise.verification ? 'verify-A' : 'checksum-A';
        saved.books.fresh.lessons[key] = progress;
        progress = restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh
          .lessons[key];
      }
    }
    assert.deepEqual(
      progress.answers,
      exercise.steps.map((step) => step.answer),
    );
  }
});

await test('saved PLAY workbooks preserve their original key, addresses and checked answers after new keys switch to TEST', () => {
  const old = sessionFromInitial(
    engine,
    [legacy.shares.A, legacy.shares.C],
    'fresh',
  );
  assert.deepEqual(old.shares, legacy.shares);
  assert.equal(old.secret, legacy.secret);
  assert.deepEqual(old.addresses, legacy.addresses);
  const exercise = checksumExercise(engine, old.shares.A);
  const saved = emptyWorkbooks();
  saved.books.fresh.initial = [old.shares.A, old.shares.C];
  saved.books.fresh.lessons['checksum-A'] = {
    ...at(exercise, 8),
    draft: '·P',
    column: 1,
  };
  const restored = restoreWorkbooks(engine, JSON.stringify(saved));
  assert.deepEqual(restored.books.fresh.initial, saved.books.fresh.initial);
  assert.deepEqual(
    restored.books.fresh.lessons['checksum-A'],
    saved.books.fresh.lessons['checksum-A'],
  );
  const fresh = freshSession(engine, legacy.payload);
  assert.match(fresh.shares.A, /^MS12TESTA/);
  assert.equal(
    fresh.shares.A.slice(9, 35) + fresh.shares.C.slice(9, 35),
    legacy.payload,
  );
});

await test('auto dice completes waiting rolls once, records the tree path and respects the character limit', () => {
  let n = 0;
  const dice = rollDiceCharacter((bytes) => bytes.fill(n++ % 2));
  const pending = autoDiceCharacter('QP', dice, emptyDiceEntry(), () => {
    throw Error('Must reuse pending dice');
  });
  assert.ok(pending);
  assert.equal(pending.draft, 'QP' + dice.character);
  assert.deepEqual(pending.diceEntry, {
    bits: dice.bits.split(''),
    character: dice.character,
    recorded: true,
  });
  assert.equal(
    autoDiceCharacter('Q'.repeat(52), null, emptyDiceEntry(), () => {
      throw Error('Full');
    }),
    null,
  );
  const last = autoDiceCharacter('Q'.repeat(51), dice, emptyDiceEntry());
  assert.equal(last?.draft.length, 52);
  assert.throws(
    () =>
      autoDiceCharacter(pending.draft, pending.dice, pending.diceEntry, () => {
        throw Error('RNG failed');
      }),
    /RNG failed/,
  );
  assert.equal(pending.draft, 'QP' + dice.character);
  const saved = emptyWorkbooks();
  Object.assign(saved.books.fresh, pending);
  const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh;
  assert.equal(restored.draft, pending.draft);
  assert.deepEqual(restored.diceEntry, pending.diceEntry);
});
