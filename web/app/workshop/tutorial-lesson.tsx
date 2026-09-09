'use client';
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import BookButton from '@/components/book-button';
import { Input } from '@/components/ui/input';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import { grouped } from '@/lib/practice';
import {
  editLesson,
  normalizeAnswer,
  type LessonProgress,
} from '@/lib/workbook';
import {
  autoStage,
  finishTutorialReading,
  confirmTutorialReading,
  confirmTutorialRow,
  instrumentHandoff,
  openNextStage,
  tutorialCalculation,
  workbookStage,
  visibleShare,
  visibleTranslation,
  stepGuide,
} from '@/lib/workbook-guide';
import { alphabet, symbol, wheelData } from '@/lib/workshop';
import ManualLesson from './manual-lesson';
import PaperReference, {
  DerivationTable,
  ShareHeader,
} from './paper-reference';
import Wheel, { wheelAnswer, type WheelKind } from './wheel';
import SecretResult from './secret-result';
import MathExplanation from './math-explanation';
import StableMessage from './stable-message';

type Props = ComponentProps<typeof ManualLesson> & {
  onContinue: () => void;
  continueLabel: string;
  onReset: () => void;
};

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
    onContinue,
    continueLabel,
    onReset,
  } = props;
  const [paper, setPaper] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<string | null>(null);
  const [error, setError] = useState('');
  const pending = useRef<LessonProgress | null>(null);
  const readingId = useId();
  const next = tutorialCalculation(exercise, progress, target);
  const done = progress.answers.length === exercise.steps.length;
  const handoff = instrumentHandoff(exercise, progress);
  const at = done || handoff ? progress.answers.length - 1 : next.cursor;
  const step = exercise.steps[at];
  const stage = workbookStage(exercise, at)!;
  const followingStage = handoff
    ? workbookStage(exercise, handoff.cursor)
    : null;
  const paused = done || Boolean(handoff);
  const view = paused ? progress : next;
  const kind = step.kind as WheelKind;
  const column = Math.min(
    paused ? progress.column : next.column,
    (step.right?.length ?? 1) - 1,
  );
  const left = step.left?.[column] ?? 'Q';
  const right = step.right?.[column] ?? 'Q';
  const primary =
    kind === 'translation' && view.primary === 'Q' ? 'P' : view.primary;
  const derivationFactor = kind === 'recovery' && target === 'D';
  const unknownCell = kind === 'addition' && (left === '?' || right === '?');
  const mixedAddition =
    kind === 'addition' &&
    step.answer.includes('?') &&
    !/^\?+$/.test(step.answer);
  const hasWheel =
    !derivationFactor &&
    ['addition', 'translation', 'recovery'].includes(kind) &&
    alphabet.includes(left) &&
    alphabet.includes(right);
  const fusion = kind === 'translation' && view.factorSide && !paused;
  const aligned = primary === left;
  const factorHeld = kind === 'translation' && !view.factorSide && aligned;
  const answer =
    hasWheel && !fusion
      ? wheelAnswer(engine, kind, primary, right, target)
      : null;
  const canConfirm =
    !paused &&
    !busy &&
    hasWheel &&
    !fusion &&
    aligned &&
    answer === step.answer[column];
  const translation = visibleTranslation(exercise, progress, at);
  const displayedShare = visibleShare(exercise, progress);
  const isRecovery = !exercise.checksum && target === 'S';
  const guide = stepGuide(step, Boolean(exercise.checksum), target);
  const stageResult = exercise.steps
    .slice(stage.start, stage.end)
    .map(
      (entry, i) =>
        progress.answers[stage.start + i] ??
        (stage.start + i === next.cursor
          ? normalizeAnswer(next.draft).padEnd(entry.answer.length, '·')
          : '·'.repeat(entry.answer.length)),
    )
    .join('');

  function patch(change: Partial<LessonProgress>) {
    onChange(editLesson(next, change, false));
  }
  function record(result: ReturnType<typeof finishTutorialReading>) {
    if (!result.correct) {
      setError('Check the current entry. Your previous answers are kept.');
      return;
    }
    setError('');
    onChange(result.progress);
    if (result.complete) onComplete();
  }
  function confirmLetter() {
    if (!canConfirm) return;
    setWritten(answer);
    record(confirmTutorialReading(engine, exercise, next, target));
  }
  function confirmEntry() {
    if (paused || busy || fusion) return;
    if (hasWheel) confirmLetter();
    else if (unknownCell) {
      setWritten('?');
      record(finishTutorialReading(exercise, next, target));
    } else record(confirmTutorialRow(exercise, next));
  }
  function autoLetter() {
    if (paused || busy || fusion) return;
    setError('');
    if (hasWheel) {
      const alignedProgress = { ...next, primary: left, other: right };
      pending.current = alignedProgress;
      setBusy(true);
      onChange(alignedProgress);
    } else {
      const selected =
        step.kind === 'lookup'
          ? {
              ...next,
              tableFirst: step.key![0],
              tableSecond: step.key![1],
              tableOpen: true,
            }
          : next;
      record(finishTutorialReading(exercise, selected, target));
    }
  }
  useEffect(() => {
    const task = pending.current;
    if (!task) return;
    if (!active || example || paper || task !== progress) {
      pending.current = null;
      setBusy(false);
      return;
    }
    const timer = setTimeout(() => {
      pending.current = null;
      setBusy(false);
      const result = finishTutorialReading(exercise, progress, target);
      if (result.correct) {
        const current = exercise.steps[progress.cursor];
        setWritten(
          current.answer[Math.min(progress.column, current.answer.length - 1)],
        );
        onChange(result.progress);
        if (result.complete) onComplete();
      } else
        setError('Check the current entry. Your previous answers are kept.');
    }, 650);
    return () => clearTimeout(timer);
  }, [
    active,
    example,
    paper,
    exercise,
    progress,
    target,
    onChange,
    onComplete,
  ]);

  function fillStage() {
    if (paused || busy) return;
    if (fusion) {
      // Setting the reverse face is separate from flipping/reading it.
      patch({ primary: left });
      return;
    }
    const result = autoStage(exercise, next);
    if (result.correct)
      setWritten(
        exercise.steps[result.progress.answers.length - 1].answer.at(-1)!,
      );
    record(result);
  }
  function continueStage() {
    if (busy) return;
    setError('');
    setWritten(null);
    if (done) {
      if (isRecovery) setShowSecret(true);
      onContinue();
    } else if (handoff) onChange(openNextStage(exercise, progress));
    else if (fusion && aligned) patch({ factorSide: false });
  }
  function reset() {
    pending.current = null;
    setBusy(false);
    setWritten(null);
    setError('');
    setPaper(false);
    setShowSecret(false);
    onReset();
  }

  if (example) return <ManualLesson {...props} />;
  if (paper)
    return (
      <div className="paper-mode">
        <button
          className="secondary-button return-tutorial"
          onClick={() => setPaper(false)}
        >
          ← Back to the guided book steps
        </button>
        <ManualLesson {...props} />
      </div>
    );
  if (done && isRecovery && showSecret)
    return (
      <>
        <SecretResult secret={exercise.output} addresses={session.addresses} />
        <button className="text-button" onClick={() => setShowSecret(false)}>
          Review the completed worksheet
        </button>
      </>
    );

  return (
    <section
      className="tutorial-lesson"
      data-auto-turning={busy}
      aria-busy={busy}
      data-book-stage={stage.key}
    >
      <header className="tutorial-heading">
        <h2>
          {exercise.verification
            ? 'Check the complete share.'
            : exercise.checksum
              ? 'Give share ' + exercise.output[8] + ' its checksum.'
              : isRecovery
                ? 'Reveal secret.'
                : 'Make another share.'}
        </h2>
        <p>
          {exercise.verification
            ? 'Follow the book’s fresh-copy check: copy all 48 characters, then work downward to SECRETSHARE32.'
            : exercise.checksum
              ? 'Follow the worksheet down, then solve upward to find the checksum. Try a few entries; auto-fill can finish the current step.'
              : isRecovery
                ? 'Find factors with the recovery wheel, set and flip the translation instrument for each share, then add the two working rows.'
                : 'Read the book’s factors for D, set and flip the translation instrument for A and C, then add their working rows. No new randomness is needed.'}
        </p>
      </header>
      <div className="tutorial-share" aria-label="Share progress">
        <div className="tutorial-share-label">
          <span>
            {exercise.checksum
              ? 'Share ' + exercise.output[8]
              : isRecovery
                ? 'Secret · share S'
                : 'Share D'}
          </span>
          <span>
            {displayedShare.replace(/\?/g, '').length} / {displayedShare.length}{' '}
            characters
          </span>
        </div>
        <code>{grouped(displayedShare)}</code>
        {!exercise.checksum && (
          <ol className="tutorial-stages" aria-label="Calculation stages">
            <li aria-current={kind === 'recovery' ? 'step' : undefined}>
              1. {target === 'D' ? 'Derivation table' : 'Recovery wheel'}
            </li>
            <li aria-current={kind === 'translation' ? 'step' : undefined}>
              2. Set → flip → translate each share
            </li>
            <li aria-current={kind === 'addition' ? 'step' : undefined}>
              3. Addition wheel
            </li>
          </ol>
        )}
        <Progress
          value={(100 * progress.answers.length) / exercise.steps.length}
        >
          <ProgressLabel>
            {done ? 'Worksheet complete' : 'Worksheet progress'}
          </ProgressLabel>
          <ProgressValue>
            {() =>
              progress.answers.length +
              ' / ' +
              exercise.steps.length +
              ' checked entries'
            }
          </ProgressValue>
        </Progress>
        <small>
          {exercise.checksum
            ? exercise.verification
              ? 'A valid complete share finishes at the book’s fixed target, SECRETSHARE32.'
              : 'The ? spaces are unknown checksum characters. They fill on the upward pass.'
            : 'Factors and translations fill working rows. Only the final additions fill the share above.'}
        </small>
        {translation && (
          <div className="tutorial-translation-row">
            <span>Translating share {translation.source} · working row</span>
            <code>{grouped(translation.value)}</code>
          </div>
        )}
      </div>
      <div className="tutorial-reset-row">
        <button className="text-button tutorial-reset" onClick={reset}>
          Reset this section
        </button>
        <span>Your key and the other worksheets are kept.</span>
      </div>
      <div className="tutorial-grid">
        <div className="tutorial-instrument">
          <p className="tutorial-current-step">
            {stage.title} · {guide.position || stage.tool}
            {kind === 'addition' && exercise.checksum && (
              <> · Column {column + 1} of 13</>
            )}
          </p>
          <p className="tutorial-instruction">
            {paused ? (
              'Step complete. Review it, then choose Next.'
            ) : fusion ? (
              <>
                Set symbol{' '}
                <b>
                  {symbol(left)} ({left})
                </b>{' '}
                on the fusion side.
              </>
            ) : unknownCell ? (
              'Keep this cell as ?. No turn needed.'
            ) : !hasWheel ? (
              step.instruction
            ) : kind === 'addition' ? (
              <>
                Turn to <b>{left}</b>. Read window <b>{right}</b>.
              </>
            ) : kind === 'translation' ? (
              <>
                {aligned ? 'Wheel set to ' : 'Set factor '}
                <b>{left}</b>
                {aligned ? ' — no turning needed.' : '.'} Read <b>{right}</b>.
              </>
            ) : (
              <>
                Point to share <b>{left}</b>. Read share <b>{right}</b>.
              </>
            )}
          </p>
          {kind === 'translation' && (
            <p className="tutorial-factor-note">
              {fusion
                ? 'Fusion and translation are the two faces of one paper instrument. For two shares, set the single factor in the handle window, then flip without changing it.'
                : 'Keep the handle at the purple factor mark for this entire share. The blue character changes; it is not a new setting.'}
            </p>
          )}
          {hasWheel || mixedAddition ? (
            <div className="book-instrument-stack">
              <div
                className="book-wheel-slot"
                aria-hidden={unknownCell || undefined}
                inert={unknownCell}
              >
                <Wheel
                  key={kind}
                  engine={engine}
                  kind={kind}
                  primary={unknownCell ? 'Q' : view.primary}
                  other={unknownCell ? 'Q' : right}
                  target={target}
                  onPrimary={(value) => {
                    if (hasWheel && !paused && !busy && !factorHeld)
                      patch({ primary: value });
                  }}
                  onTurn={(value) => {
                    if (hasWheel && !paused && !busy && !factorHeld)
                      patch({ primary: value });
                  }}
                  onOther={() => {}}
                  guided={
                    unknownCell
                      ? { primary: 'Q', other: 'Q' }
                      : { primary: left, other: right }
                  }
                  controls={false}
                  factorSide={view.factorSide}
                  onFactorSide={() => {}}
                  showFlip={false}
                  translationGuide={
                    kind === 'translation' && !fusion
                      ? {
                          locked: factorHeld || paused,
                          disabled: busy,
                          onAdjust: paused
                            ? undefined
                            : () => patch({ factorSide: true }),
                        }
                      : undefined
                  }
                />
              </div>
              {unknownCell && (
                <div className="paper-reference">
                  <h3>This cell is not known yet.</h3>
                  <p>
                    A ? keeps the place of a pink cell left blank in the book.
                    Confirm the placeholder; the upward pass will find the
                    missing value. No wheel calculation is needed for this cell.
                  </p>
                </div>
              )}
            </div>
          ) : derivationFactor ? (
            <DerivationTable />
          ) : step.kind === 'addition' ? (
            <div className="paper-reference">
              <h3>This cell is not known yet.</h3>
              <p>
                A ? marks a pink cell left blank in the book. Keep its place; do
                not invent a wheel result. The upward pass will find the missing
                characters.
              </p>
              <code>
                {step.left}
                <br />
                {step.right}
              </code>
            </div>
          ) : (
            <PaperReference step={step} />
          )}
          {step.kind === 'lookup' && (
            <div className="table-reference">
              <h3>Checksum table · pair {step.key}</h3>
              <p>
                The first character selects the row; the second selects the
                column.
              </p>
              <div className="table-pickers">
                <button
                  className="secondary-button"
                  disabled={paused}
                  onClick={() =>
                    patch({ tableFirst: step.key![0], tableOpen: false })
                  }
                >
                  1. Choose row {step.key![0]}
                </button>
                <button
                  className="secondary-button"
                  disabled={paused || view.tableFirst !== step.key![0]}
                  onClick={() =>
                    patch({ tableSecond: step.key![1], tableOpen: true })
                  }
                >
                  2. Choose column {step.key![1]}
                </button>
              </div>
              <output className="book-table-result" aria-live="polite">
                <span>Selected table entry</span>
                <code>
                  {paused ||
                  (view.tableOpen &&
                    view.tableFirst === step.key![0] &&
                    view.tableSecond === step.key![1])
                    ? wheelData.checksumTable[alphabet.indexOf(step.key![0])][
                        alphabet.indexOf(step.key![1])
                      ]
                    : '·············'}
                </code>
              </output>
            </div>
          )}
          {exercise.checksum && ['endpoint', 'prefill'].includes(step.id) && (
            <ShareHeader exercise={exercise} />
          )}
        </div>
        <div className="tutorial-controls">
          {!exercise.checksum && (
            <div className="tutorial-factors" aria-label="Recorded factors">
              {exercise.steps.slice(0, 2).map((factor, i) => (
                <div key={factor.id}>
                  <span>Factor for share {factor.left}</span>
                  <b>
                    {progress.answers[i] === factor.answer
                      ? factor.answer
                      : '?'}
                  </b>
                </div>
              ))}
            </div>
          )}
          <div className="tutorial-entry">
            <label htmlFor={readingId}>
              {fusion
                ? 'Factor in the handle window'
                : unknownCell
                  ? 'Unknown worksheet cell'
                  : hasWheel
                    ? kind === 'recovery'
                      ? 'Setting from the wheel'
                      : 'Character from the wheel'
                    : derivationFactor
                      ? 'Factor from the table'
                      : 'Your worksheet entry'}
            </label>
            <Input
              id={readingId}
              className={
                hasWheel || derivationFactor || unknownCell
                  ? 'tutorial-wheel-character'
                  : 'book-row-input'
              }
              value={
                unknownCell
                  ? '?'
                  : fusion
                    ? primary
                    : hasWheel
                      ? (answer ?? '')
                      : paused
                        ? step.answer
                        : next.draft
              }
              readOnly={hasWheel || unknownCell || paused}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(event) =>
                patch({ draft: normalizeAnswer(event.target.value) })
              }
              aria-describedby={`${readingId}-help`}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                confirmEntry();
              }}
            />
            <output
              id={`${readingId}-help`}
              aria-live="polite"
              aria-atomic="true"
            >
              <StableMessage
                active={
                  paused
                    ? 0
                    : fusion
                      ? 1
                      : busy
                        ? 2
                        : hasWheel
                          ? canConfirm
                            ? 3
                            : 4
                          : unknownCell
                            ? 6
                            : 5
                }
                messages={[
                  'This step is recorded. Review the result below, then choose Next.',
                  `Set ${symbol(left)} (${left}) in the handle window. Next flips the same instrument to its translation face.`,
                  'Auto-fill is setting the wheel and recording one entry…',
                  kind === 'translation'
                    ? `Read ${right} → ${answer}. Confirm ${answer}. Leave the wheel at ${left}.`
                    : 'Correct setting. Confirm to record this entry.',
                  `Turning the wheel fills this box. Turn to ${left} before you confirm; nothing is recorded yet.`,
                  'Copy the entry from the paper reference, or auto-fill one character at a time. Only a correct complete entry can be confirmed.',
                  'This cell stays unknown on the downward pass. Confirm ? to keep its place, without inventing a calculated character.',
                ]}
              />
            </output>
            <BookButton
              disabled={
                hasWheel
                  ? !canConfirm
                  : paused ||
                    busy ||
                    (!unknownCell &&
                      normalizeAnswer(next.draft) !== step.answer)
              }
              onClick={confirmEntry}
            >
              {unknownCell
                ? 'Confirm unknown cell'
                : kind === 'recovery'
                  ? 'Confirm factor'
                  : hasWheel
                    ? 'Confirm character'
                    : 'Confirm entry'}
            </BookButton>
          </div>
          {/* Keep controls and result slots mounted: a recorded letter must
              not insert a new button or push the page down. */}
          <button
            className="secondary-button"
            disabled={paused || busy || fusion}
            onClick={autoLetter}
          >
            Auto-fill next {kind === 'recovery' ? 'factor' : 'letter'}
          </button>
          <output className="tutorial-recorded" aria-live="polite">
            <span>Last letter recorded:</span>
            <b>{written ?? '—'}</b>
          </output>
          <div className="book-stage-result" aria-label="Current step result">
            <span>{paused ? 'Completed step' : 'This step so far'}</span>
            <code>{grouped(stageResult)}</code>
          </div>
          <div className="book-stage-actions">
            <button
              className="secondary-button"
              disabled={paused || busy}
              onClick={fillStage}
            >
              {fusion ? 'Auto-set this factor' : 'Auto-fill this step'}
            </button>
            <p>
              Fills only this step. Next is a separate action; no later wheel or
              worksheet is completed for you.
            </p>
            <BookButton
              disabled={busy || !(paused || (fusion && aligned))}
              onClick={continueStage}
            >
              {done
                ? isRecovery
                  ? 'View recovered secret'
                  : continueLabel
                : handoff
                  ? 'Next: ' + followingStage!.tool
                  : fusion
                    ? 'Next: Flip to translation'
                    : 'Next step'}{' '}
              →
            </BookButton>
          </div>
          <output className="book-next-preview" aria-live="polite">
            {done ? (
              exercise.verification ? (
                'The complete share checks out. Your final row is SECRETSHARE32.'
              ) : (
                'Worksheet complete. Review your result before continuing.'
              )
            ) : handoff ? (
              <>
                Up next: {followingStage!.title}.{' '}
                {handoff.next.kind === 'translation'
                  ? 'Set the factor on the fusion side, then flip the same instrument to read this share.'
                  : handoff.next.kind === 'addition'
                    ? 'Use the addition wheel to combine the two rows.'
                    : 'This is table or worksheet work, not a wheel turn.'}
              </>
            ) : fusion ? (
              'The sun and fusion faces belong to the same paper instrument, not two separate wheels.'
            ) : (
              'Try a few entries to learn the operation. Auto-fill this step finishes the rest of this row or factor lookup.'
            )}
          </output>
          <p role="alert" className="book-entry-error">
            {error}
          </p>
          <MathExplanation
            exercise={exercise}
            step={step}
            column={column}
            target={target}
          />
          <a
            className="text-button"
            href={
              wheelData.sources.paper +
              '#page=' +
              (exercise.verification && step.kind !== 'lookup'
                ? 21
                : guide.page)
            }
            target="_blank"
            rel="noreferrer"
          >
            Read this step in the book ↗
          </a>
          <button className="text-button" onClick={() => setPaper(true)}>
            Open the paper worksheet
          </button>
        </div>
      </div>
    </section>
  );
}
