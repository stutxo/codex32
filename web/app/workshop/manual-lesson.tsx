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
  prepareLesson,
  editLesson,
  normalizeAnswer,
  submitAnswer,
  visitLesson,
  type Exercise,
  type LessonProgress,
} from '@/lib/workbook';
import SecretResult from './secret-result';
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
  selectOperand,
  autoNextEntry,
  autoExercise,
  visibleShare,
} from '@/lib/workbook-guide';

export default function ManualLesson({
  engine,
  exercise,
  progress,
  onChange,
  onComplete,
  onContinue = onComplete,
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
  onContinue?: () => void;
  example: boolean;
  active: boolean;
  target?: 'D' | 'S';
  session: WorkshopSession;
}) {
  const [error, setError] = useState('');
  const [autoBusy, setAutoBusy] = useState(false);
  const pendingAuto = useRef<{
    output: string;
    progress: LessonProgress;
  } | null>(null);
  const answerId = useId();
  const field = useRef<HTMLInputElement>(null);
  const instruction = useRef<HTMLElement>(null);
  const lastLocation = useRef<{
    at: number;
    active: boolean;
    unknown: boolean;
  } | null>(null);
  const focusPrompt = useRef(false);
  const givenCount = exercise.steps[0]?.id === 'endpoint' ? 1 : 0;
  const at = example
    ? Math.max(
        givenCount,
        Math.min(progress.exampleCursor, exercise.steps.length - 1),
      )
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
  function chooseOperand(part: 'primary' | 'other', value: string) {
    const next = selectOperand(exercise, progress, part, value, example);
    if (next !== progress) onChange(next);
  }
  function autoLetter() {
    if (autoBusy || example || reviewing || done) return;
    setError('');
    if (computational && !unknown) {
      const aligned = {
        ...progress,
        primary: left!,
        other: right!,
        factorSide: false,
      };
      pendingAuto.current = { output: exercise.output, progress: aligned };
      setAutoBusy(true);
      onChange(aligned);
    } else {
      const selected =
        step.kind === 'lookup'
          ? {
              ...progress,
              tableFirst: step.key![0],
              tableSecond: step.key![1],
              tableOpen: true,
            }
          : progress;
      const result = autoNextEntry(exercise, selected);
      onChange(result.progress);
      if (!result.correct)
        setError(
          'Your row has extra characters. Remove them before continuing.',
        );
      if (result.complete) onComplete();
    }
  }
  useEffect(() => {
    const pending = pendingAuto.current;
    if (!pending) return;
    if (
      !active ||
      example ||
      pending.output !== exercise.output ||
      pending.progress !== progress
    ) {
      pendingAuto.current = null;
      setAutoBusy(false);
      return;
    }
    const timer = setTimeout(() => {
      pendingAuto.current = null;
      setAutoBusy(false);
      const result = autoNextEntry(exercise, progress);
      onChange(result.progress);
      if (!result.correct)
        setError(
          'Your row has extra characters. Open “Edit or paste the whole row” to remove them.',
        );
      if (result.complete) onComplete();
    }, 650);
    return () => clearTimeout(timer);
  }, [active, example, progress, exercise, onChange, onComplete]);
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
    next = Math.max(givenCount, next);
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
      data-auto-turning={autoBusy}
      inert={autoBusy || undefined}
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
        {exercise.checksum && (
          <div className="full-share-strip">
            <strong>Complete share {exercise.output[8]} · 48 characters</strong>
            <code aria-label="Complete share on your worksheet">
              {grouped(visibleShare(exercise, progress, example))}
            </code>
            <p>
              MS1 prefix · {exercise.output.slice(3, 9)} header · 26 random
              characters · 13 checksum characters.
              {!exercise.verification &&
                !example &&
                ' The ? spaces fill as you recover the checksum on the upward pass.'}{' '}
              The calculation includes the header after MS1, your random
              characters and the checksum.
            </p>
          </div>
        )}
        {!done && (
          <>
            <div className="lesson-route">
              <span>{guide.phase}</span>
              {guide.position && <span>{guide.position}</span>}
            </div>
            {step.id === 'prefill' && !exercise.verification && (
              <aside className="checksum-givens">
                <strong>The book’s fixed rows are already filled in.</strong>
                <p>
                  <code>SECRETSHARE32</code> is the fixed target: a valid
                  share’s checksum calculation ends at this row. We use it at
                  the bottom of the worksheet to solve upward later. It is not
                  your secret or your share’s checksum.
                </p>
                <p>
                  Start here by adding the beginning of your share to the book’s
                  printed starting row, <code>33XW87RR3YLJG</code>.
                </p>
                <details>
                  <summary>Why does every share use the same target?</summary>
                  <p>
                    The target is the agreed finishing row. Each share needs its
                    own checksum characters to reach it. Knowing the finish lets
                    you work upward to find those missing characters. Later, you
                    check a complete share by working downward: the last row
                    must read <code>SECRETSHARE32</code>. A different result
                    means something was copied or calculated incorrectly.
                  </p>
                  <p>
                    This public target adds no randomness. Your random
                    characters in shares A and C are what create the test key.
                  </p>
                </details>
              </aside>
            )}
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
                onPrimary={(primary) => chooseOperand('primary', primary)}
                onTurn={(primary) => patch({ primary })}
                onOther={(other) => chooseOperand('other', other)}
                guided={{ primary: left!, other: right! }}
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
                <button
                  type="button"
                  className="secondary-button"
                  aria-pressed={view.tableFirst === step.key![0]}
                  onClick={() =>
                    patch({ tableFirst: step.key![0], tableOpen: false })
                  }
                >
                  1. Choose row {step.key![0]}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={view.tableFirst !== step.key![0]}
                  aria-pressed={
                    view.tableFirst === step.key![0] &&
                    view.tableSecond === step.key![1]
                  }
                  onClick={() =>
                    patch({ tableSecond: step.key![1], tableOpen: false })
                  }
                >
                  2. Choose column {step.key![1]}
                </button>
                <button
                  className="secondary-button"
                  disabled={
                    view.tableFirst !== step.key![0] ||
                    view.tableSecond !== step.key![1]
                  }
                  onClick={() => patch({ tableOpen: true })}
                >
                  Look up this pair
                </button>
              </div>
              {view.tableOpen &&
                view.tableFirst === step.key![0] &&
                view.tableSecond === step.key![1] && (
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
              : 'Entry ' +
                (at + 1 - givenCount) +
                ' of ' +
                (exercise.steps.length - givenCount)}
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
            <BookButton onClick={onContinue}>
              Continue <ArrowRight size={17} />
            </BookButton>
            <button className="text-button" onClick={() => visit(0)}>
              Review my steps
            </button>
            {!exercise.checksum && target === 'S' && (
              <SecretResult
                secret={exercise.output}
                addresses={session.addresses}
              />
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
                <div
                  className={
                    'column-instruction' + (guided ? ' has-columns' : '')
                  }
                >
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
                    onPrimary={(primary) => chooseOperand('primary', primary)}
                    onOther={(other) => chooseOperand('other', other)}
                    expected={{ primary: left!, other: right! }}
                    factorSide={view.factorSide}
                  />
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
            {!example && !reviewing && (
              <div className="auto-workbook-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={autoBusy}
                  onClick={autoLetter}
                >
                  Auto-complete next letter
                </button>
                {
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={autoBusy}
                    onClick={() => {
                      const result = autoExercise(exercise, progress);
                      if (!result.correct) return;
                      setError('');
                      onChange(result.progress);
                      if (result.complete) onComplete();
                    }}
                  >
                    {exercise.verification
                      ? 'Auto-complete this verification'
                      : exercise.checksum
                        ? 'Auto-complete this checksum'
                        : 'Auto-complete this section'}
                  </button>
                }
                <p>
                  {autoBusy
                    ? 'Turning the wheel, then recording the next letter…'
                    : 'Optional shortcuts perform the same worksheet calculations. You can review every filled row.'}
                </p>
              </div>
            )}
            <div className="checksum-actions">
              <button
                className="secondary-button"
                disabled={at === givenCount}
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
            {progress.answers.length - givenCount} /{' '}
            {exercise.steps.length - givenCount} steps checked
          </span>
          <progress
            max={exercise.steps.length - givenCount}
            value={progress.answers.length - givenCount}
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
        {!example && progress.answers.length > givenCount && (
          <button
            className="text-button restart-lesson"
            onClick={() => {
              if (
                window.confirm(
                  'Erase the checked steps and answers in this worksheet? Your other worksheets are kept.',
                )
              ) {
                setError('');
                onChange(prepareLesson(exercise));
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
