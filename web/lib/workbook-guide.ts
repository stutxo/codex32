import {
  editLesson,
  prepareLesson,
  normalizeAnswer,
  submitAnswer,
  type Exercise,
  type ExerciseStep,
  type LessonProgress,
} from './workbook.ts';

// Both the artwork and the controls use this gate. Choosing a setting never
// writes an answer or earns worksheet credit, including in the worked example.
export function selectOperand(
  exercise: Exercise,
  progress: LessonProgress,
  part: 'primary' | 'other',
  value: string,
  example = false,
) {
  const start = exercise.steps[0]?.id === 'endpoint' ? 1 : 0;
  const at = example
    ? Math.max(
        start,
        Math.min(progress.exampleCursor, exercise.steps.length - 1),
      )
    : progress.cursor;
  const step = exercise.steps[at];
  if (!step || !['addition', 'translation', 'recovery'].includes(step.kind))
    return progress;
  const view = example ? progress.exampleWheel : progress;
  const column = Math.min(view.column, (step.left?.length ?? 1) - 1);
  const left = step.left?.[column];
  const right = step.right?.[column];
  if (!left || !right || left === '?' || right === '?') return progress;
  const primary =
    step.kind === 'translation' && view.primary === 'Q' ? 'P' : view.primary;
  if (value !== (part === 'primary' ? left : right)) return progress;
  if (
    part === 'other' &&
    (primary !== left || (step.kind === 'translation' && view.factorSide))
  )
    return progress;
  return editLesson(progress, { [part]: value }, example);
}

// Explicit shortcuts use the same answer validator as handwritten work.
export function autoNextEntry(exercise: Exercise, progress: LessonProgress) {
  const step = exercise.steps[progress.cursor];
  if (
    !step ||
    progress.cursor !== progress.answers.length ||
    !progress.answers.every((answer, i) => answer === exercise.steps[i]?.answer)
  )
    return { correct: false, complete: false, progress };
  const row = normalizeAnswer(progress.draft);
  const wheelColumn = step.kind === 'addition' && step.answer.length > 1;
  const column = wheelColumn
    ? Math.min(progress.column, step.answer.length - 1)
    : Math.max(
        0,
        step.answer.split('').findIndex((letter, i) => row[i] !== letter),
      );
  const filled = {
    ...progress,
    column,
    draft: writeColumn(
      progress.draft,
      column,
      step.answer[column],
      step.answer.length,
    ),
  };
  const result = checkColumn(exercise, filled);
  if (!result.correct) return { ...result, progress: filled };
  return !wheelColumn && result.progress.cursor === progress.cursor
    ? { ...result, progress: { ...result.progress, column: 0 } }
    : result;
}

export function autoChecksum(exercise: Exercise, progress: LessonProgress) {
  if (
    !exercise.checksum ||
    progress.cursor !== progress.answers.length ||
    !progress.answers.every((answer, i) => answer === exercise.steps[i]?.answer)
  )
    return { correct: false, complete: false, progress };
  let next = prepareLesson(exercise, progress);
  while (next.cursor < exercise.steps.length) {
    const result = submitAnswer(exercise, {
      ...next,
      draft: exercise.steps[next.cursor].answer,
    });
    if (!result.correct || result.progress.cursor <= next.cursor)
      return { correct: false, complete: false, progress };
    next = result.progress;
  }
  return { correct: true, complete: true, progress: next };
}

export function visibleShare(
  exercise: Exercise,
  progress: LessonProgress,
  example = false,
) {
  if (example || exercise.verification) return exercise.output;
  const characters = (exercise.output.slice(0, 35) + '?'.repeat(13)).split('');
  exercise.steps.forEach((step, i) => {
    if (
      step.direction !== 'up' ||
      step.kind !== 'copy' ||
      !step.position ||
      progress.answers[i] !== step.answer
    )
      return;
    step.answer.split('').forEach((letter, offset) => {
      characters[step.position! - 1 + offset] = letter;
    });
  });
  return characters.join('');
}

