import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import { alphabet, multiply, publishedSession } from '../lib/workshop.ts';
import {
  autoExercise,
  autoStage,
  workbookStage,
  openNextStage,
  confirmTutorialRow,
  autoNextEntry,
  tutorialCalculation,
  visibleShare,
  visibleTranslation,
  readingProgress,
  finishTutorialReading,
  instrumentHandoff,
  confirmTutorialReading,
} from '../lib/workbook-guide.ts';
import {
  checksumExercise,
  shareExercise,
  computerCheck,
  emptyBook,
  emptyLesson,
  emptyWorkbooks,
  restoreWorkbooks,
  resetSection,
  prepareLesson,
  visitLesson,
  restoreLesson,
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

await test('manual paper entries and live wheel confirmations complete every worksheet without hidden work', () => {
  for (const [exercise, target] of [
    [a, 'S'],
    [c, 'S'],
    [derive, 'D'],
    ...(['A', 'C', 'D'] as const).map(
      (index) =>
        [checksumExercise(engine, session.shares[index], true), 'S'] as const,
    ),
  ] as const) {
    let progress = emptyLesson(),
      count = 0;
    while (progress.answers.length < exercise.steps.length) {
      assert.ok(count++ < 2000);
      if (instrumentHandoff(exercise, progress)) {
        assert.equal(
          finishTutorialReading(exercise, progress, target).correct,
          false,
        );
        progress = openNextStage(exercise, progress);
      }
      const preview = tutorialCalculation(exercise, progress, target);
      assert.deepEqual(
        preview.answers,
        progress.answers,
        'Viewing cannot supply any entries',
      );
      const step = exercise.steps[preview.cursor];
      const column = Math.min(preview.column, (step.right?.length ?? 1) - 1);
      const wheel =
        ['addition', 'translation', 'recovery'].includes(step.kind) &&
        !(step.kind === 'recovery' && target === 'D') &&
        step.left?.[column] !== '?' &&
        step.right?.[column] !== '?';
      if (step.kind === 'translation' && progress.factorSide) {
        assert.equal(
          confirmTutorialReading(
            engine,
            exercise,
            { ...progress, primary: step.left! },
            target,
          ).correct,
          false,
        );
        progress = { ...progress, primary: step.left!, factorSide: false };
      }
      const before = progress.answers.length;
      const result = wheel
        ? confirmTutorialReading(
            engine,
            exercise,
            { ...progress, primary: step.left![column] },
            target,
          )
        : confirmTutorialRow(exercise, { ...progress, draft: step.answer });
      assert.equal(result.correct, true, step.id + ' column ' + column);
      assert.ok(result.progress.answers.length <= before + 1);
      progress = restoreLesson(exercise, result.progress);
      assert.equal(progress.draft, result.progress.draft);
    }
    assert.deepEqual(
      progress.answers,
      exercise.steps.map((step) => step.answer),
    );
    assert.equal(visibleShare(exercise, progress), exercise.output);
  }
});
await test('manual wheel confirmation records exactly one correct reading for every recovery pair', () => {
  for (const pair of [
    ['A', 'C'],
    ['A', 'D'],
    ['C', 'D'],
  ] as const) {
    const exercise = shareExercise(engine, session, [...pair], 'S');
    let progress = emptyLesson();
    let switches = 0;
    while (progress.answers.length < exercise.steps.length) {
      const handoff = instrumentHandoff(exercise, progress);
      if (handoff) {
        assert.deepEqual(
          confirmTutorialReading(engine, exercise, progress, 'S'),
          {
            correct: false,
            complete: false,
            progress,
          },
          'Switching instruments must remain an explicit action',
        );
        switches++;
        progress = restoreLesson(exercise, {
          ...progress,
          tutorialStage: handoff.next.id,
          primary: 'Q',
        });
        assert.equal(instrumentHandoff(exercise, progress), null);
      }
      const next = tutorialCalculation(exercise, progress, 'S');
      const step = exercise.steps[next.cursor];
      const before = readingProgress(exercise, progress).completed;
      // Translation readings require the explicitly flipped reading face.
      const aligned = {
        ...progress,
        primary: step.left!,
        other: 'Q',
        factorSide: false,
      };
      assert.equal(
        readingProgress(exercise, aligned).completed,
        before,
        'Turning the wheel must not count as a confirmed answer',
      );
      const wrong = {
        ...aligned,
        primary: alphabet
          .split('')
          .find((char) => char !== step.left && char !== 'Q')!,
      };
      assert.deepEqual(confirmTutorialReading(engine, exercise, wrong, 'S'), {
        correct: false,
        complete: false,
        progress: wrong,
      });
      const result = confirmTutorialReading(engine, exercise, aligned, 'S');
      assert.equal(result.correct, true, step.id);
      assert.equal(result.progress.answers.length, progress.answers.length + 1);
      assert.equal(
        readingProgress(exercise, result.progress).completed,
        before + 1,
      );
      assert.equal(result.progress.answers[next.cursor], step.answer);
      const automated = finishTutorialReading(
        exercise,
        { ...next, primary: step.left!, factorSide: false },
        'S',
      );
      assert.deepEqual(
        result.progress.answers,
        automated.progress.answers,
        'Auto-fill and manual confirmation should record the same single entry',
      );
      if (step.kind !== 'addition') {
        assert.equal(
          visibleShare(exercise, result.progress),
          'MS1' + '?'.repeat(45),
        );
      }
      if (
        exercise.steps[result.progress.cursor]?.kind === step.kind ||
        instrumentHandoff(exercise, result.progress)
      ) {
        assert.equal(
          result.progress.primary,
          aligned.primary,
          'Confirming does not turn the current wheel',
        );
      }
      progress = restoreLesson(exercise, result.progress);
      assert.deepEqual(
        progress.answers,
        result.progress.answers,
        'Reload preserves confirmation',
      );
      assert.equal(
        result.complete,
        progress.answers.length === exercise.steps.length,
      );
    }
    assert.equal(switches, 3);
    assert.equal(visibleShare(exercise, progress), session.secret);
    assert.equal(
      confirmTutorialReading(engine, exercise, progress, 'S').correct,
      false,
    );
  }
});

await test('matching zero readings still require the right translation setting', () => {
  const at = recover.steps.findIndex(
    (step) => step.kind === 'translation' && step.right === 'Q',
  );
  assert.ok(at > 2);
  const step = recover.steps[at];
  const progress = {
    ...emptyLesson(),
    cursor: at,
    answers: recover.steps.slice(0, at).map((entry) => entry.answer),
    primary: alphabet
      .split('')
      .find((char) => char !== step.left && char !== 'Q')!,
  };
  assert.equal(multiply(engine, progress.primary, 'Q'), step.answer);
  assert.equal(
    confirmTutorialReading(engine, recover, progress, 'S').correct,
    false,
  );
  assert.equal(
    confirmTutorialReading(
      engine,
      recover,
      { ...progress, primary: step.left!, factorSide: false },
      'S',
    ).correct,
    true,
  );

  // A stored Q setting is displayed as P on the translation wheel (there is no Q factor slot).
  const identity = {
    ...recover,
    steps: [{ ...step, left: 'P', right: 'C', answer: 'C' }],
  };
  const result = confirmTutorialReading(
    engine,
    identity,
    { ...emptyLesson(), factorSide: false },
    'S',
  );
  assert.equal(result.correct, true);
  assert.deepEqual(result.progress.answers, ['C']);
});

await test('unreadable settings and malformed saved work cannot be confirmed', () => {
  for (const primary of [recover.steps[0].right!, 'S', '?', '']) {
    const progress = { ...emptyLesson(), primary };
    assert.deepEqual(confirmTutorialReading(engine, recover, progress, 'S'), {
      correct: false,
      complete: false,
      progress,
    });
  }
  for (const progress of [
    {
      ...emptyLesson(),
      primary: recover.steps[0].left!,
      draft: recover.steps[0].answer + 'Q',
    },
    {
      ...emptyLesson(),
      primary: recover.steps[1].left!,
      cursor: 1,
      answers: ['?'],
    },
  ]) {
    assert.deepEqual(confirmTutorialReading(engine, recover, progress, 'S'), {
      correct: false,
      complete: false,
      progress,
    });
  }
});

await test('recovery keeps each factor setting and explicitly hands off to a different paper instrument', () => {
  let progress = emptyLesson();
  for (let i = 0; i < 2; i++) {
    const step = recover.steps[i];
    progress = finishTutorialReading(
      recover,
      {
        ...progress,
        primary: step.left!,
        other: step.right!,
        factorSide: false,
      },
      'S',
    ).progress;
    assert.equal(
      progress.primary,
      step.left,
      'The factor wheel must not snap back after recording',
    );
    assert.equal(progress.answers[i], step.answer);
    assert.equal(progress.answers.length, i + 1);
  }
  const handoff = instrumentHandoff(recover, progress)!;
  assert.equal(handoff.previous.kind, 'recovery');
  assert.equal(handoff.next.kind, 'translation');
  assert.equal(visibleShare(recover, progress), 'MS1' + '?'.repeat(45));
  const acknowledged = {
    ...progress,
    tutorialStage: handoff.next.id,
    primary: 'Q',
  };
  const restored = restoreLesson(recover, acknowledged);
  assert.equal(instrumentHandoff(recover, restored), null);
  assert.deepEqual(
    restored.answers,
    progress.answers,
    'Opening an instrument cannot grant a letter',
  );
  assert.equal(
    restoreLesson(recover, { ...progress, tutorialStage: 'invented' })
      .tutorialStage,
    undefined,
  );
  const step = recover.steps[restored.cursor];
  const firstLetter = finishTutorialReading(
    recover,
    { ...restored, primary: step.left!, other: step.right! },
    'S',
  );
  assert.equal(firstLetter.progress.answers.length, 3);
  assert.equal(firstLetter.progress.answers[2], step.answer);
  assert.equal(instrumentHandoff(recover, firstLetter.progress), null);
  assert.equal(
    resetSection(
      { ...emptyBook(), lessons: { 'recover-C,D': acknowledged } },
      'recover-C,D',
    ).lessons['recover-C,D'].tutorialStage,
    undefined,
  );
});

await test('stage autofill pauses at both translation rows and never crosses a pending Next or fusion setup', () => {
  for (const [exercise, target] of [
    [derive, 'D'],
    [recover, 'S'],
  ] as const) {
    let progress = autoStage(exercise, emptyLesson()).progress;
    assert.equal(progress.answers.length, 2);
    assert.equal(visibleShare(exercise, progress), 'MS1' + '?'.repeat(45));
    for (const suffix of ['-translate-0', '-translate-1']) {
      assert.ok(instrumentHandoff(exercise, progress));
      assert.equal(autoStage(exercise, progress).progress, progress);
      assert.equal(
        finishTutorialReading(exercise, progress, target).correct,
        false,
      );
      const previousAnswers = progress.answers;
      progress = openNextStage(exercise, restoreLesson(exercise, progress));
      assert.deepEqual(progress.answers, previousAnswers);
      assert.ok(exercise.steps[progress.cursor].id.endsWith(suffix));
      const factor = exercise.steps[progress.cursor].left!;
      assert.equal(progress.factorSide, true);
      progress = { ...progress, primary: factor };
      assert.equal(autoStage(exercise, progress).correct, false);
      assert.equal(
        confirmTutorialReading(engine, exercise, progress, target).correct,
        false,
      );
      progress = { ...progress, factorSide: false };
      const boundary = workbookStage(exercise, progress.cursor)!.end;
      const filled = autoStage(exercise, progress);
      assert.equal(filled.complete, false);
      assert.equal(filled.progress.answers.length, boundary);
      assert.equal(filled.progress.primary, factor);
      assert.equal(filled.progress.factorSide, false);
      assert.equal(
        visibleShare(exercise, filled.progress),
        'MS1' + '?'.repeat(45),
      );
      progress = filled.progress;
    }
    assert.equal(instrumentHandoff(exercise, progress)!.next.kind, 'addition');
    progress = openNextStage(exercise, progress);
    const first = exercise.steps[progress.cursor];
    progress = finishTutorialReading(
      exercise,
      { ...progress, primary: first.left! },
      target,
    ).progress;
    assert.equal(
      visibleShare(exercise, progress),
      exercise.output.slice(0, 4) + '?'.repeat(44),
    );
    progress = autoStage(exercise, progress).progress;
    assert.equal(visibleShare(exercise, progress), exercise.output);
  }
});
function sourceBook(): Book {
  return { ...emptyBook(), initial: [session.shares.A, session.shares.C] };
}
function finishInitial(book: Book, index: 'A' | 'C') {
  const exercise = index === 'A' ? a : c;
  const progress = autoExercise(exercise, emptyLesson()).progress;
  const generated = computerCheck(
    engine,
    {
      ...book,
      lessons: { ...book.lessons, ['checksum-' + index]: progress },
      flow: workshopFlow(book.flow, { type: 'checksum-completed', index }),
    },
    index,
    false,
  );
  const verification = checksumExercise(engine, session.shares[index], true);
  return {
    ...generated,
    lessons: {
      ...generated.lessons,
      ['verify-' + index]: autoExercise(verification, emptyLesson()).progress,
    },
    flow: workshopFlow(generated.flow, {
      type: 'verification-completed',
      index,
    }),
  };
}

await test('generated shares stay visible through reload until the learner continues to checksums', () => {
  const saved = emptyWorkbooks();
  saved.books.fresh = {
    ...sourceBook(),
    flow: workshopFlow(initialFlow, { type: 'session-created' }),
  };
  const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh;
  assert.equal(restored.flow.phase, 'random');
  assert.deepEqual(restored.initial, saved.books.fresh.initial);
  assert.deepEqual(restored.flow.checksums, { A: false, C: false });
  assert.deepEqual(restored.flow.computerVerified, {
    A: false,
    C: false,
    D: false,
  });
  for (const [id, exercise] of [
    ['checksum-A', a],
    ['checksum-C', c],
  ] as const) {
    assert.equal(
      visibleShare(exercise, restored.lessons[id]),
      exercise.output.slice(0, 35) + '?'.repeat(13),
    );
    // Even copying the supplied bottom row is now an explicit book step.
    assert.equal(restored.lessons[id].answers.length, 0);
  }
  const next = normalizeWorkshopFlow(
    workshopFlow(restored.flow, {
      type: 'navigate',
      phase: 'recover',
      reveal: true,
    }),
    false,
  );
  assert.equal(next.phase, 'checksum');
  assert.equal(next.checksumIndex, 'A');
  assert.equal(next.focus, 'stage');
  assert.deepEqual(next.checksums, restored.flow.checksums);
  assert.deepEqual(restored.initial, saved.books.fresh.initial);
});

await test('reviewing generated shares preserves checksum work and resumes the unfinished share', () => {
  const book = finishInitial(sourceBook(), 'A');
  book.lessons['checksum-C'] = {
    ...prepareLesson(c, emptyLesson()),
    draft: c.steps[1].answer.slice(0, 3),
    primary: 'F',
  };
  book.flow = workshopFlow(book.flow, { type: 'navigate', phase: 'random' });
  const saved = emptyWorkbooks();
  saved.books.fresh = book;
  const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh;
  assert.equal(restored.flow.phase, 'random');
  assert.deepEqual(restored.initial, book.initial);
  assert.deepEqual(restored.lessons['checksum-A'], book.lessons['checksum-A']);
  assert.equal(
    restored.lessons['checksum-C'].draft,
    book.lessons['checksum-C'].draft,
  );
  assert.equal(restored.lessons['checksum-C'].primary, 'F');
  const resumed = normalizeWorkshopFlow(
    workshopFlow(restored.flow, {
      type: 'navigate',
      phase: 'recover',
      reveal: true,
    }),
    false,
  );
  assert.equal(resumed.phase, 'checksum');
  assert.equal(resumed.checksumIndex, 'C');
  assert.equal(resumed.computerVerified.A, true);
});

await test('whole-section autocomplete can finish the remaining work while reviewing an earlier paper row', () => {
  for (const exercise of [
    a,
    derive,
    checksumExercise(engine, session.shares.A, true),
  ]) {
    const accepted = exercise.steps.slice(0, 4).map((step) => step.answer);
    const progress = {
      ...emptyLesson(),
      answers: accepted,
      cursor: 1,
      draft: accepted[1],
    };
    const result = autoExercise(
      exercise,
      visitLesson(exercise, progress, progress.answers.length),
    );
    assert.equal(result.complete, true);
    assert.deepEqual(result.progress.answers.slice(0, 4), accepted);
    assert.equal(visibleShare(exercise, result.progress), exercise.output);
    assert.equal(progress.cursor, 1);
    assert.equal(progress.answers.length, 4);
  }
});

await test('completed shares remain on their own section until explicitly continued, including after refresh', () => {
  let book = sourceBook();
  for (const [index, exercise, id, phase] of [
    ['A', a, 'checksum-A', 'checksum'],
    ['C', c, 'checksum-C', 'checksum'],
    ['D', derive, 'derive', 'derive'],
  ] as const) {
    book = {
      ...book,
      lessons: {
        ...book.lessons,
        [id]: autoExercise(exercise, emptyLesson()).progress,
      },
      flow: {
        ...book.flow,
        phase,
        checksumIndex: index === 'C' ? 'C' : 'A',
        checksums: {
          ...book.flow.checksums,
          ...(index === 'D' ? {} : { [index]: true }),
        },
      },
    };
    const checked = computerCheck(engine, book, index, false);
    assert.equal(checked.flow.phase, phase);
    assert.equal(checked.flow.checksumIndex, book.flow.checksumIndex);
    assert.equal(checked.flow.computerVerified[index], true);
    const saved = emptyWorkbooks();
    saved.books.fresh = checked;
    book = restoreWorkbooks(engine, JSON.stringify(saved)).books.fresh;
    assert.equal(book.flow.phase, phase);
    assert.equal(visibleShare(exercise, book.lessons[id]), exercise.output);
    const verification = checksumExercise(engine, session.shares[index], true);
    book.lessons['verify-' + index] = autoExercise(
      verification,
      emptyLesson(),
    ).progress;
    book.flow = workshopFlow(book.flow, {
      type: 'verification-completed',
      index,
    });
  }
  assert.equal(computerCheck(engine, book, 'D').flow.phase, 'recover');
});

await test('every section reveals only calculated output characters and makes measurable progress through its working rows', () => {
  for (const [exercise, target] of [
    [a, 'S'],
    [derive, 'D'],
    [recover, 'S'],
  ] as const) {
    let progress = prepareLesson(exercise, emptyLesson());
    let previous = 0,
      known = visibleShare(exercise, progress).replace(/\?/g, '').length;
    let revealed = 0,
      turns = 0;
    while (progress.answers.length < exercise.steps.length) {
      assert.ok(turns++ < 1500);
      const preview = tutorialCalculation(exercise, progress, target);
      if (preview.cursor === exercise.steps.length) {
        progress = preview;
        break;
      }
      const before = visibleShare(exercise, progress);
      const step = exercise.steps[preview.cursor];
      const result = autoNextEntry(exercise, preview);
      assert.equal(result.correct, true);
      progress = tutorialCalculation(exercise, result.progress, target);
      const visible = visibleShare(exercise, progress);
      assert.equal(visible.length, exercise.output.length);
      assert.ok(
        visible
          .split('')
          .every(
            (letter, i) => letter === '?' || letter === exercise.output[i],
          ),
      );
      const count = visible.replace(/\?/g, '').length;
      assert.ok(count >= known);
      if (count > known) revealed++;
      known = count;
      const readings = readingProgress(exercise, progress);
      assert.ok(
        readings.completed >= previous,
        'Copy and table steps do not count as wheel readings',
      );
      previous = readings.completed;
      if (!exercise.checksum && step.kind === 'translation') {
        assert.equal(
          visible,
          before,
          'Translation alone must not reveal final output',
        );
        const row = visibleTranslation(exercise, progress, preview.cursor)!;
        const written = exercise.steps.filter((entry) =>
          entry.id.endsWith(
            step.id.endsWith('-translate-0') ? '-translate-0' : '-translate-1',
          ),
        );
        assert.equal(row.value.length, written.length);
        assert.ok(
          row.value
            .split('')
            .every(
              (letter, i) => letter === '?' || letter === written[i].answer,
            ),
        );
        assert.ok(row.value.includes(step.answer));
      }
    }
    assert.ok(revealed > 1, 'Final share must fill incrementally');
    assert.equal(visibleShare(exercise, progress), exercise.output);
    const readings = readingProgress(exercise, progress);
    assert.equal(readings.completed, readings.total);
  }
});

await test('resetting a section keeps the exact key and every other worksheet while restoring its blanks and gates', () => {
  let book = finishInitial(finishInitial(sourceBook(), 'A'), 'C');
  book.lessons.derive = autoExercise(derive, emptyLesson()).progress;
  book = computerCheck(engine, book, 'D');
  const verification = checksumExercise(engine, session.shares.D, true);
  book.lessons['verify-D'] = autoExercise(verification, emptyLesson()).progress;
  book.flow = workshopFlow(book.flow, {
    type: 'verification-completed',
    index: 'D',
  });
  book.lessons['recover-C,D'] = autoExercise(recover, emptyLesson()).progress;
  for (const [id, exercise, phase] of [
    ['checksum-A', a, 'checksum'],
    ['checksum-C', c, 'checksum'],
    ['derive', derive, 'derive'],
    ['recover-C,D', recover, 'recover'],
  ] as const) {
    const reset = resetSection(book, id);
    assert.deepEqual(reset.initial, book.initial);
    assert.equal(reset.flow.phase, phase);
    assert.deepEqual(reset.lessons[id], emptyLesson());
    for (const [other, lesson] of Object.entries(book.lessons))
      if (other !== id) assert.deepEqual(reset.lessons[other], lesson);
    assert.ok(visibleShare(exercise, reset.lessons[id]).includes('?'));
    const saved = emptyWorkbooks();
    saved.books.fresh = reset;
    const restored = restoreWorkbooks(engine, JSON.stringify(saved)).books
      .fresh;
    assert.equal(restored.flow.phase, phase);
    assert.equal(restored.lessons[id].answers.length, 0);
    assert.deepEqual(restored.initial, book.initial);
    if (id.startsWith('checksum-'))
      assert.equal(
        normalizeWorkshopFlow({ ...reset.flow, phase: 'derive' }, true).phase,
        'checksum',
      );
    if (id === 'derive')
      assert.equal(
        normalizeWorkshopFlow({ ...reset.flow, phase: 'recover' }, false).phase,
        'derive',
      );
  }
  assert.equal(resetSection(book, 'invalid'), book);
});

await test('computer validation keeps fresh-copy verification required and preserves old saves', () => {
  let book = sourceBook();
  const paperDraft = { ...emptyLesson(), draft: 'MS12', primary: 'F' };
  book.lessons['verify-A'] = paperDraft;
  book.lessons['checksum-A'] = autoExercise(a, emptyLesson()).progress;
  book.flow = workshopFlow(book.flow, {
    type: 'checksum-completed',
    index: 'A',
  });
  book = computerCheck(engine, book, 'A', false);
  assert.equal(book.flow.phase, 'verify');
  assert.equal(book.flow.computerVerified.A, true);
  assert.equal(shareChecked(book.flow, 'A'), false);
  assert.deepEqual(book.lessons['verify-A'], paperDraft);
  assert.equal(
    normalizeWorkshopFlow({ ...book.flow, phase: 'derive' }, false).phase,
    'verify',
  );
  const save = emptyWorkbooks();
  save.books.fresh = { ...book, flow: { ...book.flow, phase: 'recover' } };
  const restored = restoreWorkbooks(engine, JSON.stringify(save)).books.fresh;
  assert.equal(restored.flow.phase, 'verify');
  assert.deepEqual(restored.lessons['verify-A'], paperDraft);
  assert.deepEqual(
    restored.lessons['checksum-A'].answers,
    book.lessons['checksum-A'].answers,
  );
  book = finishInitial(finishInitial(book, 'A'), 'C');
  assert.equal(book.flow.phase, 'derive');
  book.lessons.derive = autoExercise(derive, emptyLesson()).progress;
  book.flow = workshopFlow(book.flow, { type: 'derivation-completed' });
  book = computerCheck(engine, book, 'D', false);
  assert.equal(book.flow.phase, 'verify');
  assert.equal(book.flow.verifyIndex, 'D');
  assert.equal(shareChecked(book.flow, 'D'), false);
  const verification = checksumExercise(engine, session.shares.D, true);
  book.lessons['verify-D'] = autoExercise(verification, emptyLesson()).progress;
  book.flow = workshopFlow(book.flow, {
    type: 'verification-completed',
    index: 'D',
  });
  assert.equal(book.flow.phase, 'recover');
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
    assert.deepEqual(preview.answers, [], 'Rendering does not supply answers');
    assert.equal(preview.cursor, 0);
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
