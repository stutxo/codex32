'use client';
import Image from 'next/image';
import BookButton from '@/components/book-button';
import { publicAsset } from '@/lib/public-asset';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Link from 'next/link';
import BookCredits from '@/components/book-credits';
import BookHeading from '@/components/book-heading';
import Workbench, { PracticeCards } from '../workbench/workbench';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Dices,
  RotateCcw,
  ShieldCheck,
  WandSparkles,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from '@/components/ui/progress';
import { loadEngine } from '@/lib/engine';
import { grouped, type Engine } from '@/lib/practice';
import {
  checksumWorksheet,
  completePracticeSession,
  publishedSession,
  randomCharacters,
  rollDiceCharacter,
  symbol,
  translationLesson,
  wheelData,
  type DiceResult,
  type Pair,
  type WorkshopSession,
} from '@/lib/workshop';
import Wheel, { wheelAnswer, type WheelKind } from './wheel';
import './workshop.css';

import { initialFlow, workshopFlow, type Phase } from '@/lib/workshop-flow';
const glyphs = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function Lesson({
  engine,
  session,
  pair,
  target,
  onComplete,
  onRestart,
}: {
  engine: Engine;
  session: WorkshopSession;
  pair: Pair;
  target: 'D' | 'S';
  onComplete: () => void;
  onRestart: () => void;
}) {
  const lesson = useMemo(
    () => translationLesson(engine, session, pair, target),
    [engine, session, pair, target],
  );
  const [cursor, setCursor] = useState(6);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<Set<number>>(() => new Set());
  const [primary, setPrimary] = useState('Q');
  const [other, setOther] = useState<string>(pair[1]);
  const [play, setPlay] = useState(false);
  const [playKind, setPlayKind] = useState<WheelKind>('addition');
  const column = lesson.columns[cursor];
  const operations = [
    {
      kind: 'recovery' as const,
      a: pair[0],
      b: pair[1],
      title: `Find the factor for share ${pair[0]}.`,
      instruction: `Point the handle at ${pair[0]}. Read the symbol at ${pair[1]}.`,
      answer: lesson.weights[0],
    },
    {
      kind: 'recovery' as const,
      a: pair[1],
      b: pair[0],
      title: `Now reverse the roles.`,
      instruction: `Point the handle at ${pair[1]}. Read the symbol at ${pair[0]}. This is a different factor.`,
      answer: lesson.weights[1],
    },
    {
      kind: 'translation' as const,
      a: lesson.weights[0],
      b: column.inputs[0],
      title: `Translate share ${pair[0]}’s character.`,
      instruction: `Set factor ${symbol(lesson.weights[0])} (${lesson.weights[0]}). Find ${column.inputs[0]} on the inner ring and read its outer character.`,
      answer: column.translated[0],
    },
    {
      kind: 'translation' as const,
      a: lesson.weights[1],
      b: column.inputs[1],
      title: `Translate share ${pair[1]}’s character.`,
      instruction: `Set factor ${symbol(lesson.weights[1])} (${lesson.weights[1]}), then read ${column.inputs[1]}.`,
      answer: column.translated[1],
    },
    {
      kind: 'addition' as const,
      a: column.translated[0],
      b: column.translated[1],
      title: 'Combine the translated characters.',
      instruction: `Turn to ${column.translated[0]} and read the ${column.translated[1]} window. The answer fills one cell of ${target === 'S' ? 'the secret' : 'share D'}.`,
      answer: column.result,
    },
  ];
  const operation = operations[step];
  const kind = play ? playKind : operation.kind;
  const answer = wheelAnswer(engine, kind, primary, other, target);
  const aligned =
    !play &&
    primary === operation.a &&
    other === operation.b &&
    answer === operation.answer;
  const finished = completed.size === 45;
  function align() {
    setPrimary(operation.a);
    setOther(operation.b as Pair[1]);
  }
  function record() {
    if (!aligned) return;
    if (step < 4) {
      setStep(step + 1);
      return;
    }
    const next = new Set(completed).add(cursor);
    setCompleted(next);
    if (next.size < 45) {
      for (let i = 1; i <= 45; i++) {
        const at = (cursor + i) % 45;
        if (!next.has(at)) {
          setCursor(at);
          break;
        }
      }
      setStep(2);
    } else {
      onComplete();
    }
  }
  function completeRemaining() {
    setCompleted(new Set(Array.from({ length: 45 }, (_, i) => i)));
    onComplete();
  }
  return (
    <>
      <div className="workshop-spread">
        <section className="instrument-page">
          <div className="instrument-switch">
            <button
              className={!play ? 'is-current' : ''}
              onClick={() => {
                setPlay(false);
                align();
              }}
            >
              Guided wheel
            </button>
            <button
              className={play ? 'is-current' : ''}
              onClick={() => {
                setPlay(true);
                setPrimary('N');
                setOther('V');
              }}
            >
              Explore the wheels
            </button>
          </div>
          {play && (
            <label className="play-picker" htmlFor={`play-wheel-${target}`}>
              Choose a wheel
              <NativeSelect
                id={`play-wheel-${target}`}
                value={playKind}
                onChange={(e) => {
                  setPlayKind(e.target.value as WheelKind);
                  setPrimary('A');
                  setOther('C');
                }}
              >
                <NativeSelectOption value="addition">
                  Addition
                </NativeSelectOption>
                <NativeSelectOption value="translation">
                  Translation
                </NativeSelectOption>
                <NativeSelectOption value="recovery">
                  Recovery / derivation
                </NativeSelectOption>
                <NativeSelectOption value="fusion">Fusion</NativeSelectOption>
              </NativeSelect>
            </label>
          )}
          <Wheel
            engine={engine}
            kind={kind}
            primary={primary}
            other={other}
            target={target}
            onPrimary={setPrimary}
            onOther={(value) => setOther(value as Pair[1])}
          />
        </section>
        <section className="worksheet-page">
          <div className="running-head">
            <span>
              {target === 'S' ? 'RECOVERY WORKSHEET' : 'TRANSLATION WORKSHEET'}
            </span>
            <span>
              {pair.join(' + ')} → {target}
            </span>
          </div>
          <div className="lesson-intro">
            <BookHeading
              text={
                target === 'S'
                  ? 'Bring the secret back.'
                  : 'Create a third share.'
              }
            />
            <p>
              {target === 'S'
                ? `Two distinct shares are enough. Translate ${pair[0]} and ${pair[1]}, then add their characters to recover S.`
                : 'The two initial shares define a third. Translate A and C, then add their characters to make D.'}
            </p>
          </div>
          <div className="factor-strip">
            {pair.map((index, row) => (
              <span key={index}>
                Share {index}
                <strong>
                  {symbol(lesson.weights[row])}{' '}
                  <small>({lesson.weights[row]})</small>
                </strong>
                <span>translation factor</span>
              </span>
            ))}
          </div>
          {!finished ? (
            <div className="instruction-card">
              <span className="small-label">
                {step < 2
                  ? `FIND THE FACTORS · ${step + 1} OF 2`
                  : `COLUMN ${column.position} · ${column.region.toUpperCase()}`}
              </span>
              <h3>{operation.title}</h3>
              <p>{operation.instruction}</p>
              <div className="instruction-actions">
                <button
                  className="text-button"
                  onClick={() => {
                    setPlay(false);
                    align();
                  }}
                >
                  <WandSparkles size={15} /> Align for me
                </button>
                <BookButton disabled={!aligned} onClick={record}>
                  {step === 4 ? 'Write this character' : 'Record this result'}{' '}
                  <ArrowRight size={16} />
                </BookButton>
              </div>
              <output
                className={
                  aligned ? 'alignment-status is-correct' : 'alignment-status'
                }
              >
                {aligned
                  ? `Aligned: ${operation.answer} ${step < 2 ? `(${symbol(operation.answer)})` : ''}. Ready to record.`
                  : play
                    ? 'Exploring does not change the worksheet. Return to the guided wheel when ready.'
                    : 'Turn the wheel, or use “Align for me” to follow the example.'}
              </output>
            </div>
          ) : (
            <div className="lesson-success" aria-live="polite">
              <CheckCircle2 size={25} />
              <h3>
                {target === 'S' ? 'Secret recovered.' : 'Share D completed.'}
              </h3>
              <p>
                The 45 worksheet characters match Rust’s result, including the
                checksum.
              </p>
            </div>
          )}
          <div
            className="column-calculation"
            aria-label={`Calculation for column ${column.position}`}
          >
            <span>
              {pair[0]}: <b>{column.inputs[0]}</b> × {lesson.weights[0]} ={' '}
              <b>{column.translated[0]}</b>
            </span>
            <span>
              {pair[1]}: <b>{column.inputs[1]}</b> × {lesson.weights[1]} ={' '}
              <b>{column.translated[1]}</b>
            </span>
            <strong>
              {column.translated.join(' + ')} = {column.result}
            </strong>
          </div>
          <div className="worksheet-progress">
            <Progress value={(completed.size / 45) * 100}>
              <ProgressLabel>Worksheet cells</ProgressLabel>
              <ProgressValue>{() => `${completed.size} / 45`}</ProgressValue>
            </Progress>
          </div>
          <div className="character-worksheet">
            <span className="fixed-prefix">MS1</span>
            <div className="character-cells">
              {lesson.columns.map((c, index) => (
                <button
                  key={c.position}
                  className={`${index === cursor ? 'is-active' : ''} ${completed.has(index) ? 'is-filled' : ''} ${index >= 32 ? 'is-checksum' : ''}`}
                  onClick={() => {
                    setCursor(index);
                    setStep(2);
                    setPlay(false);
                  }}
                  aria-label={`Inspect position ${c.position}, ${c.region}${completed.has(index) ? `, ${c.result}` : ', empty'}`}
                  aria-pressed={index === cursor}
                >
                  {completed.has(index) ? c.result : '·'}
                </button>
              ))}
            </div>
          </div>
          <p className="worksheet-caption">
            MS1 stays fixed. Click any cell to inspect its calculation. Rose
            cells hold the checksum.
          </p>
          <div className="worksheet-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setCompleted(new Set());
                setStep(0);
                setCursor(6);
                setPlay(false);
                setPrimary(pair[0]);
                setOther(pair[1]);
                onRestart();
              }}
            >
              <RotateCcw size={15} /> Start over
            </button>
            <button
              className="text-button"
              disabled={finished}
              onClick={completeRemaining}
            >
              Complete the remaining steps <ArrowRight size={15} />
            </button>
          </div>
          {finished && (
            <div
              className="finished-string"
              data-recovery-result={target === 'S' ? 'true' : undefined}
              tabIndex={-1}
            >
              <span className="small-label">
                {session.kind === 'fresh'
                  ? 'DISPOSABLE EDUCATIONAL'
                  : 'PUBLISHED PRACTICE'}{' '}
                {target === 'S' ? 'SECRET' : 'SHARE D'}
              </span>
              <code>{grouped(lesson.output)}</code>
              {target === 'D' && (
                <BookButton onClick={onComplete}>
                  Continue to recovery <ArrowRight size={16} />
                </BookButton>
              )}
              {target === 'S' && (
                <>
                  <h3>The same test wallet.</h3>
                  <p>
                    {session.kind === 'published'
                      ? 'These Signet addresses match the independently derived published-example expectations.'
                      : 'These Signet addresses match the test seed created at the start of this session.'}
                  </p>
                  <ol className="address-list">
                    {session.addresses.map((address, i) => (
                      <li key={address}>
                        <div>
                          <span>Receive address {i + 1}</span>
                          <span className="match">
                            <Check size={14} /> Match
                          </span>
                        </div>
                        <code>{address}</code>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
        </section>
      </div>
      <aside className="lesson-footnote">
        <BookOpen size={18} />
        <p>
          The paper method translates every character after MS1, including the
          header and checksum. Intermediate translated rows are working data,
          not valid shares on their own.{' '}
          <a href={wheelData.sources.paper} target="_blank" rel="noreferrer">
            See the original codex ↗
          </a>
        </p>
      </aside>
    </>
  );
}

function ChecksumLesson({
  engine,
  encoded,
  onComplete,
  nextLabel,
}: {
  engine: Engine;
  encoded: string;
  onComplete: () => void;
  nextLabel: string;
}) {
  const worksheet = useMemo(
    () => checksumWorksheet(engine, encoded, true),
    [engine, encoded],
  );
  const [cursor, setCursor] = useState(0);
  const [primary, setPrimary] = useState(worksheet.initialData[0]);
  const [other, setOther] = useState(worksheet.initialRow[0]);
  const steps = [
    {
      label: 'Start with the prefilled row',
      description:
        'Add the first 13 characters after MS1 to the paper’s prefilled row, one column at a time.',
      left: worksheet.initialData,
      right: worksheet.initialRow,
      result: worksheet.initialSum,
    },
    ...worksheet.forward.map((row, i) => ({
      label: `Forward row ${i + 1} of 16`,
      description: `Look up ${row.key} in the checksum table. Shift the working row left by two, bring in the next two characters, and add the lookup row. ? marks a checksum cell still to solve.`,
      left: row.shifted,
      right: row.lookup,
      result: row.after,
    })),
    ...worksheet.backward.map((row) => ({
      label: `Work upward from row ${row.forwardStep}`,
      description: `Start from ${row.forwardStep === 16 ? 'SECRETSHARE32' : 'the solved row'}. Add the lookup row to reverse this step. The final two cells give characters ${row.offset + 4} and ${row.offset + 5}: ${row.pair}.`,
      left: row.solved,
      right: row.lookup,
      result: row.shifted,
    })),
  ];
  function advance(next: number) {
    setCursor(next);
    if (next === steps.length) onComplete();
  }
  const done = cursor === steps.length;
  const active = steps[Math.min(cursor, steps.length - 1)];
  function inspectColumn(index: number) {
    if (active.left[index] !== '?' && active.right[index] !== '?') {
      setPrimary(active.left[index]);
      setOther(active.right[index]);
    }
  }
  return (
    <div className="workshop-spread">
      <section className="instrument-page">
        <Wheel
          engine={engine}
          kind="addition"
          primary={primary}
          other={other}
          onPrimary={setPrimary}
          onOther={setOther}
        />
      </section>
      <section className="worksheet-page">
        <div className="running-head">
          <span>CHECKSUM WORKSHEET</span>
          <span>SHARE {encoded[8]}</span>
        </div>
        <BookHeading
          text={done ? 'Checksum complete.' : 'Calculate the checksum.'}
        />
        <p className="serif-copy">
          Follow the book’s 13-column worksheet. Work downward first, then fill
          the missing checksum characters from the bottom up.
        </p>
        <div className="checksum-track">
          <span className={cursor < 17 ? 'is-current' : ''}>
            1. Work downward
          </span>
          <ArrowRight size={16} />
          <span className={cursor >= 17 ? 'is-current' : ''}>
            2. Solve upward
          </span>
        </div>
        {done ? (
          <div className="lesson-success" aria-live="polite">
            <CheckCircle2 size={25} />
            <h3>{worksheet.checksum}</h3>
            <p>
              The paper calculation matches the checksum produced by the Rust
              library.
            </p>
            <code>{grouped(worksheet.output)}</code>
          </div>
        ) : (
          <>
            <div className="instruction-card">
              <span className="small-label">
                STEP {cursor + 1} OF {steps.length}
              </span>
              <h3>{active.label}</h3>
              <p>{active.description}</p>
            </div>
            <div className="checksum-rows">
              <div>
                <span>Working row</span>
                <code>{active.left}</code>
              </div>
              <div>
                <span>+ Table / prefill</span>
                <code>{active.right}</code>
              </div>
              <div className="checksum-result-row">
                <span>= Result</span>
                <div>
                  {active.result.split('').map((c, i) => (
                    <button
                      key={i}
                      disabled={c === '?'}
                      onClick={() => inspectColumn(i)}
                      aria-label={`Inspect checksum column ${i + 1}: ${active.left[i]} plus ${active.right[i]} equals ${c}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="worksheet-caption">
              Click a known result cell to set up its addition on the wheel.
            </p>
          </>
        )}
        <Progress value={(cursor / steps.length) * 100}>
          <ProgressLabel>Worksheet progress</ProgressLabel>
          <ProgressValue>{() => `${cursor} / ${steps.length}`}</ProgressValue>
        </Progress>
        <div className="checksum-actions">
          <button
            className="secondary-button"
            disabled={cursor === 0}
            onClick={() => setCursor(cursor - 1)}
          >
            <ArrowLeft size={15} /> Back
          </button>
          <BookButton
            onClick={() => (done ? onComplete() : advance(cursor + 1))}
          >
            {done
              ? nextLabel
              : cursor === steps.length - 1
                ? 'Finish checksum and continue'
                : 'Next row'}{' '}
            <ArrowRight size={16} />
          </BookButton>
        </div>
        <button
          className="text-button"
          disabled={done}
          onClick={() => advance(steps.length)}
        >
          Complete the remaining steps <ArrowRight size={15} />
        </button>
        <details className="technical-note">
          <summary>Why SECRETSHARE32?</summary>
          <p>
            A correct 48-character Codex32 string ends at this fixed
            verification row. When generating a checksum, the bottom row is
            already known, so the missing characters can be solved by reversing
            the additions.
          </p>
          <p>
            This worksheet is for 128-bit seeds with a 13-character checksum.
          </p>
        </details>
      </section>
    </div>
  );
}

export default function Workshop() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [session, setSession] = useState<WorkshopSession | null>(null);
  const [flow, dispatchFlow] = useReducer(workshopFlow, initialFlow);
  const { phase, checksumIndex } = flow;
  const workshopElement = useRef<HTMLElement>(null);
  const [pairText, setPairText] = useState('A,C');
  const [draft, setDraft] = useState('');
  const [dice, setDice] = useState<DiceResult | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    void loadEngine()
      .then((value) => {
        if (mounted) {
          setEngine(value);
        }
      })
      .catch(() => {
        if (mounted)
          setError(
            'The workshop could not load. Reload this page to try again.',
          );
      });
    return () => {
      mounted = false;
    };
  }, []);
  function fresh() {
    if (!engine) return;
    try {
      const next = completePracticeSession(engine, draft);
      setSession(next);
      dispatchFlow({ type: 'session-created' });
      setPairText('C,D');
      setDraft('');
      setDice(null);
      setError('');
    } catch {
      setError(
        'The test backup could not be created or verified. Your rolled characters and previous session are unchanged. Please try again.',
      );
    }
  }
  function roll() {
    if (draft.length >= 52) return;
    try {
      const next = rollDiceCharacter();
      setDraft((value) => value + next.character);
      setDice(next);
      setError('');
    } catch {
      setError('Browser randomness was unavailable. No character was added.');
    }
  }
  function fill() {
    try {
      const rest = randomCharacters(52 - draft.length);
      setDraft(draft + rest);
      setDice(null);
      setError('');
    } catch {
      setError(
        'Browser randomness was unavailable. The existing characters are unchanged.',
      );
    }
  }
  useEffect(() => {
    if (!flow.navigation || !flow.focus) return;
    // Allow the tabs' layout effects to reveal the newly active panel first.
    const frame = requestAnimationFrame(() => {
      const selector =
        flow.focus === 'result'
          ? '[data-recovery-result="true"]'
          : `[data-stage="${flow.phase}"]`;
      const destination =
        workshopElement.current?.querySelector<HTMLElement>(selector);
      destination?.focus({ preventScroll: true });
      destination?.scrollIntoView({ block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, [flow.navigation, flow.focus, flow.phase]);
  const pair = useMemo(() => pairText.split(',') as Pair, [pairText]);
  const initialPair = useMemo<Pair>(() => ['A', 'C'], []);
  useEffect(() => {
    if (window.location.hash === '#workbench') {
      dispatchFlow({ type: 'navigate', phase: 'workbench' });
    }
  }, []);
  function loadExample() {
    if (!engine) return;
    if (session?.kind === 'published') {
      dispatchFlow({ type: 'navigate', phase: 'recover', reveal: true });
      return;
    }
    try {
      setSession(publishedSession(engine));
      dispatchFlow({ type: 'published-example' });
      setPairText('A,C');
      setError('');
    } catch {
      setError('The published example could not be verified.');
    }
  }
  function createButton() {
    return (
      <BookButton className="create-backup-button" onClick={fresh}>
        Create my test backup <ArrowRight size={17} />
      </BookButton>
    );
  }
  return (
    <>
      <main
        ref={workshopElement}
        className="site-shell workshop-shell"
        data-active-view={phase}
      >
        <a className="skip-link" href="#workshop">
          Skip to workshop
        </a>
        <header className="masthead">
          <Link className="wordmark" href="/">
            <Image
              unoptimized
              className="book-mark"
              src={publicAsset('/art/sun.png')}
              width="38"
              height="38"
              alt=""
            />{' '}
            Codex<span>32</span>
          </Link>
          <div className="workshop-header-actions">
            <button
              className="text-button"
              disabled={!engine}
              onClick={loadExample}
            >
              Load example
            </button>
            {phase !== 'random' && (
              <button
                className="secondary-button"
                onClick={() =>
                  dispatchFlow({
                    type: 'navigate',
                    phase: 'random',
                    reveal: true,
                  })
                }
              >
                <Dices size={16} /> Make a new key
              </button>
            )}
          </div>
        </header>
        <div className="book-border" aria-hidden="true" />
        <div className="title-row workshop-title">
          <div>
            <p className="eyebrow">THE PAPER COMPUTER, IN YOUR HANDS</p>
            <BookHeading level={1} text="The volvelle workshop" />
          </div>
          <a
            className="original-book-link"
            href={wheelData.sources.paper}
            target="_blank"
            rel="noreferrer"
            aria-label="Read the original Codex32 book"
          >
            <Image
              unoptimized
              src={publicAsset('/art/book-cover.png')}
              width="62"
              height="80"
              alt="Original Codex32 book cover"
            />
          </a>
        </div>
        <div className="practice-notice">
          <ShieldCheck size={18} />
          <p>
            Disposable test keys only. Never enter a real backup or use these
            keys for funds. Fresh sessions disappear when you reload.
          </p>
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        {!engine ? (
          <div className="workshop-loading" aria-live="polite">
            {error
              ? 'Reload the page to load the workshop.'
              : 'Opening the paper computer…'}
          </div>
        ) : (
          <Tabs
            value={phase}
            onValueChange={(value) =>
              dispatchFlow({ type: 'navigate', phase: value as Phase })
            }
            id="workshop"
          >
            <TabsList
              className="chapter-tabs workshop-tabs"
              aria-label="Workshop stages"
            >
              <TabsTrigger value="random">
                <span>I.</span> Make a new key
              </TabsTrigger>
              <TabsTrigger value="checksum" disabled={!session}>
                <span>II.</span> Checksum
              </TabsTrigger>
              <TabsTrigger value="derive" disabled={!session}>
                <span>III.</span> Derive D
              </TabsTrigger>
              <TabsTrigger value="recover" disabled={!session}>
                <span>IV.</span> Recover S
              </TabsTrigger>
              <TabsTrigger value="workbench" className="workbench-tab">
                Recovery workbench
              </TabsTrigger>
            </TabsList>
            <TabsContent value="random" data-stage="random" keepMounted>
              {phase === 'random' && (
                <output className="stage-announcement">{flow.notice}</output>
              )}
              <div className="random-spread">
                <section className="worksheet-page">
                  <div className="running-head">
                    <span>FRESH INITIAL SHARES</span>
                    <span>NO REAL FUNDS</span>
                  </div>
                  <BookHeading text="Fresh initial shares." />
                  <p className="serif-copy">
                    Two independent strings become initial shares A and C. Each
                    needs 26 random characters. The two shares together define a
                    fresh 128-bit test seed.
                  </p>
                  <div className="random-share-drafts">
                    {['A', 'C'].map((label, row) => (
                      <div key={label}>
                        <div>
                          <strong>Share {label}</strong>
                          <span>
                            {Math.min(26, Math.max(0, draft.length - row * 26))}{' '}
                            / 26 characters
                          </span>
                        </div>
                        <code>
                          {Array.from(
                            { length: 26 },
                            (_, i) => draft[row * 26 + i] ?? '·',
                          ).join(' ')}
                        </code>
                      </div>
                    ))}
                  </div>
                  <Progress value={(draft.length / 52) * 100}>
                    <ProgressLabel>Random characters</ProgressLabel>
                    <ProgressValue>
                      {() => `${draft.length} / 52`}
                    </ProgressValue>
                  </Progress>
                  <div className="random-actions">
                    <button
                      className="secondary-button"
                      disabled={draft.length >= 52}
                      onClick={roll}
                    >
                      <Dices size={17} /> Roll five pairs
                    </button>
                    <button
                      className="text-button"
                      disabled={draft.length >= 52}
                      onClick={fill}
                    >
                      Fill remaining characters <WandSparkles size={15} />
                    </button>
                  </div>

                  <div className="create-backup-inline">
                    {createButton()}
                    <p className="worksheet-caption">
                      Any remaining characters will be filled securely.
                    </p>
                  </div>
                  <button
                    className="text-button"
                    disabled={!draft}
                    onClick={() => {
                      setDraft('');
                      setDice(null);
                    }}
                  >
                    Clear these characters
                  </button>
                  <p className="worksheet-caption">
                    Randomness comes from your browser’s cryptographic random
                    source. This educational page displays the material openly
                    and is not a key vault.
                  </p>
                </section>
                <section className="dice-page">
                  <div className="running-head">
                    <span>THE DICE EXERCISE</span>
                    <span>5 BITS → 1 CHARACTER</span>
                  </div>
                  <div className="dice-illumination">
                    <Image
                      unoptimized
                      src={publicAsset('/art/cover-wizard.png')}
                      width="124"
                      height="187"
                      alt="The wizard from the original Codex32 cover"
                    />
                    <div>
                      <h2>Roll. Compare. Read.</h2>
                    </div>
                  </div>
                  <p>
                    Each set of five pairs makes one of the 52 characters. A
                    higher second roll gives 1; a lower second roll gives 0.
                    Ties are rolled again.
                  </p>
                  <div className="dice-tracks">
                    {Array.from({ length: 5 }, (_, i) => (
                      <div className="dice-track" key={i}>
                        <span>Pair {i + 1}</span>
                        <span
                          className="die"
                          aria-label={
                            dice
                              ? `First roll ${dice.dice[i].first}`
                              : 'First roll pending'
                          }
                        >
                          {dice ? glyphs[dice.dice[i].first - 1] : '□'}
                        </span>
                        <ArrowRight size={17} />
                        <span
                          className="die"
                          aria-label={
                            dice
                              ? `Second roll ${dice.dice[i].second}`
                              : 'Second roll pending'
                          }
                        >
                          {dice ? glyphs[dice.dice[i].second - 1] : '□'}
                        </span>
                        <strong>{dice ? dice.dice[i].bit : '·'}</strong>
                      </div>
                    ))}
                  </div>
                  <output className="dice-result">
                    {dice ? (
                      <>
                        <code>{dice.bits}</code>
                        <ArrowRight size={20} />
                        <strong>{dice.character}</strong>
                        <span>
                          added to share {draft.length <= 26 ? 'A' : 'C'}
                        </span>
                      </>
                    ) : (
                      <span>Roll five pairs to make your first character.</span>
                    )}
                  </output>
                  {dice && (
                    <p className="worksheet-caption">
                      {dice.dice.reduce((sum, d) => sum + d.ties, 0)} tied pairs
                      rerolled.
                    </p>
                  )}
                  <details className="technical-note">
                    <summary>
                      How does this relate to the paper exercise?
                    </summary>
                    <p>
                      The book uses comparisons between two rolls to remove
                      bias. Here virtual dice use browser randomness, equal
                      pairs are retried, and the five resulting bits select a
                      character in the Bech32 alphabet.
                    </p>
                    <p>
                      “Fill remaining” samples uniform characters directly.
                      Turning a volvelle performs calculations; it does not
                      supply randomness.
                    </p>
                  </details>
                </section>
              </div>
              <div className="random-continue">
                <div aria-live="polite">
                  <strong>{draft.length} of 52 characters ready</strong>
                  <p>
                    {draft.length < 52
                      ? `Creating your backup will securely fill the remaining ${52 - draft.length} characters.`
                      : 'Both initial shares are ready. Next: calculate their checksums.'}
                  </p>
                </div>
                {createButton()}
              </div>
            </TabsContent>
            <TabsContent value="checksum" data-stage="checksum" keepMounted>
              {phase === 'checksum' && (
                <output className="stage-announcement">{flow.notice}</output>
              )}
              <div className="stage-toolbar">
                <p>Make the checksum by following the paper rows.</p>
                <label htmlFor="checksum-share">
                  Initial share
                  <NativeSelect
                    id="checksum-share"
                    value={checksumIndex}
                    onChange={(e) =>
                      dispatchFlow({
                        type: 'select-checksum',
                        index: e.target.value as 'A' | 'C',
                      })
                    }
                  >
                    <NativeSelectOption value="A">Share A</NativeSelectOption>
                    <NativeSelectOption value="C">Share C</NativeSelectOption>
                  </NativeSelect>
                </label>
              </div>
              {session &&
                (['A', 'C'] as const).map((index) => (
                  <div
                    key={session.shares.A + session.shares.C + index}
                    hidden={checksumIndex !== index}
                  >
                    <ChecksumLesson
                      engine={engine}
                      encoded={session.shares[index]}
                      nextLabel={
                        flow.checksums.A && flow.checksums.C
                          ? 'Continue to share D'
                          : `Continue to checksum ${index === 'A' ? 'C' : 'A'}`
                      }
                      onComplete={() =>
                        dispatchFlow({ type: 'checksum-completed', index })
                      }
                    />
                  </div>
                ))}
            </TabsContent>
            <TabsContent value="derive" data-stage="derive" keepMounted>
              {phase === 'derive' && (
                <output className="stage-announcement">{flow.notice}</output>
              )}
              <div className="stage-toolbar">
                <p>Use A and C to calculate D. No new randomness is needed.</p>
                <span className="network-badge">A + C → D</span>
              </div>
              {session && (
                <Lesson
                  key={session.shares.A + session.shares.C + 'derive'}
                  engine={engine}
                  session={session}
                  pair={initialPair}
                  target="D"
                  onRestart={() =>
                    dispatchFlow({ type: 'navigate', phase: 'derive' })
                  }
                  onComplete={() => {
                    setPairText('C,D');
                    dispatchFlow({ type: 'derivation-completed' });
                  }}
                />
              )}
            </TabsContent>
            <TabsContent value="recover" data-stage="recover" keepMounted>
              {phase === 'recover' && (
                <output className="stage-announcement">{flow.notice}</output>
              )}
              <div className="stage-toolbar">
                <p>
                  Set one share aside. The other two recover the same secret.
                </p>
                <label htmlFor="recovery-pair">
                  Use these shares
                  <NativeSelect
                    id="recovery-pair"
                    value={pairText}
                    onChange={(e) => {
                      setPairText(e.target.value);
                      dispatchFlow({ type: 'navigate', phase: 'recover' });
                    }}
                  >
                    <NativeSelectOption value="A,C">
                      A + C · set D aside
                    </NativeSelectOption>
                    <NativeSelectOption value="A,D">
                      A + D · set C aside
                    </NativeSelectOption>
                    <NativeSelectOption value="C,D">
                      C + D · set A aside
                    </NativeSelectOption>
                  </NativeSelect>
                </label>
              </div>
              {session && (
                <Lesson
                  key={session.shares.A + session.shares.C + pairText}
                  engine={engine}
                  session={session}
                  pair={pair}
                  target="S"
                  onRestart={() =>
                    dispatchFlow({ type: 'navigate', phase: 'recover' })
                  }
                  onComplete={() =>
                    dispatchFlow({ type: 'recovery-completed' })
                  }
                />
              )}
            </TabsContent>
            <TabsContent value="workbench" data-stage="workbench" keepMounted>
              <Workbench active={phase === 'workbench'} />
            </TabsContent>
          </Tabs>
        )}
        <footer className="site-footer">
          <a href={wheelData.sources.paper} target="_blank" rel="noreferrer">
            <BookOpen size={15} /> Read the original codex ↗
          </a>
          <span>LEARN · TURN · RECOVER</span>
        </footer>
        <BookCredits />
      </main>
      {phase === 'workbench' && <PracticeCards />}
    </>
  );
}
