import {
  editLesson,
  prepareLesson,
  visitLesson,
  normalizeAnswer,
  submitAnswer,
  type Exercise,
  type ExerciseStep,
  type LessonProgress,
} from './workbook.ts';
import type { Engine } from './practice.ts';
import {
  add,
  alphabet,
  multiply,
  recoveryOrder,
  recoveryReadout,
} from './workshop.ts';

// Both the artwork and the controls use this gate. Choosing a setting never
// writes an answer or earns worksheet credit, including in the worked example.
export function selectOperand(
  exercise: Exercise,
  progress: LessonProgress,
  part: 'primary' | 'other',
  value: string,
  example = false,
) {
  const start = 0;
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
export function autoNextEntry(
  exercise: Exercise,
  progress: LessonProgress,
  stopBefore = exercise.steps.length,
) {
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
  const result = checkColumn(exercise, filled, stopBefore);
  if (!result.correct) return { ...result, progress: filled };
  return !wheelColumn && result.progress.cursor === progress.cursor
    ? { ...result, progress: { ...result.progress, column: 0 } }
    : result;
}

export function autoChecksum(exercise: Exercise, progress: LessonProgress) {
  if (!exercise.checksum) return { correct: false, complete: false, progress };
  return autoExercise(exercise, progress);
}

export function autoExercise(exercise: Exercise, progress: LessonProgress) {
  if (
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

// A stage is one paper operation: a checksum row, the two factor lookups,
// one complete translation row, or the final addition row. Stable answer IDs
// remain unchanged; setting/flipping an instrument earns no answer credit.
export function workbookStage(exercise: Exercise, cursor: number) {
  const step = exercise.steps[cursor];
  if (!step) return null;
  const keyFor = (entry: ExerciseStep) =>
    exercise.checksum
      ? entry.id
      : entry.kind === 'translation'
        ? 'translate-' + (entry.id.endsWith('-0') ? '0' : '1')
        : entry.kind;
  const key = keyFor(step);
  let start = cursor,
    end = cursor + 1;
  while (start > 0 && keyFor(exercise.steps[start - 1]) === key) start--;
  while (end < exercise.steps.length && keyFor(exercise.steps[end]) === key)
    end++;
  const tool =
    step.kind === 'recovery'
      ? exercise.output[8] === 'D'
        ? 'Derivation table'
        : 'Recovery wheel'
      : step.kind === 'translation'
        ? 'Fusion side → Translation side'
        : step.kind === 'addition'
          ? 'Addition wheel'
          : step.kind === 'lookup'
            ? 'Checksum table'
            : 'Paper worksheet';
  return {
    key,
    start,
    end,
    tool,
    title: exercise.checksum
      ? step.title
      : step.kind === 'recovery'
        ? 'Find both factors'
        : step.kind === 'translation'
          ? 'Translate share ' +
            exercise.steps[step.id.endsWith('-0') ? 0 : 1].left
          : 'Add the two translated rows',
  };
}

// Merely viewing the guide must never fill copies, table lookups or unknowns.
export function tutorialCalculation(
  exercise: Exercise,
  progress: LessonProgress,
  _target: 'D' | 'S',
) {
  return visitLesson(exercise, progress, progress.answers.length);
}

export function instrumentHandoff(
  exercise: Exercise,
  progress: LessonProgress,
) {
  const cursor = progress.answers.length;
  const next = exercise.steps[cursor],
    previous = exercise.steps[cursor - 1];
  if (!next || !previous || progress.tutorialStage === next.id) return null;
  if (
    workbookStage(exercise, cursor - 1)?.key !==
    workbookStage(exercise, cursor)?.key
  )
    return { previous, next, cursor };
  return null;
}

export function openNextStage(exercise: Exercise, progress: LessonProgress) {
  const handoff = instrumentHandoff(exercise, progress);
  if (!handoff) return progress;
  return {
    ...progress,
    tutorialStage: handoff.next.id,
    primary: 'Q',
    other: 'Q',
    factorSide: true,
    column: 0,
    tableOpen: false,
  };
}

function stageReady(exercise: Exercise, progress: LessonProgress) {
  const step = exercise.steps[progress.cursor];
  return Boolean(
    step &&
    progress.cursor === progress.answers.length &&
    !instrumentHandoff(exercise, progress) &&
    !(step.kind === 'translation' && progress.factorSide) &&
    progress.answers.every((answer, i) => answer === exercise.steps[i]?.answer),
  );
}

// Unlike the internal fixture utility autoExercise, this shortcut cannot cross
// a stage boundary, even when legacy saves contain already-checked later work.
export function autoStage(exercise: Exercise, progress: LessonProgress) {
  if (!stageReady(exercise, progress))
    return { correct: false, complete: false, progress };
  const stage = workbookStage(exercise, progress.cursor)!;
  let next = progress;
  while (next.cursor < stage.end) {
    const step = exercise.steps[next.cursor];
    const column = Math.max(0, (step.left?.length ?? 1) - 1);
    const filled = {
      ...next,
      draft: step.answer,
      primary: step.left?.[column] ?? next.primary,
      other: step.right?.[column] ?? next.other,
      ...(step.kind === 'lookup'
        ? {
            tableFirst: step.key![0],
            tableSecond: step.key![1],
            tableOpen: true,
          }
        : {}),
    };
    const result = submitAnswer(exercise, filled, stage.end);
    if (!result.correct) return { correct: false, complete: false, progress };
    next = advanceTutorialReading(exercise, filled, result).progress;
    const last = exercise.steps[next.cursor - 1];
    const lastColumn = Math.max(0, (last.left?.length ?? 1) - 1);
    next.primary = last.left?.[lastColumn] ?? next.primary;
    next.other = last.right?.[lastColumn] ?? next.other;
    next.column = Math.max(0, (last.right?.length ?? 1) - 1);
  }
  return {
    correct: true,
    complete: next.answers.length === exercise.steps.length,
    progress: next,
  };
}

export function confirmTutorialRow(
  exercise: Exercise,
  progress: LessonProgress,
) {
  if (!stageReady(exercise, progress))
    return { correct: false, complete: false, progress };
  return advanceTutorialReading(
    exercise,
    progress,
    submitAnswer(
      exercise,
      progress,
      workbookStage(exercise, progress.cursor)!.end,
    ),
  );
}

export function finishTutorialReading(
  exercise: Exercise,
  progress: LessonProgress,
  _target: 'D' | 'S',
) {
  if (!stageReady(exercise, progress))
    return { correct: false, complete: false, progress };
  const result = autoNextEntry(exercise, progress, progress.cursor + 1);
  return advanceTutorialReading(exercise, progress, result);
}

// Confirm the live wheel, not an answer filled by the shortcut. Translation
// requires its reading face; merely setting the fusion side is not a reading.
export function confirmTutorialReading(
  engine: Engine,
  exercise: Exercise,
  progress: LessonProgress,
  target: 'D' | 'S',
) {
  const rejected = { correct: false, complete: false, progress };
  if (!stageReady(exercise, progress)) return rejected;
  const next = tutorialCalculation(exercise, progress, target);
  const step = exercise.steps[next.cursor];
  if (
    !step ||
    !['addition', 'translation', 'recovery'].includes(step.kind) ||
    (step.kind === 'recovery' && target === 'D')
  )
    return rejected;
  const column = Math.min(next.column, (step.right?.length ?? 1) - 1);
  const left = step.left?.[column],
    right = step.right?.[column];
  const primary =
    step.kind === 'translation' && progress.primary === 'Q'
      ? 'P'
      : progress.primary;
  if (
    !left ||
    !right ||
    !alphabet.includes(primary) ||
    !alphabet.includes(left) ||
    !alphabet.includes(right) ||
    primary !== left
  )
    return rejected;
  const reading =
    step.kind === 'recovery'
      ? recoveryReadout(recoveryOrder(engine, target), primary, right)
      : step.kind === 'addition'
        ? add(engine, primary, right)
        : multiply(engine, primary, right);
  if (reading === null || reading !== step.answer[column]) return rejected;
  const filled = {
    ...next,
    column,
    primary,
    other: right,
    factorSide: false,
    draft: writeColumn(next.draft, column, reading, step.answer.length),
  };
  const result = checkColumn(exercise, filled, progress.cursor + 1);
  if (!result.correct) return rejected;
  return advanceTutorialReading(exercise, filled, result);
}

function advanceTutorialReading(
  exercise: Exercise,
  progress: LessonProgress,
  result: ReturnType<typeof checkColumn>,
) {
  if (!result.correct) return result;
  const next = { ...result.progress };
  if (
    instrumentHandoff(exercise, next) ||
    next.answers.length === exercise.steps.length
  )
    next.column = progress.column;
  // Keep each physical instrument where it was turned until the next explicit
  // turn, including when translating the second row at a different factor.
  if (
    exercise.steps[progress.cursor]?.kind ===
      exercise.steps[next.cursor]?.kind ||
    instrumentHandoff(exercise, next) ||
    next.answers.length === exercise.steps.length
  )
    Object.assign(next, {
      primary: progress.primary,
      factorSide: progress.factorSide,
      tableFirst: progress.tableFirst,
      tableSecond: progress.tableSecond,
      tableOpen: progress.tableOpen,
    });
  return {
    correct: true,
    complete: next.answers.length === exercise.steps.length,
    progress: next,
  };
}

export function visibleShare(
  exercise: Exercise,
  progress: LessonProgress,
  example = false,
) {
  if (example || exercise.verification) return exercise.output;
  const characters = (
    exercise.checksum
      ? exercise.output.slice(0, 35) + '?'.repeat(13)
      : exercise.output.slice(0, 3) + '?'.repeat(exercise.output.length - 3)
  ).split('');
  exercise.steps.forEach((step, i) => {
    if (
      (exercise.checksum
        ? step.direction !== 'up' || step.kind !== 'copy'
        : step.kind !== 'addition') ||
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

// Count filled wheel readings, including matching entries in the current row.
// This display never grants answer credit. Supplied rows and previews do not count.
export function readingProgress(exercise: Exercise, progress: LessonProgress) {
  let completed = 0,
    total = 0;
  exercise.steps.forEach((step, i) => {
    if (!['addition', 'translation', 'recovery'].includes(step.kind)) return;
    step.answer.split('').forEach((letter, column) => {
      if (
        letter === '?' ||
        step.left?.[column] === '?' ||
        step.right?.[column] === '?'
      )
        return;
      total++;
      if (
        progress.answers[i] === step.answer ||
        (i === progress.cursor &&
          i === progress.answers.length &&
          normalizeAnswer(progress.draft)[column] === letter)
      )
        completed++;
    });
  });
  return { completed, total };
}

// Translation follows the paper: finish one row at a fixed factor before
// translating the second row and adding them. Show that work without exposing
// characters in the final share before their addition has been checked.
export function visibleTranslation(
  exercise: Exercise,
  progress: LessonProgress,
  cursor: number,
) {
  const step = exercise.steps[cursor];
  if (step?.kind !== 'translation') return null;
  const row = step.id.endsWith('-translate-0') ? '0' : '1';
  const steps = exercise.steps.filter((entry) =>
    entry.id.endsWith('-translate-' + row),
  );
  const value = steps
    .map((entry) => {
      const index = exercise.steps.indexOf(entry);
      return progress.answers[index] === entry.answer ? entry.answer : '?';
    })
    .join('');
  const source = exercise.steps[Number(row)].left!;
  return { source, factor: step.left!, value };
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
export function checkColumn(
  exercise: Exercise,
  progress: LessonProgress,
  stopBefore = exercise.steps.length,
) {
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
  if (row === step.answer) return submitAnswer(exercise, progress, stopBefore);
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
