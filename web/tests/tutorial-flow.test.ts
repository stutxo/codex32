import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import { publishedSession } from '../lib/workshop.ts';
import {
  autoExercise,
  autoNextEntry,
  tutorialCalculation,
} from '../lib/workbook-guide.ts';
import {
  checksumExercise,
  shareExercise,
  computerCheck,
  emptyBook,
  emptyLesson,
  emptyWorkbooks,
  restoreWorkbooks,
  type Book,
} from '../lib/workbook.ts';
import {
  initialFlow,
  normalizeWorkshopFlow,
  shareChecked,
  workshopFlow,
} from '../lib/workshop-flow.ts';
engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});
const session = publishedSession(engine);
const a = checksumExercise(engine, session.shares.A),
  c = checksumExercise(engine, session.shares.C);
const derive = shareExercise(engine, session, ['A', 'C'], 'D');
const recover = shareExercise(engine, session, ['C', 'D'], 'S');
function sourceBook(): Book {
  return { ...emptyBook(), initial: [session.shares.A, session.shares.C] };
}
function finishInitial(book: Book, index: 'A' | 'C') {
  const exercise = index === 'A' ? a : c;
  const progress = autoExercise(exercise, emptyLesson()).progress;
  return computerCheck(
    engine,
    {
      ...book,
      lessons: { ...book.lessons, ['checksum-' + index]: progress },
      flow: workshopFlow(book.flow, { type: 'checksum-completed', index }),
    },
    index,
  );
}

await test('fast tutorial reaches the real secret while keeping paper verification optional and untouched', () => {
  const paperDraft = { ...emptyLesson(), draft: 'MS12', primary: 'F' };
  let book = sourceBook();
  book.lessons['verify-A'] = paperDraft;
  book = finishInitial(book, 'A');
  assert.equal(book.flow.phase, 'checksum');
  assert.equal(book.flow.checksumIndex, 'C');
  assert.equal(book.flow.computerVerified.A, true);
  assert.equal(book.flow.verified.A, false);
  assert.deepEqual(book.lessons['verify-A'], paperDraft);
  book = finishInitial(book, 'C');
  assert.equal(book.flow.phase, 'derive');
  assert.throws(() => computerCheck(engine, book, 'D'), /Complete this share/);
  book.lessons.derive = autoExercise(derive, emptyLesson()).progress;
  book = computerCheck(
    engine,
    {
      ...book,
      flow: workshopFlow(book.flow, { type: 'derivation-completed' }),
    },
    'D',
  );
  assert.equal(book.flow.phase, 'recover');
  assert.deepEqual(book.flow.verified, { A: false, C: false, D: false });
  assert.deepEqual(book.flow.computerVerified, { A: true, C: true, D: true });
  const secret = autoExercise(recover, emptyLesson());
  assert.equal(secret.complete, true);
  assert.deepEqual(
    secret.progress.answers,
    recover.steps.map((step) => step.answer),
  );
  assert.equal(recover.output, session.secret);
  const saved = emptyWorkbooks();
  saved.books.fresh = book;
  const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh;
  assert.equal(restored.flow.phase, 'recover');
  assert.deepEqual(restored.lessons['verify-A'], paperDraft);
  assert.deepEqual(restored.flow.computerVerified, book.flow.computerVerified);
  assert.equal(
    normalizeWorkshopFlow(
      { ...restored.flow, phase: 'verify', verifyIndex: 'A' },
      true,
    ).phase,
    'verify',
  );
});

await test('computer checks require completed source calculations and do not trust saved flags', () => {
  const book = sourceBook();
  for (const index of ['A', 'C', 'D'] as const)
    assert.throws(() => computerCheck(engine, book, index));
  const forged = {
    ...book,
    flow: {
      ...book.flow,
      phase: 'recover' as const,
      computerVerified: { A: true, C: true, D: true },
    },
  };
  const save = emptyWorkbooks();
  save.books.fresh = forged;
  const restored = restoreWorkbooks(engine, JSON.stringify(save)).books.fresh;
  assert.deepEqual(restored.flow.computerVerified, {
    A: false,
    C: false,
    D: false,
  });
  assert.equal(restored.flow.phase, 'checksum');
  const bad = autoExercise(a, emptyLesson()).progress;
  bad.answers[3] = 'WRONG';
  assert.throws(() =>
    computerCheck(engine, { ...book, lessons: { 'checksum-A': bad } }, 'A'),
  );
  assert.deepEqual(emptyBook().flow.computerVerified, {
    A: false,
    C: false,
    D: false,
  });
});

await test('mixed paper and computer checks obey the same navigation prerequisites', () => {
  for (let flags = 0; flags < 512; flags++) {
    const bit = (i: number) => Boolean(flags & (1 << i));
    const state = {
      ...initialFlow,
      checksums: { A: bit(0), C: bit(1) },
      verified: { A: bit(2), C: bit(3), D: bit(4) },
      computerVerified: { A: bit(5), C: bit(6), D: bit(7) },
    };
    for (const phase of ['derive', 'recover'] as const) {
      const next = normalizeWorkshopFlow({ ...state, phase }, bit(8));
      if (next.phase === 'derive' || next.phase === 'recover') {
        assert.ok(
          state.checksums.A &&
            state.checksums.C &&
            shareChecked(state, 'A') &&
            shareChecked(state, 'C'),
        );
      }
      if (next.phase === 'recover')
        assert.ok(bit(8) && shareChecked(state, 'D'));
    }
  }
});

await test('tutorial previews do not grant progress; explicit next actions retain the exact paper calculations', () => {
  for (const [exercise, target] of [
    [a, 'S'],
    [derive, 'D'],
    [recover, 'S'],
  ] as const) {
    const untouched = emptyLesson();
    const preview = tutorialCalculation(exercise, untouched, target);
    assert.deepEqual(untouched, emptyLesson());
    assert.ok(
      ['addition', 'translation', 'recovery'].includes(
        exercise.steps[preview.cursor].kind,
      ),
    );
    if (target === 'D') assert.equal(preview.cursor, 2);
    let progress = untouched,
      turns = 0;
    while (progress.cursor < exercise.steps.length) {
      assert.ok(turns++ < 1500);
      const next = tutorialCalculation(exercise, progress, target);
      if (next.cursor === exercise.steps.length) {
        progress = autoExercise(exercise, progress).progress;
        break;
      }
      const result = autoNextEntry(exercise, next);
      assert.equal(result.correct, true);
      progress = result.progress;
    }
    assert.deepEqual(
      progress.answers,
      exercise.steps.map((step) => step.answer),
    );
  }
});

await test('an overlong row at an unknown cell stays editable and full completion can repair it', () => {
  const cursor = a.steps.findIndex((step) => step.id === 'down-9-add');
  const progress = {
    ...emptyLesson(),
    cursor,
    column: 12,
    answers: a.steps.slice(0, cursor).map((step) => step.answer),
    draft: a.steps[cursor].answer + 'Q',
  };
  const before = structuredClone(progress);
  const next = tutorialCalculation(a, progress, 'S');
  assert.equal(next.cursor, cursor);
  assert.equal(a.steps[next.cursor].left?.[next.column], '?');
  assert.deepEqual(progress, before);
  assert.equal(autoNextEntry(a, next).correct, false);
  assert.equal(autoExercise(a, progress).complete, true);
});
