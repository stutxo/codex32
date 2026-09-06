import type { Engine } from './practice.ts';
import {
  alphabet,
  emptyDiceEntry,
  type DiceEntry,
  checksumWorksheet,
  sessionFromInitial,
  translationLesson,
  type Pair,
  type DiceResult,
  type WorkshopSession,
} from './workshop.ts';
import {
  normalizeWorkshopFlow,
  initialFlow,
  type Phase,
  type WorkshopFlow,
} from './workshop-flow.ts';

export type ExerciseStep = {
  id: string;
  title: string;
  instruction: string;
  kind: 'copy' | 'lookup' | 'shift' | 'addition' | 'translation' | 'recovery';
  answer: string;
  left?: string;
  right?: string;
  following?: string;
  key?: string;
  position?: number;
  direction?: 'down' | 'up';
};
export type Exercise = {
  title: string;
  steps: ExerciseStep[];
  output: string;
  checksum?: string;
  verification?: boolean;
};

export function checksumExercise(
  engine: Engine,
  encoded: string,
  verification = false,
): Exercise {
  const sheet = checksumWorksheet(engine, encoded, !verification);
  const steps: ExerciseStep[] = [
    {
      id: 'endpoint',
      title: 'Copy the given bottom row.',
      instruction:
        'Write SECRETSHARE32 in your answer. The book supplies this row so you can solve the missing checksum characters on the way back up.',
      kind: 'copy',
      answer: 'SECRETSHARE32',
      direction: 'down',
    },
    {
      id: 'prefill',
      title: 'Add the first two rows.',
      instruction:
        'Work on this share alone. In each highlighted column, turn the wheel to the top character, read the bottom character’s window, and write the result.',
      kind: 'addition',
      left: sheet.initialData,
      right: sheet.initialRow,
      answer: sheet.initialSum,
      direction: 'down',
    },
  ];
  if (verification)
    steps[0] = {
      id: 'verify-copy',
      title: 'Recopy share ' + encoded[8] + ' for verification.',
      instruction:
        'Start a fresh checksum worksheet. Copy the complete share below, including the 13 checksum characters you calculated. Spaces are optional.',
      kind: 'copy',
      left: encoded,
      answer: encoded,
      direction: 'down',
    };
  sheet.forward.forEach((row, i) => {
    const prefix = 'down-' + i;
    steps.push(
      {
        id: prefix + '-lookup',
        title: 'Look up the next table row.',
        instruction:
          'The first two characters of your working row choose an entry in the book’s checksum table. Find that entry, then copy its 13 characters.',
        kind: 'lookup',
        left: row.before,
        key: row.key,
        answer: row.lookup,
        direction: 'down',
      },
      {
        id: prefix + '-shift',
        title: 'Move the working row two places left.',
        instruction:
          'Remove its first two characters. Copy the remaining 11, then append the two incoming characters shown below. Keep ? wherever a character is still unknown.',
        kind: 'shift',
        left: row.before,
        following: row.following,
        answer: row.shifted,
        direction: 'down',
      },
      {
        id: prefix + '-add',
        title: 'Add your shifted row to the table row.',
        instruction:
          'Add one column at a time using the wheel. If either character is ?, write ? for that column; you will solve it on the way back up.',
        kind: 'addition',
        left: row.shifted,
        right: row.lookup,
        answer: row.after,
        direction: 'down',
      },
    );
  });
  sheet.backward.forEach((row, i) => {
    steps.push(
      {
        id: 'up-' + i + '-add',
        title:
          i === 0
            ? 'Start upward from SECRETSHARE32.'
            : 'Work upward through row ' + row.forwardStep + '.',
        instruction:
          'Add the solved row to the table row, column by column. Codex32 addition reverses itself, so this uncovers the shifted row from your downward calculation.',
        kind: 'addition',
        left: row.solved,
        right: row.lookup,
        answer: row.shifted,
        direction: 'up',
      },
      {
        id: 'up-' + i + '-copy',
        title: 'Record the two recovered characters.',
        instruction:
          'Copy the last two characters of the row you just calculated. They belong at positions ' +
          (row.offset + 4) +
          ' and ' +
          (row.offset + 5) +
          ' of the complete share. Some positions confirm characters you already knew.',
        kind: 'copy',
        left: row.shifted,
        answer: row.pair,
        position: row.offset + 4,
        direction: 'up',
      },
      {
        id: 'up-' + i + '-shift',
        title: 'Put the row back in place.',
        instruction:
          'Keep the first 11 characters of the row below. Put the two saved lookup characters at the front to rebuild the working row above. This becomes your solved row for the next upward step.',
        kind: 'shift',
        left: row.shifted,
        following: sheet.forward[row.forwardStep - 1].key,
        answer: row.before,
        direction: 'up',
      },
    );
  });
  return {
    title:
      'Share ' +
      encoded[8] +
      (verification ? ' · verify checksum' : ' · checksum'),
    verification,
    steps,
    output: sheet.output,
    checksum: sheet.checksum,
  };
}

