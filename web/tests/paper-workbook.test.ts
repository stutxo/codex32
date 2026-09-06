import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import {
  additionPrinting,
  additionWindows,
  rotatePoint,
} from '../lib/paper-volvelle.ts';
import {
  add,
  alphabet,
  publishedSession,
  checksumWorksheet,
} from '../lib/workshop.ts';
import {
  checksumExercise,
  shareExercise,
  emptyLesson,
  emptyWorkbooks,
  migrateLegacyLesson,
  restoreLesson,
  restoreWorkbooks,
  submitAnswer,
  type LessonProgress,
} from '../lib/workbook.ts';
import {
  rollDiceCharacter,
  emptyDiceEntry,
  recordDiceCharacter,
} from '../lib/workshop.ts';
import {
  normalizeWorkshopFlow,
  initialFlow,
  type Phase,
} from '../lib/workshop-flow.ts';

engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});
const session = publishedSession(engine);
const exercise = shareExercise(engine, session, ['A', 'C'], 'D');

await test('manual dice require every comparison and tree character and can only be recorded once', () => {
  let byte = 0;
  const dice = rollDiceCharacter((bytes) => bytes.fill(byte++ % 2));
  const correct = {
    bits: dice.bits.split(''),
    character: dice.character,
    recorded: false,
  };
  assert.equal(recordDiceCharacter('', dice, emptyDiceEntry()), null);
  assert.equal(
    recordDiceCharacter('', dice, {
      ...correct,
      bits: ['0', ...correct.bits.slice(1)],
    }),
    null,
  );
  assert.equal(
    recordDiceCharacter('', dice, { ...correct, character: 'Q' }),
    null,
  );
  assert.equal(recordDiceCharacter('S', dice, correct), 'S' + dice.character);
  assert.equal(
    recordDiceCharacter('S' + dice.character, dice, {
      ...correct,
      recorded: true,
    }),
    null,
  );
  assert.equal(recordDiceCharacter('S'.repeat(52), dice, correct), null);
  const saved = emptyWorkbooks();
  saved.books.fresh.dice = dice;
  saved.books.fresh.diceEntry = {
    ...correct,
    bits: ['', '1', '0', '', '1'],
    character: 'F',
  };
  assert.deepEqual(
    restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh.diceEntry,
    saved.books.fresh.diceEntry,
  );
  saved.books.fresh.diceEntry = { ...correct, recorded: true };
  saved.books.fresh.draft = 'S' + dice.character;
  assert.equal(
    restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh.diceEntry
      .recorded,
    true,
  );
  saved.books.fresh.diceEntry.character = 'Q';
  assert.throws(
    () => restoreWorkbooks(engine, JSON.stringify(saved)),
    /recorded dice/,
  );
});

await test('every restored or revisited phase respects generation, verification and derivation prerequisites', () => {
  for (let flags = 0; flags < 64; flags++)
    for (const phase of [
      'random',
      'checksum',
      'verify',
      'derive',
      'recover',
      'workbench',
    ] as Phase[]) {
      const bit = (i: number) => Boolean(flags & (1 << i));
      const original = {
        ...initialFlow,
        phase,
        checksums: { A: bit(0), C: bit(1) },
        verified: { A: bit(2), C: bit(3), D: bit(4) },
        verifyIndex: 'D' as const,
      };
      const state = normalizeWorkshopFlow(original, bit(5));
      if (state.phase === 'derive' || state.phase === 'recover') {
        assert.ok(
          state.checksums.A &&
            state.checksums.C &&
            state.verified.A &&
            state.verified.C,
        );
      }
      if (state.phase === 'recover') assert.ok(bit(5) && state.verified.D);
      if (state.phase === 'verify') {
        if (state.verifyIndex === 'D')
          assert.ok(
            bit(5) &&
              state.checksums.A &&
              state.checksums.C &&
              state.verified.A &&
              state.verified.C,
          );
        else assert.ok(state.checksums[state.verifyIndex]);
      }
    }
});

await test('all 1,024 fixed printed addition results lie under the correct rotated paper window', () => {
  assert.equal(
    new Set(additionWindows.map((window) => window.letter)).size,
    32,
  );
  const print = additionPrinting.flatMap((setting) =>
    setting.windows.map((window) => ({
      ...rotatePoint(window.x, window.y, setting.angle),
      result: window.result,
    })),
  );
  for (const setting of additionPrinting)
    for (const window of additionWindows) {
      const hole = rotatePoint(window.x, window.y, setting.angle);
      const ink = print.filter(
        (point) => Math.hypot(point.x - hole.x, point.y - hole.y) < 0.0001,
      );
      assert.equal(
        ink.length,
        1,
        'one permanently printed glyph per window setting',
      );
      assert.equal(ink[0].result, add(engine, setting.primary, window.letter));
    }
  assert.equal(print.length, 1024);
});

