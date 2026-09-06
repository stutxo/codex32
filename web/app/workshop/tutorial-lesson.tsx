'use client';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import BookButton from '@/components/book-button';
import { grouped } from '@/lib/practice';
import {
  editLesson,
  emptyLesson,
  visitLesson,
  type LessonProgress,
} from '@/lib/workbook';
import {
  autoExercise,
  autoNextEntry,
  tutorialCalculation,
  visibleShare,
} from '@/lib/workbook-guide';
import ManualLesson from './manual-lesson';
import Wheel, { wheelAnswer, type WheelKind } from './wheel';
import SecretResult from './secret-result';
import { alphabet } from '@/lib/workshop';

type Props = ComponentProps<typeof ManualLesson> & { onSkipPaper?: () => void };
export default function TutorialLesson(props: Props) {
  const {
    engine,
    exercise,
    progress,
    onChange,
    onComplete,
    example,
    active,
    target = 'S',
    session,
    onSkipPaper,
  } = props;
  const [paper, setPaper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<{
    value: string;
    example: boolean;
    cursor: number;
  } | null>(null);
  const [error, setError] = useState('');
  const pending = useRef<{
    progress: LessonProgress;
    output: string;
    letter: string;
  } | null>(null);
  const done = !example && progress.answers.length === exercise.steps.length;
  const exampleAt = Math.min(progress.exampleCursor, exercise.steps.length - 1);
  const base = example
    ? {
        ...emptyLesson(),
        ...progress.exampleWheel,
        cursor: exampleAt,
        answers: exercise.steps.slice(0, exampleAt).map((step) => step.answer),
      }
    : progress;
  const next = tutorialCalculation(exercise, base, target);
  const step = exercise.steps[next.cursor];
  const column = Math.min(next.column, (step?.right?.length ?? 1) - 1);
  const view = example ? progress.exampleWheel : progress;
  const kind = (step?.kind ?? 'addition') as WheelKind;
  const left = step?.left?.[column] ?? 'Q',
    right = step?.right?.[column] ?? 'Q';
  const primary =
    kind === 'translation' && view.primary === 'Q' ? 'P' : view.primary;
  const hasWheel = Boolean(
    step &&
    ['addition', 'translation', 'recovery'].includes(step.kind) &&
    alphabet.includes(left) &&
    alphabet.includes(right),
  );
  const answer = hasWheel
    ? wheelAnswer(engine, kind, primary, right, target)
    : null;
  const aligned = primary === left;
  const title = exercise.verification
    ? 'Check the complete share.'
    : exercise.checksum
      ? 'Give share ' + exercise.output[8] + ' its checksum.'
      : target === 'D'
        ? 'Make another share.'
        : 'Bring the secret back.';
  const description = exercise.verification
    ? 'On paper, you recopy the complete share and calculate again to catch mistakes. Here the computer can check it for you.'
    : exercise.checksum
      ? 'A checksum catches copying mistakes. Try a turn or finish this share.'
      : target === 'D'
        ? 'Turn the wheel to make D from A and C. No new randomness is needed.'
        : 'Set one share aside. Any two of your three shares can recover the original secret.';
  function patch(change: Partial<LessonProgress>) {
    onChange(editLesson(progress, change, example));
  }
  function autoLetter() {
    if (!step || !hasWheel || busy || done) return;
    setError('');
    if (example) {
      onChange(
        editLesson(
          progress,
          {
            primary: left,
            other: right,
            factorSide: false,
            exampleCursor: next.cursor,
          },
          true,
        ),
      );
      setWritten({
        value: step.answer[column],
        example: true,
        cursor: next.cursor,
      });
      return;
    }
    const alignedProgress = {
      ...next,
      primary: left,
      other: right,
      factorSide: false,
    };
    pending.current = {
      progress: alignedProgress,
      output: exercise.output,
      letter: step.answer[column],
    };
    setBusy(true);
    onChange(alignedProgress);
  }
  useEffect(() => {
    const task = pending.current;
    if (!task) return;
    if (
      !active ||
      example ||
      paper ||
      task.output !== exercise.output ||
      task.progress !== progress
    ) {
      pending.current = null;
      setBusy(false);
      return;
    }
    const timer = setTimeout(() => {
      pending.current = null;
      setBusy(false);
      const result = autoNextEntry(exercise, progress);
      if (result.correct)
        setWritten({
          value: task.letter,
          example: false,
          cursor: progress.cursor,
        });
      else
        setError(
          'Your saved row needs a correction. Open the paper worksheet to edit it, or complete this section with code.',
        );
      onChange(result.progress);
      if (result.complete) onComplete();
    }, 650);
    return () => clearTimeout(timer);
  }, [active, example, paper, exercise, progress, onChange, onComplete]);
  function complete() {
    if (busy || example) return;
    const result = autoExercise(
      exercise,
      visitLesson(exercise, progress, progress.answers.length),
    );
    if (!result.complete) return;
    onChange(result.progress);
    onComplete();
  }
  if (paper)
    return (
      <div className="paper-mode">
        <button
          className="secondary-button return-tutorial"
          onClick={() => setPaper(false)}
        >
          ← Back to the quick tutorial
        </button>
        <ManualLesson {...props} active={active} />
      </div>
    );
  if (done && !exercise.checksum && target === 'S')
    return (
      <>
        <SecretResult secret={exercise.output} addresses={session.addresses} />
        <button className="text-button" onClick={() => setPaper(true)}>
          Review the paper calculations
        </button>
      </>
    );
  return (
    <section
      className="tutorial-lesson"
      data-auto-turning={busy}
      aria-busy={busy}
    >
      <header className="tutorial-heading">
        <h2>{title}</h2>
        <p>{description}</p>
        {!example && !exercise.verification && (
          <BookButton
            className="tutorial-complete-button"
            disabled={busy}
            onClick={done ? onComplete : complete}
          >
            {done ? 'Continue the tutorial' : 'Auto-complete this section'} →
          </BookButton>
        )}
      </header>
      {exercise.verification && onSkipPaper && !example && (
        <div className="paper-check-choice">
          <BookButton onClick={onSkipPaper}>
            Check with code and continue →
          </BookButton>
          <button className="text-button" onClick={() => setPaper(true)}>
            Try the paper verification instead
          </button>
        </div>
      )}
      <div className="tutorial-grid">
        <div className="tutorial-instrument">
          {hasWheel && !done && (
            <p className="tutorial-instruction">
              {kind === 'addition' ? (
                <>
                  Turn to <b>{left}</b>. Read window <b>{right}</b>.
                </>
              ) : kind === 'translation' ? (
                <>
                  Set factor <b>{left}</b>. Translate character <b>{right}</b>.
                </>
              ) : (
                <>
                  Point to share <b>{left}</b>. Read share <b>{right}</b>.
                </>
              )}
            </p>
          )}
          {hasWheel ? (
            <Wheel
              engine={engine}
              kind={kind}
              primary={view.primary}
              other={right}
              target={target}
              onPrimary={(value) => {
                if (value === left) patch({ primary: value });
              }}
              onTurn={(value) => patch({ primary: value })}
              onOther={() => {}}
              guided={{ primary: left, other: right }}
              controls={false}
              factorSide={false}
              onFactorSide={() => {}}
              showFlip={false}
            />
          ) : (
            <div className="tutorial-finished-mark">
              {step ? '✎' : '✓'}
              <p>
                {step
                  ? 'Your saved row needs a correction.'
                  : 'The calculations are complete.'}
              </p>
            </div>
          )}
        </div>
        <div className="tutorial-controls">
          {hasWheel && !done && (
            <>
              <output className="tutorial-reading" aria-live="polite">
                <strong>{answer ?? '—'}</strong>
                <span>
                  {aligned
                    ? 'At the highlighted setting'
                    : 'Your current wheel reading'}
                  <br />
                  {primary}{' '}
                  {kind === 'addition'
                    ? '+'
                    : kind === 'recovery'
                      ? 'with'
                      : '×'}{' '}
                  {right}
                </span>
              </output>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={autoLetter}
              >
                {example
                  ? 'Show the correct setting'
                  : 'Turn & fill next letter'}
              </button>
              {written &&
                written.example === example &&
                (!example || written.cursor === next.cursor) && (
                  <output aria-live="polite">
                    {example ? 'Example result' : 'Last letter recorded'}:{' '}
                    <b>{written.value}</b>
                  </output>
                )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
          {step && !hasWheel && (
            <p>
              Open the paper worksheet to edit your saved row, or let the
              computer complete this section.
            </p>
          )}
          {exercise.verification && !example && (
            <button
              className="secondary-button"
              disabled={busy}
              onClick={complete}
            >
              Auto-complete the paper worksheet
            </button>
          )}
          <p className="tutorial-progress">
            {progress.answers.length === exercise.steps.length
              ? 'Section complete'
              : 'The computer checks each finished share. Paper verification is optional under Examples & tools.'}
          </p>
          <details className="tutorial-explanation">
            <summary>What is the computer doing?</summary>
            <p>
              {exercise.checksum
                ? 'It follows the book’s table lookups, shifts and additions. To create a checksum it works down, then solves upward from SECRETSHARE32. To verify, it uses the complete share and checks that the finishing row is SECRETSHARE32.'
                : 'It uses the book’s factors, translates each complete share, and adds the translated characters. Every result is checked against the Codex32 library.'}
            </p>
          </details>
          <button className="text-button" onClick={() => setPaper(true)}>
            Open the paper worksheet
          </button>
        </div>
      </div>
      <div className="tutorial-share">
        <span>
          {exercise.checksum
            ? 'Share ' + exercise.output[8] + ' · all 48 positions'
            : 'Result · share ' + target}
        </span>
        <code>
          {grouped(
            exercise.checksum
              ? visibleShare(exercise, progress, example)
              : done || example
                ? exercise.output
                : 'MS1' + '?'.repeat(45),
          )}
        </code>
        {exercise.checksum && (
          <small>The ? spaces become the checksum as you work upward.</small>
        )}
      </div>
    </section>
  );
}