export function shareExercise(
  engine: Engine,
  session: WorkshopSession,
  pair: Pair,
  target: 'D' | 'S',
): Exercise {
  const lesson = translationLesson(engine, session, pair, target);
  const steps: ExerciseStep[] = pair.map((index, i) => ({
    id: 'factor-' + index,
    title: 'Find the factor for share ' + index + '.',
    instruction:
      target === 'D'
        ? 'Use the derivation table: read the factor for share ' +
          index +
          ' in column D, for two initial shares (k = 2). Enter its alphabet equivalent.'
        : 'Point the recovery wheel handle at ' +
          index +
          ', then read the symbol at ' +
          pair[1 - i] +
          '. Enter the alphabet character shown beside that symbol.',
    kind: 'recovery',
    left: index,
    right: pair[1 - i],
    answer: lesson.weights[i],
  }));
  lesson.columns.forEach((column, i) => {
    for (const row of [0, 1]) {
      steps.push({
        id: 'column-' + i + '-translate-' + row,
        title:
          'Translate share ' +
          pair[row] +
          ' at position ' +
          column.position +
          '.',
        instruction:
          'Set the translation factor you found for ' +
          pair[row] +
          '. Set its symbol in the handle window on the fusion side, then turn over to the translation side. Read the outer character at the arrow beside the given inner character. Keep this factor for the entire row.',
        kind: 'translation',
        left: lesson.weights[row],
        right: column.inputs[row],
        answer: column.translated[row],
        position: column.position,
      });
    }
    steps.push({
      id: 'column-' + i + '-add',
      title: 'Write position ' + column.position + ' of ' + target + '.',
      instruction:
        'Add your two translated characters using the addition wheel. Write the result in the next cell of ' +
        (target === 'S' ? 'the secret.' : 'share D.'),
      kind: 'addition',
      left: column.translated[0],
      right: column.translated[1],
      answer: column.result,
      position: column.position,
    });
  });
  // The paper worksheet translates one complete row at a fixed setting,
  // then the other row, and only then adds the translated rows.
  const ordered = [
    ...steps.slice(0, 2),
    ...steps.filter((step) => step.id.endsWith('-translate-0')),
    ...steps.filter((step) => step.id.endsWith('-translate-1')),
    ...steps.filter((step) => step.kind === 'addition'),
  ];
  return {
    title: pair.join(' + ') + ' → ' + target,
    steps: ordered,
    output: lesson.output,
  };
}

export type WheelProgress = {
  factorSide: boolean;
  column: number;
  primary: string;
  other: string;
  tableFirst: string;
  tableSecond: string;
  tableOpen: boolean;
};
const emptyWheel = (): WheelProgress => ({
  factorSide: true,
  column: 0,
  primary: 'Q',
  other: 'Q',
  tableFirst: 'Q',
  tableSecond: 'Q',
  tableOpen: false,
});
export type ParkedStep = { draft?: string; wheel?: WheelProgress };
export type LessonProgress = WheelProgress & {
  deferredAnswers: Record<string, string>;
  parked: Record<string, ParkedStep>;
  answers: string[];
  draft: string;
  cursor: number;
  exampleCursor: number;
  exampleWheel: WheelProgress;
};
export const emptyLesson = (): LessonProgress => ({
  deferredAnswers: {},
  parked: {},
  ...emptyWheel(),
  answers: [],
  draft: '',
  cursor: 0,
  exampleCursor: 0,
  exampleWheel: emptyWheel(),
});

