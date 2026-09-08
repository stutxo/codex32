import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import { publishedSession } from '../lib/workshop.ts';
import {
  checksumExercise,
  shareExercise,
  emptyLesson,
  restoreLesson,
  type Exercise,
} from '../lib/workbook.ts';
import {
  autoStage,
  finishTutorialReading,
  instrumentHandoff,
  openNextStage,
  workbookStage,
  visibleShare,
  confirmTutorialReading,
} from '../lib/workbook-guide.ts';

engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});
const session = publishedSession(engine);
const exercises: Exercise[] = [
  ...(['A', 'C'] as const).map((index) =>
    checksumExercise(engine, session.shares[index]),
  ),
  ...(['A', 'C', 'D'] as const).map((index) =>
    checksumExercise(engine, session.shares[index], true),
  ),
  shareExercise(engine, session, ['A', 'C'], 'D'),
  ...(
    [
      ['A', 'C'],
      ['A', 'D'],
      ['C', 'D'],
    ] as const
  ).map((pair) => shareExercise(engine, session, [...pair], 'S')),
];

await test('every stage shortcut stops exactly at its boundary, including after reload and legacy deferred work', () => {
  for (const exercise of exercises)
    for (const legacy of [false, true]) {
      let progress = emptyLesson();
      if (legacy)
        progress.deferredAnswers = Object.fromEntries(
          exercise.steps.map((step) => [step.id, step.answer]),
        );
      let stages = 0;
      while (progress.answers.length < exercise.steps.length) {
        assert.ok(stages++ < 150);
        progress = openNextStage(exercise, restoreLesson(exercise, progress));
        const step = exercise.steps[progress.cursor];
        if (step.kind === 'translation') {
          assert.equal(progress.factorSide, true);
          const set = { ...progress, primary: step.left! };
          assert.equal(autoStage(exercise, set).correct, false);
          assert.equal(
            finishTutorialReading(exercise, set, 'S').correct,
            false,
          );
          progress = { ...set, factorSide: false };
        }
        const stage = workbookStage(exercise, progress.cursor)!;
        const result = autoStage(exercise, progress);
        assert.equal(result.correct, true, stage.title);
        assert.equal(result.progress.answers.length, stage.end);
        assert.equal(result.complete, stage.end === exercise.steps.length);
        assert.deepEqual(
          result.progress.answers.slice(0, progress.answers.length),
          progress.answers,
        );
        const last = exercise.steps[stage.end - 1];
        if (['addition', 'translation', 'recovery'].includes(last.kind)) {
          assert.equal(result.progress.primary, last.left!.at(-1));
          assert.equal(result.progress.other, last.right!.at(-1));
        }
        const saved = restoreLesson(exercise, result.progress);
        if (!result.complete) {
          assert.ok(instrumentHandoff(exercise, saved));
          assert.equal(autoStage(exercise, saved).progress, saved);
          assert.equal(
            finishTutorialReading(exercise, saved, 'S').correct,
            false,
          );
        }
        progress = saved;
      }
      assert.deepEqual(
        progress.answers,
        exercise.steps.map((step) => step.answer),
      );
      assert.deepEqual(progress.deferredAnswers, {});
      assert.equal(visibleShare(exercise, progress), exercise.output);
      assert.equal(stages, exercise.checksum ? exercise.steps.length : 4);
    }
});

await test('single-entry autofill does not accept any deferred later letters', () => {
  const exercise = shareExercise(engine, session, ['C', 'D'], 'S');
  const progress = {
    ...emptyLesson(),
    deferredAnswers: Object.fromEntries(
      exercise.steps.map((step) => [step.id, step.answer]),
    ),
  };
  const one = finishTutorialReading(exercise, progress, 'S');
  assert.equal(one.progress.answers.length, 1);
  assert.equal(one.progress.deferredAnswers[exercise.steps[0].id], undefined);
  assert.equal(
    one.progress.deferredAnswers[exercise.steps[1].id],
    exercise.steps[1].answer,
  );
});

await test('a final out-of-order column keeps the actual confirmed wheel reading for review', () => {
  const exercise = checksumExercise(engine, session.shares.A);
  const step = exercise.steps[1];
  const column = 3;
  const progress = {
    ...emptyLesson(),
    answers: [exercise.steps[0].answer],
    cursor: 1,
    tutorialStage: step.id,
    column,
    primary: step.left![column],
    draft: step.answer.slice(0, column) + '·' + step.answer.slice(column + 1),
  };
  const result = confirmTutorialReading(engine, exercise, progress, 'S');
  assert.equal(result.correct, true);
  assert.ok(instrumentHandoff(exercise, result.progress));
  assert.equal(result.progress.column, column);
  assert.equal(result.progress.primary, step.left![column]);
  assert.equal(openNextStage(exercise, result.progress).column, 0);
});
