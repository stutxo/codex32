import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import {
  completePracticeSession,
  publishedSession,
  rollDiceCharacter,
  type Pair,
} from '../lib/workshop.ts';
import {
  checksumExercise,
  shareExercise,
  editLesson,
  emptyBook,
  emptyLesson,
  emptyWorkbooks,
  readWorkbooks,
  restoreWorkbooks,
  saveWorkbooks,
  showExample,
  submitAnswer,
  STORAGE_KEY,
  type Exercise,
  type LessonProgress,
  type WorkbookStorage,
} from '../lib/workbook.ts';

engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});
const published = publishedSession(engine);
const fresh = completePracticeSession(engine, 'QPZ', (bytes) =>
  bytes.forEach((_, i) => {
    bytes[i] = i;
  }),
);
const a = checksumExercise(engine, fresh.shares.A);
const c = checksumExercise(engine, fresh.shares.C);
const derive = shareExercise(engine, fresh, ['A', 'C'], 'D');
function solve(
  exercise: Exercise,
  count = exercise.steps.length,
): LessonProgress {
  let progress = emptyLesson();
  for (const step of exercise.steps.slice(0, count)) {
    const submitted = submitAnswer(exercise, {
      ...progress,
      draft: step.answer,
    });
    assert.equal(submitted.correct, true);
    progress = submitted.progress;
  }
  return progress;
}
function savedFixture() {
  const saved = emptyWorkbooks();
  saved.books.fresh.initial = [fresh.shares.A, fresh.shares.C];
  saved.books.fresh.flow.phase = 'checksum';
  saved.books.fresh.flow.checksumIndex = 'C';
  saved.books.fresh.lessons['checksum-A'] = solve(a);
  saved.books.fresh.lessons['checksum-C'] = {
    ...solve(c, 3),
    draft: 'Q? Q',
    column: 4,
    primary: 'F',
    other: '7',
    tableFirst: 'A',
    tableSecond: 'C',
    tableOpen: true,
  };
  saved.books.fresh.draft = 'QPZ';
  let counter = 0;
  saved.books.fresh.dice = rollDiceCharacter((bytes) =>
    bytes.fill(counter++ % 2),
  );
  saved.books.published.initial = [published.shares.A, published.shares.C];
  saved.books.published.example = true;
  saved.books.published.examplePhase = 'derive';
  return saved;
}

await test('manual checks reject missing, partial, wrong and skipped entries without losing the draft', () => {
  for (const exercise of [a, derive]) {
    for (const draft of ['', '!', exercise.steps[0].answer.slice(1)]) {
      const progress = { ...emptyLesson(), draft, primary: 'F', other: 'Z' };
      const answer = submitAnswer(exercise, progress);
      assert.equal(answer.correct, false);
      assert.equal(answer.progress, progress);
      assert.equal(answer.complete, false);
    }
    const correct = exercise.steps[0].answer.toLowerCase().split('').join(' ');
    const answer = submitAnswer(exercise, { ...emptyLesson(), draft: correct });
    assert.equal(answer.correct, true);
    assert.equal(answer.progress.cursor, 1);
    assert.equal(answer.progress.answers[0], exercise.steps[0].answer);
    assert.equal(answer.progress.draft, '');
    const skipped = { ...emptyLesson(), cursor: 4, draft: correct };
    assert.equal(submitAnswer(exercise, skipped).correct, false);
    const forged = {
      ...emptyLesson(),
      answers: ['!'],
      cursor: 1,
      draft: exercise.steps[1].answer,
    };
    assert.equal(submitAnswer(exercise, forged).correct, false);
  }
});

