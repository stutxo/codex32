'use client';
import { useEffect, useId, useRef, useState, type ComponentProps } from 'react';
import BookButton from '@/components/book-button';
import WorkshopActions from '@/components/workshop-actions';
import { Input } from '@/components/ui/input';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import { grouped } from '@/lib/practice';
import {
  editLesson,
  emptyLesson,
  visitLesson,
  type LessonProgress,
} from '@/lib/workbook';
import {
  autoExercise,
  finishTutorialReading,
  confirmTutorialReading,
  instrumentHandoff,
  tutorialCalculation,
  visibleShare,
  readingProgress,
  visibleTranslation,
  stepGuide,
} from '@/lib/workbook-guide';
import ManualLesson from './manual-lesson';
import Wheel, { wheelAnswer, type WheelKind } from './wheel';
import SecretResult from './secret-result';
import MathExplanation from './math-explanation';
import StableMessage from './stable-message';
import { alphabet } from '@/lib/workshop';

type Props = ComponentProps<typeof ManualLesson> & {
  onSkipPaper?: () => void;
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
    onSkipPaper,
    onContinue,
    continueLabel,
    onReset,
  } = props;
  const [paper, setPaper] = useState(false);
  const [busy, setBusy] = useState(false);
  const [written, setWritten] = useState<{
    value: string;
    example: boolean;
    cursor: number;
  } | null>(null);
  const [error, setError] = useState('');
  const [adjustingFactor, setAdjustingFactor] = useState<string | null>(null);
  const readingId = useId();
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
  const handoff = example ? null : instrumentHandoff(exercise, progress);
  const step = handoff?.previous ?? exercise.steps[next.cursor];
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
  const translationPractice = kind === 'translation' && !example;
  const factorStep = exercise.output + ':' + step?.id;
  const factorHeld =
    translationPractice &&
    aligned &&
    (Boolean(handoff) || adjustingFactor !== factorStep);
  const readings = readingProgress(exercise, progress);
  const translation = visibleTranslation(
    exercise,
    progress,
    handoff ? handoff.cursor - 1 : next.cursor,
  );
  const displayedShare = visibleShare(exercise, progress, example);
  const title = exercise.verification
    ? 'Check the complete share.'
    : exercise.checksum
      ? 'Give share ' + exercise.output[8] + ' its checksum.'
      : target === 'D'
        ? 'Make another share.'
        : 'Reveal secret.';
  const description = exercise.verification
    ? 'On paper, you recopy the complete share and calculate again to catch mistakes. Here the computer can check it for you.'
    : exercise.checksum
      ? 'A checksum catches copying mistakes. Try a turn or finish this share.'
      : target === 'D'
        ? 'Turn the wheel to make D from A and C. No new randomness is needed.'
        : 'Use shares ' +
          exercise.steps[0].left +
          ' and ' +
          exercise.steps[1].left +
          ' to rebuild S, the complete secret. The three wheels do different jobs: find settings, translate shares, then combine the results.';
  const isRecovery = !exercise.checksum && target === 'S';
  const canConfirm =
    hasWheel &&
    aligned &&
    answer !== null &&
    answer === step?.answer[column] &&
    !busy &&
    !done &&
    !handoff;
  const currentWritten =
    written?.example === example && (!example || written.cursor === next.cursor)
      ? written
      : null;
  function patch(change: Partial<LessonProgress>) {
    onChange(editLesson(progress, change, example));
  }
  function turnWheel(value: string) {
    if (factorHeld) return;
    if (value !== primary) setAdjustingFactor(null);
    patch({ primary: value });
  }
  function confirmLetter() {
    if (example || !canConfirm) return;
    const result = confirmTutorialReading(engine, exercise, progress, target);
    if (!result.correct) {
      setError(
        'This reading could not be recorded. Check the wheel setting and try again.',
      );
      return;
    }
    setError('');
    setAdjustingFactor(null);
    setWritten({ value: answer!, example: false, cursor: next.cursor });
    onChange(result.progress);
    if (result.complete) onComplete();
  }
  function autoLetter() {
    if (!step || !hasWheel || busy || done || handoff) return;
    setError('');
    setAdjustingFactor(null);
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
      const result = finishTutorialReading(exercise, progress, target);
      if (result.correct)
        setWritten({
          value: task.letter,
          example: false,
          cursor: progress.cursor,
        });
      else
        setError(
          'Your saved row needs a correction. Open the paper worksheet to edit it, or use Auto-complete section.',
        );
      onChange(result.progress);
      if (result.complete) onComplete();
    }, 650);
    return () => clearTimeout(timer);
  }, [
    active,
    example,
    paper,
    exercise,
    progress,
    onChange,
    onComplete,
    target,
  ]);
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
  function reset() {
    pending.current = null;
    setBusy(false);
    setWritten(null);
    setError('');
    setAdjustingFactor(null);
    setPaper(false);
    onReset();
  }
  const resetButton = !example && (
    <button className="text-button tutorial-reset" onClick={reset}>
      Reset this section
    </button>
  );
  const shareProgress = (
    <div className="tutorial-share" aria-label="Share progress">
      <div className="tutorial-share-label">
        <span>
          {exercise.checksum
            ? 'Share ' + exercise.output[8]
            : target === 'D'
              ? 'Share D'
              : 'Secret · share S'}
        </span>
        <span>
          {displayedShare.replace(/\?/g, '').length} / {displayedShare.length}{' '}
          characters
        </span>
      </div>
      <code>{grouped(displayedShare)}</code>
      {!exercise.checksum && !done && (
        <ol className="tutorial-stages" aria-label="Calculation stages">
          <li aria-current={kind === 'recovery' ? 'step' : undefined}>
            1. {target === 'D' ? 'Look up factors' : 'Find two wheel settings'}
          </li>
          <li aria-current={kind === 'translation' ? 'step' : undefined}>
            2. Translate both shares
          </li>
          <li aria-current={kind === 'addition' ? 'step' : undefined}>
            3. {isRecovery ? 'Combine into the secret' : 'Add the rows'}
          </li>
        </ol>
      )}
      <Progress
        value={readings.total ? (readings.completed / readings.total) * 100 : 0}
      >
        <ProgressLabel>
          {done ? 'Section complete' : 'Worksheet progress'}
        </ProgressLabel>
        <ProgressValue>
          {() => readings.completed + ' / ' + readings.total + ' readings'}
        </ProgressValue>
      </Progress>
      {!done && (
        <small>
          {exercise.checksum
            ? 'The ? spaces fill as you solve the checksum on the way back up.'
            : isRecovery
              ? 'The secret stays blank while you find settings and translate shares. Confirmed additions fill its ? spaces in the final stage.'
              : 'Translate each row first, then add them to fill the ? spaces in the final share.'}
        </small>
      )}
      {translation && !done && (
        <div className="tutorial-translation-row">
          <span>Translating share {translation.source} · working row</span>
          <code>{grouped(translation.value)}</code>
        </div>
      )}
    </div>
  );
  const sectionActions = !example && (
    <WorkshopActions
      label={
        done
          ? isRecovery
            ? 'View recovered secret'
            : continueLabel
          : 'Auto-complete section'
      }
      description={
        done
          ? isRecovery
            ? 'Your secret is recovered. View it with the wallet import instructions.'
            : 'This section is complete. Review your result above, then choose Next.'
          : isRecovery
            ? 'Fills all remaining answers and shows your recovered secret.'
            : 'Fills all remaining answers in this section. Review the result, then choose Next.'
      }
      disabled={busy}
      onAction={
        done ? (isRecovery ? () => setPaper(false) : onContinue) : complete
      }
    />
  );
  if (paper)
    return (
      <div className="paper-mode">
        <button
          className="secondary-button return-tutorial"
          onClick={() => setPaper(false)}
        >
          ← Back to the quick tutorial
        </button>
        {shareProgress}
        {sectionActions}
        {resetButton}
        <ManualLesson {...props} active={active} />
      </div>
    );
  if (done && !exercise.checksum && target === 'S')
    return (
      <>
        <div className="tutorial-reset-row">
          {resetButton}
          <span>Your key and the other worksheets are kept.</span>
        </div>
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
      </header>
      {shareProgress}
      {sectionActions}
      <div className="tutorial-reset-row">
        {resetButton}
        {!example && <span>Your key and the other worksheets are kept.</span>}
      </div>
      {done ? (
        <output className="tutorial-completion">
          {exercise.verification
            ? 'Paper verification complete.'
            : 'Complete. The computer has checked this share.'}{' '}
          Your result is shown above. Continue when you’re ready.
        </output>
      ) : (
        <>
          {exercise.verification && onSkipPaper && !example && (
            <div className="paper-check-choice">
              <button className="text-button" onClick={onSkipPaper}>
                Skip the paper worksheet: check share and continue →
              </button>
              <button className="text-button" onClick={() => setPaper(true)}>
                Try the paper verification instead
              </button>
            </div>
          )}
          <div className="tutorial-grid">
            <div className="tutorial-instrument">
              {hasWheel && !done && !handoff && (
                <>
                  {isRecovery && (
                    <p className="tutorial-purpose">
                      {kind === 'recovery'
                        ? 'First, find one setting (called a factor) for each share. These are settings for the next wheel, not letters of your secret.'
                        : kind === 'translation'
                          ? 'Use the same translation wheel for both shares, with a different factor for each. Use factor ' +
                            left +
                            ' for share ' +
                            translation?.source +
                            '. Each confirmed character fills its working row, not the secret yet.'
                          : 'The addition wheel combines the two working rows, one column at a time. Each character you confirm fills the secret above.'}
                    </p>
                  )}
                  <p className="tutorial-current-step">
                    {stepGuide(step, Boolean(exercise.checksum), target).phase}{' '}
                    ·{' '}
                    {kind === 'recovery'
                      ? 'Factor ' + (next.cursor + 1) + ' of 2'
                      : step.position
                        ? 'Position ' + step.position + ' of 48'
                        : 'Column ' +
                          (column + 1) +
                          ' of ' +
                          step.answer.length}
                  </p>
                  <p className="tutorial-instruction">
                    {kind === 'addition' ? (
                      <>
                        Turn to <b>{left}</b>. Read window <b>{right}</b>.
                      </>
                    ) : kind === 'translation' ? (
                      translationPractice ? (
                        <>
                          <StableMessage
                            active={factorHeld ? 0 : aligned ? 1 : 2}
                            messages={[
                              <>
                                Wheel set to <b>{left}</b> — no turning needed.
                              </>,
                              <>
                                Adjusting factor <b>{left}</b>. Keep this
                                setting to read.
                              </>,
                              <>
                                Set the handle to factor <b>{left}</b> for share{' '}
                                <b>{translation?.source}</b>.
                              </>,
                            ]}
                          />
                        </>
                      ) : (
                        <>
                          {aligned ? 'Keep' : 'Set'} factor <b>{left}</b> for
                          share <b>{translation?.source}</b>. Read character{' '}
                          <b>{right}</b>.
                        </>
                      )
                    ) : (
                      <>
                        Point to share <b>{left}</b>. Read share <b>{right}</b>.
                      </>
                    )}
                  </p>
                  {translationPractice ? (
                    <p className="tutorial-factor-note">
                      <StableMessage
                        active={!aligned ? 0 : right === 'Q' ? 1 : 2}
                        messages={[
                          'Line up the handle with the purple factor mark. You only need to set it once for this share.',
                          'Q always reads as Q, as printed on the handle. Keep the same factor.',
                          'Read the blue inner-ring character, then the outer character beside it. The blue mark is not a new handle setting.',
                        ]}
                      />
                    </p>
                  ) : (
                    kind === 'translation' &&
                    !isRecovery && (
                      <p className="tutorial-factor-note">
                        The setting stays fixed for this row. Only the
                        highlighted character changes as you fill each letter.
                      </p>
                    )
                  )}
                </>
              )}
              {hasWheel ? (
                <Wheel
                  key={kind}
                  engine={engine}
                  kind={kind}
                  primary={view.primary}
                  other={right}
                  target={target}
                  onPrimary={turnWheel}
                  onTurn={turnWheel}
                  onOther={() => {}}
                  guided={{ primary: left, other: right }}
                  controls={false}
                  factorSide={false}
                  onFactorSide={() => {}}
                  showFlip={false}
                  translationGuide={
                    translationPractice
                      ? {
                          locked: factorHeld,
                          disabled: busy,
                          onAdjust: handoff
                            ? undefined
                            : () => setAdjustingFactor(factorStep),
                        }
                      : undefined
                  }
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
              {!exercise.checksum && (
                <div className="tutorial-factors" aria-label="Recorded factors">
                  {exercise.steps.slice(0, 2).map((factor, i) => (
                    <div key={factor.id}>
                      <span>Factor for share {factor.left}</span>
                      <b>
                        {example || progress.answers[i] === factor.answer
                          ? factor.answer
                          : '?'}
                      </b>
                    </div>
                  ))}
                </div>
              )}
              {handoff && (
                <div className="tutorial-handoff">
                  <h3>
                    {handoff.next.kind === 'translation'
                      ? 'Settings found. Next, translate the shares.'
                      : isRecovery
                        ? 'Rows translated. Next, build the secret.'
                        : 'Rows translated. Next, build share D.'}
                  </h3>
                  <p>
                    {handoff.next.kind === 'translation'
                      ? 'The recovery wheel has finished its job. Switch to the translation wheel: it uses each setting to convert that share’s characters into a working row. The secret will stay blank until the final addition stage.'
                      : 'The translation wheel has finished both working rows. Switch to the addition wheel: it combines their characters and writes the result into ' +
                        (isRecovery ? 'your secret.' : 'share D.')}
                  </p>
                  <BookButton
                    onClick={() => {
                      setWritten(null);
                      patch({
                        tutorialStage: handoff.next.id,
                        primary: 'Q',
                        other: 'Q',
                        factorSide: false,
                      });
                    }}
                  >
                    {handoff.next.kind === 'translation'
                      ? 'Next: Translation wheel'
                      : 'Next: Addition wheel'}{' '}
                    →
                  </BookButton>
                </div>
              )}
              {hasWheel && !done && !handoff && (
                <>
                  {!example ? (
                    <div className="tutorial-entry">
                      <label htmlFor={readingId}>
                        {kind === 'recovery'
                          ? 'Setting from the wheel'
                          : 'Character from the wheel'}
                      </label>
                      <Input
                        id={readingId}
                        className="tutorial-wheel-character"
                        value={answer ?? ''}
                        placeholder="—"
                        readOnly
                        aria-describedby={`${readingId}-help`}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            confirmLetter();
                          }
                        }}
                      />
                      <output
                        id={`${readingId}-help`}
                        aria-live="polite"
                        aria-atomic="true"
                      >
                        <span className="sr-only">
                          Current wheel reading: {answer ?? 'no reading'}.{' '}
                        </span>
                        <StableMessage
                          active={busy ? 0 : canConfirm ? 1 : 2}
                          messages={[
                            'Auto-fill is setting the wheel and recording this entry…',
                            translationPractice
                              ? `Read ${right} → ${answer}. Confirm ${answer}. Leave the wheel at ${left}.`
                              : 'Correct setting. Confirm to record this ' +
                                (kind === 'recovery'
                                  ? 'factor.'
                                  : 'character.'),
                            `Turning the wheel fills this box. Turn to ${left} before you confirm; nothing is recorded yet.`,
                          ]}
                        />
                      </output>
                      <BookButton
                        disabled={!canConfirm}
                        onClick={confirmLetter}
                      >
                        {kind === 'recovery'
                          ? 'Confirm factor'
                          : 'Confirm character'}
                      </BookButton>
                    </div>
                  ) : (
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
                  )}
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={autoLetter}
                  >
                    {example
                      ? 'Show the correct setting'
                      : kind === 'recovery'
                        ? 'Auto-fill next factor'
                        : 'Auto-fill next letter'}
                  </button>
                  {!example && (
                    <small>
                      <StableMessage
                        active={translationPractice && aligned ? 0 : 1}
                        messages={[
                          'Auto-fill confirms the next character without turning the wheel.',
                          'Auto-fill sets the wheel and confirms one entry for you.',
                        ]}
                      />
                    </small>
                  )}
                  <output
                    className="tutorial-recorded"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    <span>
                      {example
                        ? 'Example result'
                        : kind === 'recovery'
                          ? 'Factor recorded'
                          : 'Last letter recorded'}
                      :
                    </span>
                    <b>{currentWritten?.value ?? '—'}</b>
                  </output>
                </>
              )}
              {error && <p role="alert">{error}</p>}
              {step && !hasWheel && (
                <p>
                  Open the paper worksheet to edit your saved row, or let the
                  computer complete this section.
                </p>
              )}
              <p className="tutorial-progress">
                {progress.answers.length === exercise.steps.length
                  ? 'Section complete'
                  : 'The computer checks each finished share. Paper verification is optional under Examples & tools.'}
              </p>
              <MathExplanation
                exercise={exercise}
                step={step}
                column={column}
                target={target}
              />
              <button className="text-button" onClick={() => setPaper(true)}>
                Open the paper worksheet
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
