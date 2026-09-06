import type { Engine } from './practice.ts';
import {
  alphabet,
  checksumWorksheet,
  sessionFromInitial,
  translationLesson,
  type Pair,
  type DiceResult,
  type WorkshopSession,
} from './workshop.ts';
import { initialFlow, type Phase, type WorkshopFlow } from './workshop-flow.ts';

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
};

export function checksumExercise(engine: Engine, encoded: string): Exercise {
  const sheet = checksumWorksheet(engine, encoded);
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
        title: 'Work upward through row ' + row.forwardStep + '.',
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
    title: 'Share ' + encoded[8] + ' · checksum',
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
      'Point the recovery wheel handle at ' +
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
          '. Read the outer character beside the given inner character and enter it below.',
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
  return {
    title: pair.join(' + ') + ' → ' + target,
    steps,
    output: lesson.output,
  };
}

export type WheelProgress = {
  column: number;
  primary: string;
  other: string;
  tableFirst: string;
  tableSecond: string;
  tableOpen: boolean;
};
const emptyWheel = (): WheelProgress => ({
  column: 0,
  primary: 'Q',
  other: 'Q',
  tableFirst: 'Q',
  tableSecond: 'Q',
  tableOpen: false,
});
export type LessonProgress = WheelProgress & {
  answers: string[];
  draft: string;
  cursor: number;
  exampleCursor: number;
  exampleWheel: WheelProgress;
};
export const emptyLesson = (): LessonProgress => ({
  ...emptyWheel(),
  answers: [],
  draft: '',
  cursor: 0,
  exampleCursor: 0,
  exampleWheel: emptyWheel(),
});
export function editLesson(
  progress: LessonProgress,
  change: Partial<LessonProgress>,
  example: boolean,
): LessonProgress {
  if (!example) return { ...progress, ...change };
  const view = { ...progress.exampleWheel };
  for (const name of [
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
  return {
    correct: true,
    complete: answers.length === exercise.steps.length,
    progress: {
      ...emptyLesson(),
      answers,
      cursor: answers.length,
      exampleCursor: progress.exampleCursor,
      exampleWheel: progress.exampleWheel,
    },
  };
}

export type Book = {
  initial: [string, string] | null;
  draft: string;
  dice: DiceResult | null;
  flow: WorkshopFlow;
  pair: 'A,C' | 'A,D' | 'C,D';
  example: boolean;
  examplePhase: Phase;
  exampleChecksumIndex: 'A' | 'C';
  examplePair: 'A,C' | 'A,D' | 'C,D';
  lessons: Record<string, LessonProgress>;
};
export const emptyBook = (): Book => ({
  initial: null,
  draft: '',
  dice: null,
  flow: { ...initialFlow, checksums: { A: false, C: false } },
  pair: 'C,D',
  example: false,
  examplePhase: 'checksum',
  exampleChecksumIndex: 'A',
  examplePair: 'C,D',
  lessons: {},
});
export function showExample(book: Book, visible: boolean): Book {
  return {
    ...book,
    example: visible,
    examplePhase: visible ? book.flow.phase : book.examplePhase,
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
  version: 1;
  active: 'fresh' | 'published';
  books: { fresh: Book; published: Book };
};
export const emptyWorkbooks = (): WorkbookSave => ({
  version: 1,
  active: 'fresh',
  books: { fresh: emptyBook(), published: emptyBook() },
});
const phases: Phase[] = [
  'random',
  'checksum',
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
  return {
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

export function restoreWorkbooks(engine: Engine, source: string): WorkbookSave {
  if (source.length > 200_000) throw new Error('Saved workbook is too large.');
  const raw = object(JSON.parse(source));
  if (raw.version !== 1) throw new Error('Unsupported saved workbook version.');
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
    const savedFlow = object(saved.flow);
    book.flow.phase = phases.includes(savedFlow.phase as Phase)
      ? (savedFlow.phase as Phase)
      : 'random';
    book.flow.checksumIndex = savedFlow.checksumIndex === 'C' ? 'C' : 'A';
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
        book.lessons[id] = restoreLesson(exercise, object(saved.lessons)[id]);
      }
      for (const index of ['A', 'C'] as const) {
        const id = 'checksum-' + index;
        book.flow.checksums[index] =
          book.lessons[id].answers.length === exercises[id].steps.length;
      }
      const both = book.flow.checksums.A && book.flow.checksums.C;
      const derived =
        book.lessons.derive.answers.length === exercises.derive.steps.length;
      if (
        (book.flow.phase === 'derive' || book.flow.phase === 'recover') &&
        !both
      ) {
        book.flow.phase = 'checksum';
        book.flow.checksumIndex = book.flow.checksums.A ? 'C' : 'A';
      } else if (book.flow.phase === 'recover' && !derived) {
        book.flow.phase = 'derive';
      }
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