// Keep the legacy endpoint slot so saved calculation indices remain stable.
// It is a supplied row, not a learner answer or an entry shown in the UI.
export function prepareLesson(
  exercise: Exercise,
  progress: LessonProgress = emptyLesson(),
): LessonProgress {
  if (exercise.steps[0]?.id !== 'endpoint') return progress;
  const prepared =
    progress.answers.length === 0
      ? submitAnswer(exercise, {
          ...progress,
          cursor: 0,
          draft: 'SECRETSHARE32',
        }).progress
      : progress;
  return prepared.cursor === 0 ? { ...prepared, cursor: 1 } : prepared;
}
export function editLesson(
  progress: LessonProgress,
  change: Partial<LessonProgress>,
  example: boolean,
): LessonProgress {
  if (!example) return { ...progress, ...change };
  const view = { ...progress.exampleWheel };
  for (const name of [
    'factorSide',
    'column',
    'primary',
    'other',
    'tableFirst',
    'tableSecond',
    'tableOpen',
  ] as const) {
    if (change[name] !== undefined)
      Object.assign(view, { [name]: change[name] });
  }
  return {
    ...progress,
    exampleWheel: view,
    exampleCursor: change.exampleCursor ?? progress.exampleCursor,
  };
}
export function normalizeAnswer(value: string): string {
  return value.replace(/[ \t\r\n]/g, '').toUpperCase();
}
export function submitAnswer(exercise: Exercise, progress: LessonProgress) {
  const step = exercise.steps[progress.answers.length];
  if (
    !step ||
    progress.cursor !== progress.answers.length ||
    !progress.answers.every((answer, i) => answer === exercise.steps[i]?.answer)
  ) {
    return { correct: false, progress, complete: !step };
  }
  const answer = normalizeAnswer(progress.draft);
  if (answer !== step.answer) {
    return { correct: false, progress, complete: false };
  }
  const answers = [...progress.answers, answer];
  const deferredAnswers = { ...progress.deferredAnswers };
  while (answers.length < exercise.steps.length) {
    const next = exercise.steps[answers.length];
    if (deferredAnswers[next.id] !== next.answer) break;
    answers.push(next.answer);
    delete deferredAnswers[next.id];
  }
  const next = exercise.steps[answers.length];
  const nextProgress: LessonProgress = {
    ...emptyLesson(),
    answers,
    deferredAnswers,
    parked: { ...progress.parked },
    cursor: answers.length,
    factorSide:
      next?.kind === 'translation' &&
      step.kind === 'translation' &&
      next.left === step.left
        ? progress.factorSide
        : true,
    primary:
      next?.kind === 'translation' &&
      step.kind === 'translation' &&
      next.left === step.left
        ? progress.primary
        : 'Q',
    exampleCursor: progress.exampleCursor,
    exampleWheel: progress.exampleWheel,
  };
  return {
    correct: true,
    complete: answers.length === exercise.steps.length,
    progress: visitLesson(exercise, nextProgress, answers.length),
  };
}

// Previously entered work can move later when following the printed row order.
// Restore it when reached, without turning an unsubmitted draft into credit.
export function visitLesson(
  exercise: Exercise,
  progress: LessonProgress,
  cursor: number,
): LessonProgress {
  const step = exercise.steps[cursor];
  const parked = { ...progress.parked };
  const saved = step ? parked[step.id] : undefined;
  const current = cursor === progress.answers.length;
  if (step && saved) {
    if (current || saved.draft === undefined) delete parked[step.id];
    else parked[step.id] = { draft: saved.draft };
  }
  return {
    ...progress,
    ...saved?.wheel,
    parked,
    cursor,
    draft: current && saved?.draft !== undefined ? saved.draft : progress.draft,
  };
}

