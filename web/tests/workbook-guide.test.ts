import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import { publishedSession } from '../lib/workshop.ts';
import {
  checksumExercise,
  emptyLesson,
  emptyWorkbooks,
  restoreWorkbooks,
  submitAnswer,
  editLesson,
  type LessonProgress,
} from '../lib/workbook.ts';
import {
  checkColumn,
  columnEntry,
  writeColumn,
  stepGuide,
} from '../lib/workbook-guide.ts';

engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});
const session = publishedSession(engine);
const exercise = checksumExercise(engine, session.shares.A);
function atStep(cursor: number): LessonProgress {
  return {
    ...emptyLesson(),
    answers: exercise.steps.slice(0, cursor).map((step) => step.answer),
    cursor,
  };
}

await test('guided addition checks one column at a time and awards a row only when every entry matches', () => {
  let progress = atStep(1);
  const row = exercise.steps[1].answer;
  for (let column = 0; column < row.length; column++) {
    const wrong = {
      ...progress,
      draft: writeColumn(progress.draft, column, '!', 13),
    };
    assert.equal(checkColumn(exercise, wrong).correct, false);
    assert.equal(checkColumn(exercise, wrong).progress, wrong);
    progress = {
      ...progress,
      draft: writeColumn(progress.draft, column, row[column], 13),
    };
    const result = checkColumn(exercise, progress);
    assert.equal(result.correct, true);
    progress = result.progress;
    assert.equal(progress.answers.length, column === 12 ? 2 : 1);
    assert.equal(progress.column, column === 12 ? 0 : column + 1);
  }
  assert.equal(progress.cursor, 2);
  assert.equal(progress.answers[1], row);
});

await test('editing or clearing an earlier cell preserves later entries and gaps cannot count as answers', () => {
  const source = 'q p z r y';
  const changed = writeColumn(source, 1, 'X', 13);
  assert.equal(changed, 'QXZRY');
  const cleared = writeColumn(changed, 1, '', 13);
  assert.equal(cleared, 'Q·ZRY');
  assert.equal(columnEntry(cleared, 1), '');
  const later = writeColumn(cleared, 8, '?', 13);
  assert.equal(later, 'Q·ZRY···?');
  assert.equal(columnEntry(later, 8), '?');
  assert.equal(writeColumn(later, 13, 'Q', 13), later);
  const withGap = { ...atStep(1), draft: exercise.steps[1].answer, column: 3 };
  withGap.draft = writeColumn(withGap.draft, 3, '', 13);
  assert.equal(checkColumn(exercise, withGap).correct, false);
  assert.equal(submitAnswer(exercise, withGap).correct, false);
});

await test('unknown paper cells require a typed question mark and incomplete rows survive restoration', () => {
  const cursor = exercise.steps.findIndex(
    (step) => step.kind === 'addition' && step.answer.includes('?'),
  );
  const column = exercise.steps[cursor].answer.indexOf('?');
  let progress = { ...atStep(cursor), column, primary: 'A', other: 'C' };
  assert.equal(checkColumn(exercise, progress).correct, false);
  progress = { ...progress, draft: writeColumn('', column, '?', 13) };
  const checked = checkColumn(exercise, progress);
  assert.equal(checked.correct, true);
  assert.equal(checked.progress.answers.length, cursor);
  const saved = emptyWorkbooks();
  saved.books.published.initial = [session.shares.A, session.shares.C];
  saved.books.published.lessons['checksum-A'] = progress;
  const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books
    .published.lessons['checksum-A'];
  assert.deepEqual(restored, progress);
});

await test('old full-row drafts, checked-step review and worked examples keep their existing semantics', () => {
  const ready = {
    ...atStep(1),
    draft: exercise.steps[1].answer.toLowerCase().split('').join(' '),
  };
  const saved = emptyWorkbooks();
  saved.books.published.initial = [session.shares.A, session.shares.C];
  saved.books.published.lessons['checksum-A'] = ready;
  const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books
    .published.lessons['checksum-A'];
  assert.equal(restored.answers.length, 1);
  assert.equal(restored.draft, ready.draft);
  assert.equal(submitAnswer(exercise, restored).correct, true);
  const extra = { ...ready, draft: exercise.steps[1].answer + 'Q' };
  assert.equal(checkColumn(exercise, extra).correct, false);
  const reviewed = { ...atStep(2), cursor: 1, draft: 'UNFINISHED' };
  assert.equal(checkColumn(exercise, reviewed).correct, false);
  const shown = editLesson(
    ready,
    { column: 8, primary: 'F', draft: 'ERASED', answers: [] },
    true,
  );
  assert.equal(shown.draft, ready.draft);
  assert.deepEqual(shown.answers, ready.answers);
  assert.equal(shown.column, ready.column);
  assert.equal(shown.exampleWheel.column, 8);
});

await test('paper guidance identifies header rows, the checksum staircase and the correct book references', () => {
  assert.equal(
    stepGuide(exercise.steps[1], true).top,
    'Beginning of your share',
  );
  assert.equal(
    stepGuide(exercise.steps[1], true).bottom,
    'Fixed starting row from the book',
  );
  const lookup = exercise.steps.find((step) => step.id === 'down-0-lookup')!;
  assert.equal(stepGuide(lookup, true).position, 'Row 1 of 16');
  assert.equal(stepGuide(lookup, true).page, 22);
  assert.equal(
    stepGuide(
      exercise.steps.find((step) => step.id === 'up-0-add')!,
      true,
    ).position,
    'Row 16 of 16',
  );
  assert.equal(
    stepGuide(
      exercise.steps.find((step) => step.id === 'up-15-shift')!,
      true,
    ).position,
    'Row 1 of 16',
  );
  const factor = { ...lookup, kind: 'recovery' as const };
  assert.equal(stepGuide(factor, false, 'D').page, 16);
  assert.equal(stepGuide(factor, false, 'S').page, 17);
});
