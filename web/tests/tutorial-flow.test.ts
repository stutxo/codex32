import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import * as engine from '../lib/wasm/codex32_wasm.js';
import { publishedSession } from '../lib/workshop.ts';
import {
  autoExercise,
  autoNextEntry,
  tutorialCalculation,
  visibleShare,
  visibleTranslation,
  readingProgress,
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
      assert.ok(readings.completed > previous);
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
    assert.equal(
      restored.lessons[id].answers.length,
      id.startsWith('checksum-') ? 1 : 0,
    );
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