export type Book = {
  initial: [string, string] | null;
  draft: string;
  dice: DiceResult | null;
  diceEntry: DiceEntry;
  flow: WorkshopFlow;
  pair: 'A,C' | 'A,D' | 'C,D';
  example: boolean;
  examplePhase: Phase;
  exampleChecksumIndex: 'A' | 'C';
  exampleVerifyIndex: 'A' | 'C' | 'D';
  examplePair: 'A,C' | 'A,D' | 'C,D';
  lessons: Record<string, LessonProgress>;
};
export const emptyBook = (): Book => ({
  initial: null,
  draft: '',
  dice: null,
  diceEntry: emptyDiceEntry(),
  flow: {
    ...initialFlow,
    checksums: { A: false, C: false },
    verified: { A: false, C: false, D: false },
  },
  pair: 'C,D',
  example: false,
  examplePhase: 'checksum',
  exampleChecksumIndex: 'A',
  exampleVerifyIndex: 'A',
  examplePair: 'C,D',
  lessons: {},
});
export function showExample(book: Book, visible: boolean): Book {
  return {
    ...book,
    example: visible,
    examplePhase: visible ? book.flow.phase : book.examplePhase,
    exampleVerifyIndex: visible
      ? book.flow.verifyIndex
      : book.exampleVerifyIndex,
    exampleChecksumIndex: visible
      ? book.flow.checksumIndex
      : book.exampleChecksumIndex,
    examplePair: visible ? book.pair : book.examplePair,
    lessons: visible
      ? Object.fromEntries(
          Object.entries(book.lessons).map(([id, lesson]) => [
            id,
            {
              ...lesson,
              exampleCursor: lesson.cursor,
              exampleWheel: {
                factorSide: lesson.factorSide,
                column: lesson.column,
                primary: lesson.primary,
                other: lesson.other,
                tableFirst: lesson.tableFirst,
                tableSecond: lesson.tableSecond,
                tableOpen: lesson.tableOpen,
              },
            },
          ]),
        )
      : book.lessons,
  };
}
export const STORAGE_KEY = 'codex32.practice-workbooks.v1';
export type WorkbookSave = {
  version: 2;
  active: 'fresh' | 'published';
  books: { fresh: Book; published: Book };
};
export const emptyWorkbooks = (): WorkbookSave => ({
  version: 2,
  active: 'fresh',
  books: { fresh: emptyBook(), published: emptyBook() },
});
const phases: Phase[] = [
  'random',
  'checksum',
  'verify',
  'derive',
  'recover',
  'workbench',
];
const pairs = ['A,C', 'A,D', 'C,D'] as const;
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const object = (value: unknown): Record<string, unknown> =>
  isObject(value) ? (value as Record<string, unknown>) : {};
const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.slice(0, max) : '';
const integer = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isInteger(value)
    ? Math.max(0, Math.min(max, value))
    : 0;
const character = (value: unknown) =>
  typeof value === 'string' && value.length === 1 && alphabet.includes(value)
    ? value
    : 'Q';
function restoreWheel(value: unknown): WheelProgress {
  const raw = object(value);
  return {
    factorSide: raw.factorSide !== false,
    column: integer(raw.column, 12),
    primary: character(raw.primary),
    other: character(raw.other),
    tableFirst: character(raw.tableFirst),
    tableSecond: character(raw.tableSecond),
    tableOpen: raw.tableOpen === true,
  };
}
function restoreDice(value: unknown): DiceResult | null {
  const raw = object(value);
  if (!Array.isArray(raw.dice) || raw.dice.length !== 5) return null;
  const dice = raw.dice.map((value) => {
    const row = object(value);
    const first = row.first,
      second = row.second;
    if (
      typeof first !== 'number' ||
      typeof second !== 'number' ||
      !Number.isInteger(first) ||
      !Number.isInteger(second) ||
      first < 1 ||
      first > 6 ||
      second < 1 ||
      second > 6 ||
      first === second
    )
      throw new Error('Invalid saved dice.');
    return {
      first,
      second,
      bit: second > first ? 1 : 0,
      ties: integer(row.ties, 100_000),
    };
  });
  const bits = dice.map((row) => row.bit).join('');
  return { dice, bits, character: alphabet[parseInt(bits, 2)] };
}

export function restoreLesson(
  exercise: Exercise,
  value: unknown,
): LessonProgress {
  const raw = object(value);
  const submitted = Array.isArray(raw.answers) ? raw.answers : [];
  const answers: string[] = [];
  for (let i = 0; i < Math.min(submitted.length, exercise.steps.length); i++) {
    if (
      typeof submitted[i] !== 'string' ||
      submitted[i] !== exercise.steps[i].answer
    )
      break;
    answers.push(submitted[i]);
  }
  const deferredAnswers: Record<string, string> = {};
  const parked: Record<string, ParkedStep> = {};
  for (const step of exercise.steps) {
    if (object(raw.deferredAnswers)[step.id] === step.answer)
      deferredAnswers[step.id] = step.answer;
    const entry = object(object(raw.parked)[step.id]);
    if (entry.draft !== undefined || entry.wheel !== undefined)
      parked[step.id] = {
        ...(entry.draft !== undefined ? { draft: text(entry.draft, 64) } : {}),
        ...(entry.wheel !== undefined
          ? { wheel: restoreWheel(entry.wheel) }
          : {}),
      };
  }
  return {
    deferredAnswers,
    parked,
    ...restoreWheel(raw),
    exampleWheel: restoreWheel(raw.exampleWheel),
    answers,
    draft:
      answers.length < submitted.length
        ? text(submitted[answers.length], 64)
        : text(raw.draft, 64),
    cursor: integer(raw.cursor, answers.length),
    exampleCursor: integer(raw.exampleCursor, exercise.steps.length - 1),
  };
}