await test('the hands-on checksum includes table lookup, shifting, addition and upward copying for both shares', () => {
  for (const [exercise, encoded] of [
    [a, fresh.shares.A],
    [c, fresh.shares.C],
  ] as const) {
    assert.equal(exercise.steps.length, 98);
    assert.equal(new Set(exercise.steps.map((step) => step.id)).size, 98);
    assert.equal(
      exercise.steps.filter((step) => step.kind === 'lookup').length,
      16,
    );
    assert.equal(
      exercise.steps.filter((step) => step.kind === 'shift').length,
      32,
    );
    assert.equal(
      exercise.steps.filter(
        (step) => step.direction === 'up' && step.kind === 'copy',
      ).length,
      16,
    );
    const complete = solve(exercise);
    assert.equal(complete.answers.length, exercise.steps.length);
    assert.equal(exercise.output, encoded);
    assert.equal(exercise.checksum, encoded.slice(-13));
    assert.equal(complete.answers[0], 'SECRETSHARE32');
    const upward = exercise.steps.filter((step) => step.direction === 'up');
    for (let i = 0; i < upward.length; i += 3) {
      assert.equal(upward[i + 1].answer, upward[i].answer.slice(-2));
      assert.equal(
        upward[i + 2].answer,
        upward[i + 2].following + upward[i].answer.slice(0, 11),
      );
      if (i + 3 < upward.length)
        assert.equal(upward[i + 3].left, upward[i + 2].answer);
    }
  }
});

await test('derivation and every recovery pair require two factors and all 45 three-operation columns', () => {
  for (const exercise of [
    derive,
    ...(['A,C', 'A,D', 'C,D'] as const).map((pair) =>
      shareExercise(engine, fresh, pair.split(',') as Pair, 'S'),
    ),
  ]) {
    assert.equal(exercise.steps.length, 137);
    assert.equal(
      exercise.steps.filter((step) => step.kind === 'recovery').length,
      2,
    );
    assert.equal(
      exercise.steps.filter((step) => step.kind === 'translation').length,
      90,
    );
    const sums = exercise.steps.filter((step) => step.kind === 'addition');
    assert.deepEqual(
      sums.map((step) => step.position),
      Array.from({ length: 45 }, (_, i) => i + 4),
    );
    const complete = solve(exercise);
    assert.equal(complete.answers.length, 137);
    assert.equal(
      'MS1' + sums.map((step) => step.answer).join(''),
      exercise.output,
    );
  }
});

await test('worked-example navigation and wheel changes never change the learner draft, checked work, or location', () => {
  const book = emptyBook();
  book.flow.phase = 'checksum';
  book.flow.checksumIndex = 'C';
  book.lessons['checksum-C'] = {
    ...solve(c, 5),
    draft: 'NOT DONE',
    primary: 'A',
    other: 'C',
  };
  const before = structuredClone(book);
  const shown = showExample(book, true);
  assert.equal(shown.lessons['checksum-C'].exampleCursor, 5);
  shown.lessons['checksum-C'] = editLesson(
    shown.lessons['checksum-C'],
    {
      exampleCursor: 30,
      primary: 'F',
      other: 'J',
      answers: c.steps.map((step) => step.answer),
      draft: c.steps[5].answer,
      cursor: a.steps.length,
    },
    true,
  );
  shown.examplePhase = 'recover';
  shown.examplePair = 'A,D';
  shown.exampleChecksumIndex = 'A';
  const resumed = showExample(shown, false);
  assert.deepEqual(resumed.flow, before.flow);
  for (const key of [
    'answers',
    'draft',
    'cursor',
    'primary',
    'other',
  ] as const) {
    assert.deepEqual(
      resumed.lessons['checksum-C'][key],
      before.lessons['checksum-C'][key],
    );
  }
  assert.equal(resumed.pair, before.pair);
});

await test('saved books restore partial and wrong drafts, wheel settings, dice and independent published progress', () => {
  const saved = savedFixture();
  saved.books.fresh.lessons['recover-A,C'] = {
    ...solve(shareExercise(engine, fresh, ['A', 'C'], 'S'), 4),
    draft: 'Q',
  };
  saved.books.fresh.lessons['recover-C,D'] = { ...emptyLesson(), draft: 'F' };
  const restored = restoreWorkbooks(engine, JSON.stringify(saved));
  assert.equal(restored.active, 'fresh');
  assert.deepEqual(restored.books.fresh.initial, saved.books.fresh.initial);
  assert.equal(restored.books.fresh.draft, 'QPZ');
  assert.deepEqual(restored.books.fresh.dice, saved.books.fresh.dice);
  assert.deepEqual(
    restored.books.fresh.lessons['checksum-C'],
    saved.books.fresh.lessons['checksum-C'],
  );
  assert.deepEqual(
    restored.books.fresh.lessons['recover-A,C'],
    saved.books.fresh.lessons['recover-A,C'],
  );
  assert.deepEqual(
    restored.books.fresh.lessons['recover-C,D'],
    saved.books.fresh.lessons['recover-C,D'],
  );
  assert.deepEqual(restored.books.fresh.flow.checksums, { A: true, C: false });
  assert.equal(restored.books.fresh.flow.checksumIndex, 'C');
  assert.equal(restored.books.published.examplePhase, 'derive');
  assert.deepEqual(
    restored.books.published.initial,
    saved.books.published.initial,
  );
});

