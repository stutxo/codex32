'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';
import BookButton from '@/components/book-button';
import { grouped, type Engine } from '@/lib/practice';
import {
  alphabet,
  symbol,
  wheelData,
  type WorkshopSession,
} from '@/lib/workshop';
import {
  emptyLesson,
  editLesson,
  normalizeAnswer,
  submitAnswer,
  type Exercise,
  type LessonProgress,
} from '@/lib/workbook';
import Wheel, { type WheelKind } from './wheel';

export default function ManualLesson({
  engine,
  exercise,
  progress,
  onChange,
  onComplete,
  example,
  active,
  target = 'S',
  session,
}: {
  engine: Engine;
  exercise: Exercise;
  progress: LessonProgress;
  onChange: (value: LessonProgress) => void;
  onComplete: () => void;
  example: boolean;
  active: boolean;
  target?: 'D' | 'S';
  session: WorkshopSession;
}) {
  const [error, setError] = useState('');
  const answerId = useId();
  const field = useRef<HTMLInputElement>(null);
  const at = example
    ? Math.min(progress.exampleCursor, exercise.steps.length - 1)
    : progress.cursor;
  const view = example ? progress.exampleWheel : progress;
  const done = !example && at === exercise.steps.length;
  const step = exercise.steps[Math.min(at, exercise.steps.length - 1)];
  const reviewing = !example && at < progress.answers.length;
  const column = Math.min(
    view.column,
    (step.left?.length ?? step.answer.length) - 1,
  );
  const kind: WheelKind =
    step.kind === 'recovery' || step.kind === 'translation'
      ? step.kind
      : 'addition';
  const computational = ['addition', 'translation', 'recovery'].includes(
    step.kind,
  );
  const left = step.left?.[column];
  const right = step.right?.[column];
  const given = reviewing ? progress.answers[at] : progress.draft;
  const value = example ? step.answer : given;
  const tableRow =
    wheelData.checksumTable[alphabet.indexOf(view.tableFirst)][
      alphabet.indexOf(view.tableSecond)
    ];
  function patch(change: Partial<LessonProgress>) {
    onChange(editLesson(progress, change, example));
  }
  useEffect(() => {
    if (active && !example && !done && !reviewing) {
      field.current?.focus({ preventScroll: true });
    }
  }, [at, active, example, done, reviewing]);
  function check() {
    if (example || reviewing) return;
    const result = submitAnswer(exercise, progress);
    if (!result.correct) {
      const entered = normalizeAnswer(progress.draft);
      if (entered.length !== step.answer.length) {
        setError(
          'Enter all ' +
            step.answer.length +
            ' character' +
            (step.answer.length === 1 ? '' : 's') +
            ' before checking.',
        );
      } else {
        const columns = step.answer
          .split('')
          .flatMap((character, i) => (character !== entered[i] ? [i + 1] : []));
        setError(
          step.answer.length === 1
            ? 'That character does not match. Check the wheel setting and try again.'
            : 'Check column' +
                (columns.length === 1 ? ' ' : 's ') +
                columns.join(', ') +
                ' and try again.',
        );
      }
      return;
    }
    setError('');
    onChange(result.progress);
    if (result.complete) onComplete();
  }
  function visit(next: number) {
    setError('');
    patch(
      example
        ? { exampleCursor: next, column: 0 }
        : { cursor: next, column: 0 },
    );
  }
  const completedCells = exercise.checksum
    ? []
    : exercise.steps.flatMap((item, i) =>
        item.position && item.kind === 'addition'
          ? [{ position: item.position, step: i, answer: progress.answers[i] }]
          : [],
      );
  return (
    <div className="workshop-spread manual-spread">
      <section className="instrument-page magic-instrument">
        <div className="instrument-caption">
          <span className="small-label">{exercise.title}</span>
          <span>{example ? 'WORKED EXAMPLE' : 'YOUR PAPER COMPUTER'}</span>
        </div>
        <Wheel
          engine={engine}
          kind={kind}
          primary={view.primary}
          other={view.other}
          target={target}
          onPrimary={(primary) => patch({ primary })}
          onOther={(other) => patch({ other })}
        />
        {!done && computational && (
          <div className="wheel-task">
            <strong>
              {step.answer.length > 1 ? 'Column ' + (column + 1) + ': ' : ''}
              {left === '?' || right === '?'
                ? 'This character is still unknown. Write ?.'
                : step.kind === 'recovery'
                  ? 'Handle at ' + left + ' · read ' + right
                  : step.kind === 'translation'
                    ? 'Factor ' +
                      symbol(left ?? 'Q') +
                      ' (' +
                      left +
                      ') · read ' +
                      right
                    : left + ' + ' + right}
            </strong>
            <p>
              Turn the disc or use its two selectors. Copy the reading into your
              workbook.
            </p>
            {example && left && right && left !== '?' && right !== '?' && (
              <button
                className="secondary-button"
                onClick={() => patch({ primary: left, other: right })}
              >
                Show this setting
              </button>
            )}
          </div>
        )}
        {step.kind === 'lookup' && !done && (
          <div className="table-reference">
            <h3>Checksum table</h3>
            <p>
              The first character chooses a row; the second chooses a column.
            </p>
            <div className="table-pickers">
              <label>
                First character
                <select
                  value={view.tableFirst}
                  onChange={(event) =>
                    patch({ tableFirst: event.target.value, tableOpen: false })
                  }
                >
                  {alphabet.split('').map((character) => (
                    <option key={character}>{character}</option>
                  ))}
                </select>
              </label>
              <label>
                Second character
                <select
                  value={view.tableSecond}
                  onChange={(event) =>
                    patch({ tableSecond: event.target.value, tableOpen: false })
                  }
                >
                  {alphabet.split('').map((character) => (
                    <option key={character}>{character}</option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-button"
                onClick={() => patch({ tableOpen: true })}
              >
                Look up this pair
              </button>
            </div>
            {view.tableOpen && (
              <output aria-live="polite">
                <span>{view.tableFirst + view.tableSecond}</span>
                <code>{tableRow}</code>
              </output>
            )}
          </div>
        )}
      </section>
      <section className="worksheet-page manual-worksheet">
        <div className="running-head">
          <span>
            {example ? 'EXAMPLE · YOUR WORK IS KEPT' : 'YOUR WORKBOOK'}
          </span>
          <span>
            {step.direction === 'up'
              ? 'SOLVE UPWARD'
              : step.direction === 'down'
                ? 'WORK DOWNWARD'
                : exercise.title}
          </span>
        </div>
        {done ? (
          <div className="lesson-success" aria-live="polite">
            <CheckCircle2 size={28} />
            <h2>
              {exercise.checksum
                ? 'Checksum complete.'
                : target === 'D'
                  ? 'Share D complete.'
                  : 'Secret recovered.'}
            </h2>
            <p>
              Every entry has been checked. This is your completed{' '}
              {exercise.checksum || target === 'D' ? 'share' : 'secret'}.
            </p>
            {exercise.checksum && (
              <p className="completed-checksum">{exercise.checksum}</p>
            )}
            <code>{grouped(exercise.output)}</code>
            <BookButton onClick={onComplete}>
              Continue <ArrowRight size={17} />
            </BookButton>
            <button className="text-button" onClick={() => visit(0)}>
              Review my steps
            </button>
            {!exercise.checksum && target === 'S' && (
              <div data-recovery-result="true" tabIndex={-1}>
                <h3>The same test wallet.</h3>
                <p>
                  These Signet addresses match the seed from your practice
                  shares.
                </p>
                <ol className="address-list">
                  {session.addresses.map((address, i) => (
                    <li key={address}>
                      <span>Receive address {i + 1}</span>
                      <code>{address}</code>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="manual-instruction">
              <span className="small-label">
                STEP {at + 1} OF {exercise.steps.length}
              </span>
              <h2>{step.title}</h2>
              <p>{step.instruction}</p>
            </div>
            {step.left && (
              <div className="manual-givens">
                <span>
                  {step.kind === 'recovery'
                    ? 'Share / other share'
                    : step.kind === 'translation'
                      ? 'Factor / character'
                      : 'Working row'}
                </span>
                <div
                  className="operand-cells"
                  style={
                    { '--cell-count': step.left.length } as React.CSSProperties
                  }
                >
                  {step.left.split('').map((character, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={'Use column ' + (i + 1)}
                      aria-pressed={column === i}
                      onClick={() => patch({ column: i })}
                    >
                      <span>{character}</span>
                      {step.right && <span>{step.right[i]}</span>}
                    </button>
                  ))}
                </div>
                {step.right && (
                  <span>
                    {step.kind === 'addition'
                      ? '+ Table / prefill / translated row'
                      : 'Use the matching wheel above'}
                  </span>
                )}
                {step.following && (
                  <p>
                    {step.direction === 'up'
                      ? 'Saved lookup characters: '
                      : 'Incoming characters: '}
                    <code>{step.following}</code>
                  </p>
                )}
              </div>
            )}
            {example ? (
              <div className="example-answer">
                <span>Worked answer</span>
                <code>{step.answer}</code>
                <p>
                  Viewing this answer does not fill or complete your workbook.
                </p>
              </div>
            ) : (
              <form
                className="answer-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (reviewing)
                    visit(Math.min(at + 1, progress.answers.length));
                  else check();
                }}
              >
                <label htmlFor={answerId}>
                  {reviewing
                    ? 'Your checked entry'
                    : step.answer.length === 1
                      ? 'Your character'
                      : 'Your row · ' + step.answer.length + ' characters'}
                </label>
                <input
                  ref={field}
                  id={answerId}
                  value={value}
                  readOnly={reviewing}
                  maxLength={64}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? answerId + '-error' : undefined}
                  placeholder={
                    step.answer.length === 1 ? '·' : 'Write your answer'
                  }
                  onChange={(event) => {
                    setError('');
                    patch({ draft: event.target.value.toUpperCase() });
                  }}
                />
                {error && (
                  <p
                    id={answerId + '-error'}
                    className="answer-error"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
                <BookButton type="submit">
                  {reviewing ? 'Next checked step' : 'Check my answer'}{' '}
                  <ArrowRight size={17} />
                </BookButton>
              </form>
            )}
            <div className="checksum-actions">
              <button
                className="secondary-button"
                disabled={at === 0}
                onClick={() => visit(at - 1)}
              >
                <ArrowLeft size={15} /> Back
              </button>
              {example && (
                <BookButton
                  disabled={at === exercise.steps.length - 1}
                  onClick={() => visit(at + 1)}
                >
                  Next example step <ArrowRight size={15} />
                </BookButton>
              )}
              {reviewing && (
                <button
                  className="text-button"
                  onClick={() => visit(progress.answers.length)}
                >
                  Return to my current step
                </button>
              )}
            </div>
          </>
        )}
        <div className="manual-progress" aria-label="Checked workbook progress">
          <span>
            {progress.answers.length} / {exercise.steps.length} steps checked
          </span>
          <progress
            max={exercise.steps.length}
            value={progress.answers.length}
          />
        </div>
        {completedCells.length > 0 && (
          <div className="character-worksheet">
            <span className="fixed-prefix">MS1</span>
            <div className="character-cells">
              {completedCells.map((cell) => (
                <button
                  key={cell.position}
                  className={
                    (cell.answer ? 'is-filled ' : '') +
                    (cell.position >= 36 ? 'is-checksum' : '')
                  }
                  disabled={!example && cell.step > progress.answers.length}
                  onClick={() => visit(cell.step)}
                  aria-label={
                    'Position ' +
                    cell.position +
                    (cell.answer ? ', checked' : ', empty')
                  }
                >
                  {example
                    ? exercise.steps[cell.step].answer
                    : (cell.answer ?? '·')}
                </button>
              ))}
            </div>
          </div>
        )}
        {!example && progress.answers.length > 0 && (
          <button
            className="text-button restart-lesson"
            onClick={() => {
              if (
                window.confirm(
                  'Erase the checked steps and answers in this worksheet? Your other worksheets are kept.',
                )
              ) {
                setError('');
                onChange(emptyLesson());
              }
            }}
          >
            <RotateCcw size={15} /> Restart this worksheet
          </button>
        )}
      </section>
    </div>
  );
}
