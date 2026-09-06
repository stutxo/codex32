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
  visitLesson,
  type Exercise,
  type LessonProgress,
} from '@/lib/workbook';
import Wheel, { WheelControls, type WheelKind } from './wheel';
import PaperReference, {
  ShareHeader,
  DerivationTable,
} from './paper-reference';
import {
  checkColumn,
  columnEntry,
  writeColumn,
  stepGuide,
  isUnknownRow,
  keepUnknown,
} from '@/lib/workbook-guide';

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
  const instruction = useRef<HTMLElement>(null);
  const lastLocation = useRef<{
    at: number;
    active: boolean;
    unknown: boolean;
  } | null>(null);
  const focusPrompt = useRef(false);
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
  const derivationFactor = step.kind === 'recovery' && target === 'D';
  const computational =
    !derivationFactor &&
    ['addition', 'translation', 'recovery'].includes(step.kind);
  const guided = step.kind === 'addition' && step.answer.length > 1;
  const guide = stepGuide(step, Boolean(exercise.checksum), target);
  const left = step.left?.[column];
  const right = step.right?.[column];
  const unknown = left === '?' || right === '?';
  const unknownRow = isUnknownRow(step);
  const unknownTask = unknownRow || (guided && unknown);
  const startUpward = unknownRow && step.kind === 'addition';
  const given = reviewing ? progress.answers[at] : progress.draft;
  const value = guided && !reviewing ? columnEntry(given, column) : given;
  const tableRow =
    wheelData.checksumTable[alphabet.indexOf(view.tableFirst)][
      alphabet.indexOf(view.tableSecond)
    ];
  function patch(change: Partial<LessonProgress>) {
    onChange(editLesson(progress, change, example));
  }
  function goToAnswer() {
    field.current?.focus({ preventScroll: true });
    field.current?.scrollIntoView({ block: 'center' });
  }
  function leaveUnknown() {
    if (example || reviewing || done) return;
    const result = keepUnknown(exercise, { ...progress, column });
    if (!result.correct) {
      setError(
        normalizeAnswer(progress.draft).length > step.answer.length
          ? 'Your row has extra characters. Open “Edit or paste the whole row” below to remove them.'
          : 'Check your row below and try again.',
      );
      goToAnswer();
      return;
    }
    setError('');
    focusPrompt.current = true;
    onChange(result.progress);
    if (result.complete) onComplete();
  }
  useEffect(() => {
    const changedStep =
      lastLocation.current?.at !== at ||
      !lastLocation.current.active ||
      lastLocation.current.unknown !== unknownTask ||
      focusPrompt.current;
    lastLocation.current = { at, active, unknown: unknownTask };
    focusPrompt.current = false;
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      if (changedStep) {
        instruction.current?.focus({ preventScroll: true });
        instruction.current?.scrollIntoView({ block: 'start' });
      } else if (!example && !done && !reviewing) {
        field.current?.focus({ preventScroll: true });
        if (guided) field.current?.select();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [at, column, active, example, done, reviewing, guided, unknownTask]);
  function check(wholeRow = false) {
    if (example || reviewing) return;
    const result =
      guided && !wholeRow
        ? checkColumn(exercise, { ...progress, column })
        : submitAnswer(exercise, progress);
    if (!result.correct) {
      if (guided && !wholeRow) {
        field.current?.focus({ preventScroll: true });
        field.current?.select();
        setError(
          normalizeAnswer(progress.draft).length > step.answer.length
            ? 'Your row has extra characters. Open “Edit or paste the whole row” below to remove them.'
            : unknown
              ? 'This column is still unknown. Write ? to keep its place.'
              : 'Check column ' +
                (column + 1) +
                ': set the top character to ' +
                left +
                ', read the window at ' +
                right +
                ', then write its result.',
        );
        return;
      }
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
            ? derivationFactor
              ? 'Read the factor for share ' +
                step.left +
                ' in column D. Enter its alphabet equivalent.'
              : 'That character does not match. Check the wheel setting and try again.'
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
    if (example) patch({ exampleCursor: next, column: 0 });
    else onChange(visitLesson(exercise, { ...progress, column: 0 }, next));
  }
  const completedCells = exercise.checksum
    ? []
    : exercise.steps.flatMap((item, i) =>
        item.position && item.kind === 'addition'
          ? [{ position: item.position, step: i, answer: progress.answers[i] }]
          : [],
      );
  return (
    <div
      className="workshop-spread manual-spread guided-spread"
      data-paper-task={step.kind}
      data-unknown-task={!done && unknownTask}
    >
      <header ref={instruction} tabIndex={-1} className="lesson-intro">
        <div className="running-head">
          <span>
            {exercise.title} · {example ? 'WORKED EXAMPLE' : 'YOUR WORKBOOK'}
          </span>
          <a
            href={
              wheelData.sources.paper +
              '#page=' +
              (exercise.verification ? 21 : guide.page)
            }
            target="_blank"
            rel="noreferrer"
          >
            Book p. {exercise.verification ? '14' : guide.printedPage} ↗
          </a>
        </div>
        {!done && (
          <>
            <div className="lesson-route">
              <span>{guide.phase}</span>
              {guide.position && <span>{guide.position}</span>}
            </div>
            <div className="manual-instruction">
              <h2>
                {startUpward
                  ? 'Your downward pass is complete.'
                  : unknownRow
                    ? 'Leave this row unknown for now.'
                    : unknownTask
                      ? 'Leave column ' + (column + 1) + ' unknown for now.'
                      : step.title}
              </h2>
              <p>
                {startUpward
                  ? 'All 13 cells in this row are pink on the paper worksheet. Leave them blank. Now start at the given bottom row, SECRETSHARE32, and work upward to find the missing characters.'
                  : unknownRow
                    ? 'The eleven characters you keep and the two you bring in are all unknown. Keep their places as a row of 13 question marks.'
                    : unknownTask
                      ? 'One of the two characters in this column is unknown, so its result is unknown too. Leave this pink cell blank, just as you would on paper, then continue.'
                      : step.instruction}
              </p>
            </div>
            {unknownTask && (
              <p className="unknown-guide">
                <b>? means “not known yet”.</b> It marks a pink square left
                blank in the book. You will fill it on the upward pass; there is
                no wheel calculation for this cell yet.
              </p>
            )}
            <div className="lesson-next-action">
              {example ? (
                <BookButton
                  disabled={at === exercise.steps.length - 1}
                  onClick={() => visit(at + 1)}
                >
                  {startUpward
                    ? 'Show the upward pass'
                    : 'Continue the example'}
                  <ArrowRight size={17} />
                </BookButton>
              ) : unknownTask && !reviewing ? (
                <BookButton onClick={leaveUnknown}>
                  {startUpward
                    ? 'Start the upward pass'
                    : unknownRow
                      ? 'Leave this row unknown and continue'
                      : 'Leave this cell unknown and continue'}
                  <ArrowRight size={17} />
                </BookButton>
              ) : (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={goToAnswer}
                >
                  {reviewing
                    ? 'Review my answer'
                    : step.id === 'endpoint'
                      ? 'Write SECRETSHARE32'
                      : 'Go to my answer'}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
            {exercise.checksum && ['endpoint', 'prefill'].includes(step.id) && (
              <ShareHeader exercise={exercise} />
            )}
          </>
        )}
      </header>
      {!unknownTask || done ? (
        <section className="instrument-page magic-instrument">
          {computational && !done ? (
            <>
              <div className="instrument-caption">
                <span className="small-label">
                  {guided
                    ? 'COLUMN ' + (column + 1) + ' OF 13'
                    : exercise.title}
                </span>
                <span>
                  {unknown ? 'KEEP THE UNKNOWN CELL' : 'TURN · READ · WRITE'}
                </span>
              </div>
              <Wheel
                engine={engine}
                kind={kind}
                primary={view.primary}
                other={view.other}
                target={target}
                onPrimary={(primary) => patch({ primary })}
                onOther={(other) => patch({ other })}
                controls={false}
                factorSide={view.factorSide}
                onFactorSide={(factorSide) => patch({ factorSide })}
              />
            </>
          ) : derivationFactor && !done ? (
            <DerivationTable />
          ) : !done ? (
            <PaperReference step={step} />
          ) : (
            <div className="paper-reference">
              <h3>Your worksheet is complete.</h3>
              <p>
                You can review every entry using the controls on the facing
                page.
              </p>
              {exercise.checksum && !exercise.verification && (
                <p>
                  The book also asks you to verify a separate copy of your
                  share.{' '}
                  <a
                    href={wheelData.sources.paper + '#page=21'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Read the verification instructions on p. 14 ↗
                  </a>
                </p>
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
                  Table row · first character
                  <select
                    value={view.tableFirst}
                    onChange={(event) =>
                      patch({
                        tableFirst: event.target.value,
                        tableOpen: false,
                      })
                    }
                  >
                    {alphabet.split('').map((character) => (
                      <option key={character}>{character}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Table column · second character
                  <select
                    value={view.tableSecond}
                    onChange={(event) =>
                      patch({
                        tableSecond: event.target.value,
                        tableOpen: false,
                      })
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
                  <span>
                    Selected entry: {view.tableFirst + view.tableSecond}
                  </span>
                  <code>{tableRow}</code>
                </output>
              )}
            </div>
          )}
        </section>
      ) : null}
      <section className="worksheet-page manual-worksheet">
        <div className="running-head">
          <span>
            {example
              ? 'EXAMPLE · YOUR WORK IS KEPT'
              : 'WRITE ON YOUR WORKSHEET'}
          </span>
          <span className="entry-count">
            {done
              ? 'All entries checked'
              : 'Entry ' + (at + 1) + ' of ' + exercise.steps.length}
          </span>
        </div>
        {done ? (
          <div className="lesson-success" aria-live="polite">
            <CheckCircle2 size={28} />
            <h2>
              {exercise.checksum
                ? exercise.verification
                  ? 'Checksum verified.'
                  : 'Checksum calculated.'
                : target === 'D'
                  ? 'Share D complete.'
                  : 'Secret recovered.'}
            </h2>
            <p>
              {exercise.verification
                ? 'Your downward calculation ends at SECRETSHARE32, as required. This is your verified'
                : 'Every entry has been checked. This is your completed'}{' '}
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
            {computational && step.left && (
              <>
                <div className="manual-givens">
                  <span>
                    <b>Top:</b> {guide.top}
                  </span>
                  <span>
                    <b>Bottom:</b> {guide.bottom}
                  </span>
                  <div
                    className="operand-cells"
                    style={
                      {
                        '--cell-count': step.left.length,
                      } as React.CSSProperties
                    }
                  >
                    {step.left.split('').map((character, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={'Use column ' + (i + 1)}
                        aria-pressed={column === i}
                        onClick={() => {
                          setError('');
                          patch({ column: i });
                        }}
                      >
                        <small>{i + 1}</small>
                        <span
                          className={character === '?' ? 'unknown-operand' : ''}
                        >
                          {character}
                        </span>
                        {step.right && (
                          <span
                            className={
                              step.right[i] === '?' ? 'unknown-operand' : ''
                            }
                          >
                            {step.right[i]}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="column-instruction">
                  {guided && (
                    <button
                      type="button"
                      className="secondary-button column-arrow"
                      aria-label="Previous column"
                      disabled={column === 0}
                      onClick={() => {
                        setError('');
                        patch({ column: column - 1 });
                      }}
                    >
                      <ArrowLeft size={17} />
                    </button>
                  )}
                  <strong>
                    {guided
                      ? 'Column ' + (column + 1) + ' of 13'
                      : 'Set the wheel'}
                  </strong>
                  <span>
                    {unknown
                      ? 'An unknown cell stays ? for now.'
                      : kind === 'addition'
                        ? 'Top ' + left + ' + bottom ' + right
                        : kind === 'translation'
                          ? 'Factor ' +
                            symbol(left!) +
                            ' (' +
                            left +
                            ') · character ' +
                            right
                          : 'Handle at ' + left + ' · read ' + right}
                  </span>
                  {guided && (
                    <button
                      type="button"
                      className="secondary-button column-arrow"
                      aria-label="Next column"
                      disabled={column === 12}
                      onClick={() => {
                        setError('');
                        patch({ column: column + 1 });
                      }}
                    >
                      <ArrowRight size={17} />
                    </button>
                  )}
                </div>
                {!unknown && (
                  <WheelControls
                    engine={engine}
                    kind={kind}
                    primary={view.primary}
                    other={view.other}
                    target={target}
                    onPrimary={(primary) => patch({ primary })}
                    onOther={(other) => patch({ other })}
                    expected={{ primary: left!, other: right! }}
                  />
                )}
                {example && !unknown && (
                  <button
                    className="secondary-button"
                    onClick={() => patch({ primary: left!, other: right! })}
                  >
                    Show this setting
                  </button>
                )}
                {guided && (
                  <div className="written-row">
                    <span>Your row so far</span>
                    <div className="answer-cells" aria-label="Your answer row">
                      {step.answer.split('').map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-label={'Write column ' + (i + 1)}
                          aria-pressed={column === i}
                          onClick={() => {
                            setError('');
                            patch({ column: i });
                          }}
                        >
                          {example
                            ? step.answer[i]
                            : columnEntry(given, i) || '·'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
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
                    : step.id === 'endpoint'
                      ? 'Copy SECRETSHARE32 here'
                      : guided
                        ? unknown
                          ? 'Or write ? for column ' + (column + 1)
                          : '3. Write the result for column ' + (column + 1)
                        : step.answer.length === 1
                          ? 'Write the result'
                          : 'Your row · ' + step.answer.length + ' characters'}
                </label>
                <input
                  ref={field}
                  id={answerId}
                  value={value}
                  readOnly={reviewing}
                  onFocus={(event) => {
                    if (guided && !reviewing) event.currentTarget.select();
                  }}
                  maxLength={guided && !reviewing ? 1 : 64}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? answerId + '-error' : undefined}
                  placeholder={
                    guided || step.answer.length === 1
                      ? '·'
                      : 'Copy the row here'
                  }
                  onChange={(event) => {
                    setError('');
                    patch({
                      draft: guided
                        ? writeColumn(
                            progress.draft,
                            column,
                            event.target.value,
                            step.answer.length,
                          )
                        : event.target.value.toUpperCase(),
                    });
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
                  {reviewing
                    ? 'Next checked step'
                    : guided
                      ? 'Check character'
                      : 'Check my answer'}{' '}
                  <ArrowRight size={17} />
                </BookButton>
                {guided && !reviewing && (
                  <details className="whole-row-entry">
                    <summary>Edit or paste the whole row</summary>
                    <label htmlFor={answerId + '-row'}>
                      Your row · 13 characters
                    </label>
                    <input
                      id={answerId + '-row'}
                      value={progress.draft}
                      maxLength={64}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      onChange={(event) => {
                        setError('');
                        patch({ draft: event.target.value.toUpperCase() });
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          check(true);
                        }
                      }}
                    />
                    <BookButton type="button" onClick={() => check(true)}>
                      Check whole row <ArrowRight size={17} />
                    </BookButton>
                  </details>
                )}
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