export function migrateLegacyLesson(
  exercise: Exercise,
  value: unknown,
): LessonProgress {
  if (!exercise.steps.some((step) => step.id.startsWith('factor-')))
    return restoreLesson(exercise, value);
  const byId = new Map(exercise.steps.map((step) => [step.id, step]));
  const oldSteps = exercise.steps.slice(0, 2);
  for (let i = 0; i < 45; i++) {
    for (const suffix of ['translate-0', 'translate-1', 'add'])
      oldSteps.push(byId.get('column-' + i + '-' + suffix)!);
  }
  const old = restoreLesson({ ...exercise, steps: oldSteps }, value);
  const accepted = Object.fromEntries(
    old.answers.map((answer, i) => [oldSteps[i].id, answer]),
  );
  const result = emptyLesson();
  for (const step of exercise.steps) {
    if (accepted[step.id] !== step.answer) break;
    result.answers.push(step.answer);
    delete accepted[step.id];
  }
  result.deferredAnswers = accepted;
  const raw = object(value);
  if (Array.isArray(raw.answers) && old.answers.length < raw.answers.length) {
    const later = oldSteps[raw.answers.length];
    if (later) result.parked[later.id] = { draft: text(raw.draft, 64) };
  }
  const unfinished = oldSteps[old.answers.length];
  const viewed = oldSteps[old.cursor];
  if (unfinished) result.parked[unfinished.id] = { draft: old.draft };
  if (viewed)
    result.parked[viewed.id] = {
      ...result.parked[viewed.id],
      wheel: restoreWheel(old),
    };
  result.exampleCursor = Math.max(
    0,
    exercise.steps.findIndex(
      (step) => step.id === oldSteps[old.exampleCursor]?.id,
    ),
  );
  result.exampleWheel = old.exampleWheel;
  const mappedCursor = exercise.steps.findIndex(
    (step) => step.id === viewed?.id,
  );
  result.cursor =
    mappedCursor >= 0 && mappedCursor < result.answers.length
      ? mappedCursor
      : result.answers.length;
  // Keep the unfinished draft in progress even if the learner was reviewing.
  const next = visitLesson(exercise, result, result.answers.length);
  return visitLesson(exercise, next, result.cursor);
}