await test('restoration rechecks completion and truncates forged work at the first wrong submitted answer', () => {
  const saved = savedFixture();
  saved.books.fresh.lessons['checksum-C'] = solve(c);
  saved.books.fresh.lessons.derive = solve(derive);
  saved.books.fresh.flow.phase = 'recover';
  const complete = restoreWorkbooks(engine, JSON.stringify(saved));
  assert.deepEqual(complete.books.fresh.flow.checksums, { A: true, C: true });
  assert.equal(complete.books.fresh.flow.phase, 'recover');
  saved.books.fresh.lessons['checksum-A'].answers[3] = 'Q';
  saved.books.fresh.lessons['checksum-A'].cursor = 9000;
  saved.books.fresh.flow.checksums = { A: true, C: true };
  const restored = restoreWorkbooks(engine, JSON.stringify(saved));
  assert.equal(restored.books.fresh.lessons['checksum-A'].answers.length, 3);
  assert.equal(restored.books.fresh.lessons['checksum-A'].cursor, 3);
  assert.equal(restored.books.fresh.lessons['checksum-A'].draft, 'Q');
  assert.equal(restored.books.fresh.flow.checksums.A, false);
  assert.equal(restored.books.fresh.flow.phase, 'checksum');
  const tampered = savedFixture();
  tampered.books.fresh.initial![0] = 'MS1' + 'Q'.repeat(45);
  assert.throws(() => restoreWorkbooks(engine, JSON.stringify(tampered)));
});

await test('a correct but unsubmitted answer remains unsubmitted after reload', () => {
  const saved = savedFixture();
  const progress = saved.books.fresh.lessons['checksum-C'];
  progress.draft = c.steps[progress.answers.length].answer;
  const restored = restoreWorkbooks(engine, JSON.stringify(saved));
  assert.equal(
    restored.books.fresh.lessons['checksum-C'].answers.length,
    progress.answers.length,
  );
  assert.equal(
    restored.books.fresh.lessons['checksum-C'].draft,
    progress.draft,
  );
});

await test('storage helpers preserve unreadable saves and surface denied reads or writes', () => {
  const saved = savedFixture();
  const data = new Map<string, string>();
  const storage: WorkbookStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  assert.deepEqual(readWorkbooks(engine, storage), emptyWorkbooks());
  saveWorkbooks(storage, saved);
  assert.deepEqual(
    readWorkbooks(engine, storage).books.fresh.initial,
    saved.books.fresh.initial,
  );
  for (const invalid of [
    '{',
    '{"version":2}',
    '{"version":1}',
    JSON.stringify({ ...saved, books: { fresh: [], published: {} } }),
    JSON.stringify({ ...saved, books: { fresh: 'unreadable', published: {} } }),
    JSON.stringify({
      ...saved,
      books: { fresh: { lessons: [] }, published: {} },
    }),
    JSON.stringify({
      ...saved,
      books: { fresh: { lessons: { derive: 'bad' } }, published: {} },
    }),
    'x'.repeat(200_001),
  ]) {
    data.set(STORAGE_KEY, invalid);
    assert.throws(() => readWorkbooks(engine, storage));
    assert.equal(data.get(STORAGE_KEY), invalid);
  }
  const unavailable: WorkbookStorage = {
    ...storage,
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
  };
  assert.throws(() => readWorkbooks(engine, unavailable), /denied/);
  assert.throws(() => saveWorkbooks(unavailable, saved), /quota/);
  assert.equal(saved.books.fresh.lessons['checksum-C'].draft, 'Q? Q');
});