await test('the printed derivation table and complete translated rows produce the NAME share despite booklet issue 77', () => {
  assert.deepEqual(
    exercise.steps.slice(0, 2).map((step) => step.answer),
    ['V', 'D'],
  );
  assert.ok(
    exercise.steps
      .slice(2, 47)
      .every((step) => step.id.endsWith('-translate-0')),
  );
  assert.ok(
    exercise.steps
      .slice(47, 92)
      .every((step) => step.id.endsWith('-translate-1')),
  );
  assert.ok(exercise.steps.slice(92).every((step) => step.kind === 'addition'));
  assert.equal(
    'MS1' +
      exercise.steps
        .slice(92)
        .map((step) => step.answer)
        .join(''),
    'MS12NAMEDLL4F8JLH4E5VDVULDLFXU2JHDNLSM97XVENRXEG',
  );
  assert.ok(alphabet.includes('S'), 'S remains valid input data');
});

await test('verification recopies the complete share and computes its endpoint without an upward pass', () => {
  for (const index of ['A', 'C', 'D'] as const) {
    const verified = checksumExercise(engine, session.shares[index], true);
    assert.equal(verified.steps.length, 50);
    assert.equal(verified.steps[0].id, 'verify-copy');
    assert.equal(verified.steps[0].answer, session.shares[index]);
    assert.ok(verified.steps.every((step) => step.direction === 'down'));
    assert.equal(verified.steps.at(-1)?.answer, 'SECRETSHARE32');
    const altered = session.shares[index].split('');
    altered[12] = altered[12] === 'Q' ? 'P' : 'Q';
    assert.throws(() => checksumWorksheet(engine, altered.join(''), false));
  }
});

function oldOrder() {
  const byId = new Map(exercise.steps.map((step) => [step.id, step]));
  return [
    ...exercise.steps.slice(0, 2),
    ...Array.from({ length: 45 }, (_, i) =>
      ['translate-0', 'translate-1', 'add'].map((suffix) =>
        byId.get('column-' + i + '-' + suffix)!,
      ),
    ).flat(),
  ];
}
await test('legacy interleaved answers, wrong drafts, wheel settings and examples survive the printed row order', () => {
  const old = oldOrder();
  const legacy = {
    ...emptyLesson(),
    answers: old.slice(0, 4).map((step) => step.answer),
    cursor: 4,
    draft: 'WRONG',
    primary: 'F',
    other: '7',
    exampleCursor: 8,
    factorSide: false,
  };
  let progress = migrateLegacyLesson(exercise, legacy);
  assert.equal(progress.answers.length, 3);
  assert.equal(progress.deferredAnswers['column-0-translate-1'], old[3].answer);
  assert.equal(progress.parked['column-0-add'].draft, 'WRONG');
  assert.equal(
    progress.exampleCursor,
    exercise.steps.findIndex((step) => step.id === old[8].id),
  );
  progress = restoreLesson(exercise, JSON.parse(JSON.stringify(progress)));
  while (progress.cursor < 92) {
    const checked = submitAnswer(exercise, {
      ...progress,
      draft: exercise.steps[progress.cursor].answer,
    });
    assert.equal(checked.correct, true);
    progress = checked.progress;
  }
  assert.equal(progress.cursor, 92);
  assert.equal(progress.draft, 'WRONG');
  assert.equal(progress.primary, 'F');
  assert.equal(progress.other, '7');
  assert.equal(progress.factorSide, false);
  assert.equal(submitAnswer(exercise, progress).correct, false);
  const complete = migrateLegacyLesson(exercise, {
    ...legacy,
    answers: old.map((step) => step.answer),
    cursor: 137,
    draft: '',
  });
  assert.deepEqual(
    complete.answers,
    exercise.steps.map((step) => step.answer),
  );
});

await test('saved verification is separate and forged deferred answers or correct unsubmitted drafts earn no credit', () => {
  const value: LessonProgress = {
    ...emptyLesson(),
    deferredAnswers: { 'factor-C': 'WRONG', bogus: 'A' },
    parked: { 'column-0-add': { draft: exercise.steps[92].answer } },
  };
  const restored = restoreLesson(exercise, value);
  assert.deepEqual(restored.deferredAnswers, {});
  assert.equal(restored.answers.length, 0);
  assert.equal(
    restored.parked['column-0-add'].draft,
    exercise.steps[92].answer,
  );
  const saved = emptyWorkbooks();
  saved.books.published.initial = [session.shares.A, session.shares.C];
  saved.books.published.flow.phase = 'recover';
  for (const index of ['A', 'C'] as const) {
    const generation = checksumExercise(engine, session.shares[index]);
    saved.books.published.lessons['checksum-' + index] = {
      ...emptyLesson(),
      answers: generation.steps.map((step) => step.answer),
      cursor: 98,
    };
  }
  saved.books.published.lessons.derive = {
    ...emptyLesson(),
    answers: oldOrder().map((step) => step.answer),
    cursor: 137,
  };
  const migrated = restoreWorkbooks(
    engine,
    JSON.stringify({ ...saved, version: 1 }),
  );
  assert.equal(migrated.books.published.lessons.derive.answers.length, 137);
  assert.equal(migrated.books.published.flow.phase, 'verify');
  assert.deepEqual(migrated.books.published.flow.verified, {
    A: false,
    C: false,
    D: false,
  });
});