export function restoreWorkbooks(engine: Engine, source: string): WorkbookSave {
  if (source.length > 200_000) throw new Error('Saved workbook is too large.');
  const raw = object(JSON.parse(source));
  if (raw.version !== 1 && raw.version !== 2)
    throw new Error('Unsupported saved workbook version.');
  if (
    !isObject(raw.books) ||
    !isObject(raw.books.fresh) ||
    !isObject(raw.books.published) ||
    !['fresh', 'published'].includes(String(raw.active))
  ) {
    throw new Error('Invalid saved workbook structure.');
  }
  const result = emptyWorkbooks();
  result.active = raw.active === 'published' ? 'published' : 'fresh';
  for (const kind of ['fresh', 'published'] as const) {
    const saved = object(object(raw.books)[kind]);
    if (
      (saved.flow !== undefined && !isObject(saved.flow)) ||
      (saved.lessons !== undefined &&
        (!isObject(saved.lessons) ||
          Object.values(saved.lessons).some((lesson) => !isObject(lesson))))
    ) {
      throw new Error('Invalid saved worksheet structure.');
    }
    const book = emptyBook();
    const draft = text(saved.draft, 53);
    if (!new RegExp('^[' + alphabet + ']{0,52}$').test(draft)) {
      throw new Error('Invalid saved dice draft.');
    }
    book.draft = draft;
    book.dice = restoreDice(saved.dice);
    const diceEntry = object(saved.diceEntry);
    book.diceEntry = {
      bits: Array.from({ length: 5 }, (_, i) => {
        const value = Array.isArray(diceEntry.bits) ? diceEntry.bits[i] : '';
        return value === '0' || value === '1' ? value : '';
      }),
      character:
        typeof diceEntry.character === 'string' &&
        alphabet.includes(diceEntry.character) &&
        diceEntry.character.length === 1
          ? diceEntry.character
          : '',
      recorded: Boolean(book.dice) && diceEntry.recorded === true,
    };
    if (book.dice && saved.diceEntry === undefined)
      book.diceEntry = {
        bits: book.dice.bits.split(''),
        character: book.dice.character,
        recorded: true,
      };
    if (
      book.dice &&
      book.diceEntry.recorded &&
      (book.diceEntry.bits.join('') !== book.dice.bits ||
        book.diceEntry.character !== book.dice.character ||
        book.draft.at(-1) !== book.dice.character)
    )
      throw new Error('Invalid saved recorded dice.');
    book.example = saved.example === true;
    book.examplePhase = phases.includes(saved.examplePhase as Phase)
      ? (saved.examplePhase as Phase)
      : 'checksum';
    book.pair = pairs.includes(saved.pair as (typeof pairs)[number])
      ? (saved.pair as (typeof pairs)[number])
      : 'C,D';
    book.examplePair = pairs.includes(
      saved.examplePair as (typeof pairs)[number],
    )
      ? (saved.examplePair as (typeof pairs)[number])
      : book.pair;
    book.exampleChecksumIndex = saved.exampleChecksumIndex === 'C' ? 'C' : 'A';
    book.exampleVerifyIndex =
      saved.exampleVerifyIndex === 'D'
        ? 'D'
        : saved.exampleVerifyIndex === 'C'
          ? 'C'
          : 'A';
    const savedFlow = object(saved.flow);
    book.flow.phase = phases.includes(savedFlow.phase as Phase)
      ? (savedFlow.phase as Phase)
      : 'random';
    book.flow.checksumIndex = savedFlow.checksumIndex === 'C' ? 'C' : 'A';
    book.flow.verifyIndex =
      savedFlow.verifyIndex === 'D'
        ? 'D'
        : savedFlow.verifyIndex === 'C'
          ? 'C'
          : 'A';
    if (saved.initial !== null && saved.initial !== undefined) {
      if (
        !Array.isArray(saved.initial) ||
        saved.initial.length !== 2 ||
        !saved.initial.every(
          (item) => typeof item === 'string' && item.length === 48,
        )
      ) {
        throw new Error('Invalid saved initial shares.');
      }
      const initial = saved.initial as [string, string];
      if (initial[0][8] !== 'A' || initial[1][8] !== 'C') {
        throw new Error('Saved initial share indices do not match.');
      }
      const session = sessionFromInitial(engine, initial, kind);
      // Also validates the fixed 128-bit worksheet format and both checksums.
      const exercises: Record<string, Exercise> = {
        'checksum-A': checksumExercise(engine, session.shares.A),
        'checksum-C': checksumExercise(engine, session.shares.C),
        'verify-A': checksumExercise(engine, session.shares.A, true),
        'verify-C': checksumExercise(engine, session.shares.C, true),
        'verify-D': checksumExercise(engine, session.shares.D, true),
        derive: shareExercise(engine, session, ['A', 'C'], 'D'),
      };
      for (const pair of pairs) {
        exercises['recover-' + pair] = shareExercise(
          engine,
          session,
          pair.split(',') as Pair,
          'S',
        );
      }
      book.initial = [session.shares.A, session.shares.C];
      for (const [id, exercise] of Object.entries(exercises)) {
        book.lessons[id] = prepareLesson(
          exercise,
          (raw.version === 1 ? migrateLegacyLesson : restoreLesson)(
            exercise,
            object(saved.lessons)[id],
          ),
        );
      }
      for (const index of ['A', 'C'] as const) {
        const id = 'checksum-' + index;
        book.flow.checksums[index] =
          book.lessons[id].answers.length === exercises[id].steps.length;
      }
      for (const index of ['A', 'C', 'D'] as const) {
        const id = 'verify-' + index;
        book.flow.verified[index] =
          book.lessons[id].answers.length === exercises[id].steps.length;
      }
      const derived =
        book.lessons.derive.answers.length === exercises.derive.steps.length;
      book.flow = normalizeWorkshopFlow(book.flow, derived);
    } else {
      book.flow.phase =
        book.flow.phase === 'workbench' ? 'workbench' : 'random';
      book.examplePhase = 'random';
    }
    result.books[kind] = book;
  }
  return result;
}

export type WorkbookStorage = Pick<
  Storage,
  'getItem' | 'setItem' | 'removeItem'
>;
export function readWorkbooks(engine: Engine, storage: WorkbookStorage) {
  const saved = storage.getItem(STORAGE_KEY);
  return saved === null ? emptyWorkbooks() : restoreWorkbooks(engine, saved);
}
export function saveWorkbooks(
  storage: WorkbookStorage,
  workbooks: WorkbookSave,
) {
  storage.setItem(STORAGE_KEY, JSON.stringify(workbooks));
}