// A blank entry is distinct from the book's ?, which means an unknown value.
export const EMPTY_CELL = '·';
export const columnEntry = (draft: string, column: number) => {
  const character = normalizeAnswer(draft)[column];
  return !character || character === EMPTY_CELL ? '' : character;
};
export function writeColumn(
  draft: string,
  column: number,
  value: string,
  length: number,
) {
  if (!Number.isInteger(column) || column < 0 || column >= length) return draft;
  const row = normalizeAnswer(draft)
    .padEnd(column + 1, EMPTY_CELL)
    .split('');
  row[column] = normalizeAnswer(value).slice(-1) || EMPTY_CELL;
  return row.join('');
}
export function checkColumn(exercise: Exercise, progress: LessonProgress) {
  const step = exercise.steps[progress.cursor];
  if (
    !step ||
    progress.cursor !== progress.answers.length ||
    !progress.answers.every(
      (answer, i) => answer === exercise.steps[i]?.answer,
    ) ||
    progress.column < 0 ||
    progress.column >= step.answer.length ||
    columnEntry(progress.draft, progress.column) !==
      step.answer[progress.column]
  ) {
    return { correct: false, complete: false, progress };
  }
  const row = normalizeAnswer(progress.draft);
  // The existing whole-row verifier remains the only source of step credit.
  if (row === step.answer) return submitAnswer(exercise, progress);
  const next = Array.from(
    { length: step.answer.length },
    (_, i) => (progress.column + i + 1) % step.answer.length,
  ).find((column) => row[column] !== step.answer[column]);
  if (next === undefined) return { correct: false, complete: false, progress };
  return {
    correct: true,
    complete: false,
    progress: { ...progress, column: next },
  };
}

export function isUnknownRow(step: ExerciseStep) {
  return (
    step.direction === 'down' &&
    (step.kind === 'addition' || step.kind === 'shift') &&
    /^\?{13}$/.test(step.answer)
  );
}

// Pink squares are left blank on paper. Record their digital placeholders only
// after the learner explicitly chooses to continue; never fill calculable cells.
export function keepUnknown(exercise: Exercise, progress: LessonProgress) {
  const step = exercise.steps[progress.cursor];
  if (step && isUnknownRow(step)) {
    return submitAnswer(exercise, { ...progress, draft: '?'.repeat(13) });
  }
  if (
    !step ||
    step.direction !== 'down' ||
    step.kind !== 'addition' ||
    (step.left?.[progress.column] !== '?' &&
      step.right?.[progress.column] !== '?')
  ) {
    return { correct: false, complete: false, progress };
  }
  return checkColumn(exercise, {
    ...progress,
    draft: writeColumn(
      progress.draft,
      progress.column,
      '?',
      step.answer.length,
    ),
  });
}

export function stepGuide(
  step: ExerciseStep,
  checksum: boolean,
  target: 'D' | 'S' = 'S',
) {
  const upward = step.direction === 'up';
  const phase = checksum
    ? upward
      ? 'Solve upward'
      : step.id.startsWith('down-')
        ? 'Work downward'
        : 'Prepare the worksheet'
    : step.kind === 'recovery'
      ? 'Find your two factors'
      : step.kind === 'translation'
        ? step.id.endsWith('-translate-0')
          ? 'Translate the first complete share'
          : 'Translate the second complete share'
        : 'Add the two translated rows';
  const round = step.id.match(/^(down|up)-(\d+)-/);
  const position = round
    ? 'Row ' +
      (round[1] === 'up' ? 16 - Number(round[2]) : Number(round[2]) + 1) +
      ' of 16'
    : step.position
      ? 'Position ' + step.position + ' of 48'
      : '';
  const top =
    step.id === 'prefill'
      ? 'Beginning of your share'
      : step.kind === 'translation'
        ? 'Factor you found'
        : step.kind === 'recovery'
          ? 'Share to translate'
          : upward
            ? 'Solved row'
            : 'Shifted row';
  const bottom =
    step.id === 'prefill'
      ? 'Fixed starting row from the book'
      : step.kind === 'translation'
        ? 'Character from the share'
        : step.kind === 'recovery'
          ? 'Other share'
          : checksum
            ? 'Row from the checksum table'
            : 'Second translated character';
  return {
    phase,
    position,
    top:
      !checksum && step.kind === 'addition'
        ? 'First translated character'
        : top,
    bottom,
    page: checksum
      ? step.kind === 'lookup'
        ? 22
        : 20
      : step.kind === 'recovery'
        ? target === 'D'
          ? 16
          : 17
        : 25,
    printedPage: checksum
      ? step.kind === 'lookup'
        ? '15–16'
        : '13'
      : step.kind === 'recovery'
        ? target === 'D'
          ? '9'
          : '10'
        : '18',
  };
}
