import {
  normalizeAnswer,
  submitAnswer,
  type Exercise,
  type ExerciseStep,
  type LessonProgress,
} from './workbook.ts';

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
      : 'Build one character at a time';
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
