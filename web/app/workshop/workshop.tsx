'use client';
import Image from 'next/image';
import BookButton from '@/components/book-button';
import { publicAsset } from '@/lib/public-asset';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import BookCredits from '@/components/book-credits';
import BookHeading from '@/components/book-heading';
import Workbench, { PracticeCards } from '../workbench/workbench';
import {
  ArrowRight,
  BookOpen,
  Dices,
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
import { type Engine } from '@/lib/practice';
import {
  completePracticeSession,
  emptyDiceEntry,
  recordDiceCharacter,
  publishedSession,
  sessionFromInitial,
  randomCharacters,
  rollDiceCharacter,
  wheelData,
  type DiceResult,
  type Pair,
  type WorkshopSession,
} from '@/lib/workshop';
import ManualLesson from './manual-lesson';
import DiceWorksheet from './dice-worksheet';
import './workshop.css';

import {
  workshopFlow,
  normalizeWorkshopFlow,
  type Phase,
  type FlowAction,
} from '@/lib/workshop-flow';
import {
  checksumExercise,
  shareExercise,
  emptyBook,
  emptyLesson,
  prepareLesson,
  emptyWorkbooks,
  readWorkbooks,
  saveWorkbooks,
  showExample,
  STORAGE_KEY,
  type Book,
} from '@/lib/workbook';

export default function Workshop() {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [workbooks, setWorkbooks] = useState(emptyWorkbooks);
  const book = workbooks.books[workbooks.active];
  const [loaded, setLoaded] = useState(false);
  const [saveAllowed, setSaveAllowed] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Opening your workbook…');
  const [saveBlocked, setSaveBlocked] = useState(false);
  const session = useMemo(
    () =>
      engine && book.initial
        ? sessionFromInitial(engine, book.initial, workbooks.active)
        : null,
    [engine, book.initial, workbooks.active],
  );
  const flow = book.flow;
  const phase = book.example && session ? book.examplePhase : flow.phase;
  const checksumIndex = book.example
    ? book.exampleChecksumIndex
    : flow.checksumIndex;
  const verifyIndex = book.example ? book.exampleVerifyIndex : flow.verifyIndex;
  const pairText = book.example ? book.examplePair : book.pair;
  const draft = book.draft;
  const workshopElement = useRef<HTMLElement>(null);
  const dice = book.dice;
  function setDice(value: DiceResult | null) {
    setDiceError('');
    updateBook((current) => ({
      ...current,
      dice: value,
      diceEntry: emptyDiceEntry(),
    }));
  }
  const [error, setError] = useState('');
  const [diceError, setDiceError] = useState('');
  const [makingAnother, setMakingAnother] = useState(false);
  function updateBook(change: (current: Book) => Book) {
    setWorkbooks((current) => ({
      ...current,
      books: {
        ...current.books,
        [current.active]: change(current.books[current.active]),
      },
    }));
  }
  function dispatchFlow(action: FlowAction) {
    updateBook((current) => ({
      ...current,
      flow:
        action.type === 'select-verification'
          ? normalizeWorkshopFlow(workshopFlow(current.flow, action), derived)
          : workshopFlow(current.flow, action),
    }));
  }
  function navigate(next: Phase) {
    setMakingAnother(false);
    if (next === 'random')
      updateBook((current) => ({
        ...current,
        example: false,
        flow: workshopFlow(current.flow, { type: 'navigate', phase: next }),
      }));
    else if (book.example && session)
      updateBook((current) => ({ ...current, examplePhase: next }));
    else
      updateBook((current) => ({
        ...current,
        flow: normalizeWorkshopFlow(
          workshopFlow(current.flow, { type: 'navigate', phase: next }),
          derived,
        ),
      }));
  }
  function setDraft(value: string | ((previous: string) => string)) {
    updateBook((current) => ({
      ...current,
      draft: typeof value === 'function' ? value(current.draft) : value,
    }));
  }
  function setPairText(pair: string) {
    updateBook((current) =>
      current.example
        ? { ...current, examplePair: pair as Book['pair'] }
        : { ...current, pair: pair as Book['pair'] },
    );
  }
  const exercises = useMemo(() => {
    if (!engine || !session) return null;
    return {
      'checksum-A': checksumExercise(engine, session.shares.A),
      'checksum-C': checksumExercise(engine, session.shares.C),
      'verify-A': checksumExercise(engine, session.shares.A, true),
      'verify-C': checksumExercise(engine, session.shares.C, true),
      'verify-D': checksumExercise(engine, session.shares.D, true),
      derive: shareExercise(engine, session, ['A', 'C'], 'D'),
      ['recover-' + pairText]: shareExercise(
        engine,
        session,
        pairText.split(',') as Pair,
        'S',
      ),
    };
  }, [engine, session, pairText]);
  const bothChecksums = flow.checksums.A && flow.checksums.C;
  const bothVerified = bothChecksums && flow.verified.A && flow.verified.C;
  const derived = Boolean(
    exercises &&
    book.lessons.derive?.answers.length === exercises.derive.steps.length,
  );
  useEffect(() => {
    let mounted = true;
    void loadEngine()
      .then((value) => {
        if (!mounted) return;
        setEngine(value);
        try {
          const restored = readWorkbooks(value, window.localStorage);
          if (window.location.hash === '#workbench') {
            const active = restored.books[restored.active];
            active.flow = workshopFlow(active.flow, {
              type: 'navigate',
              phase: 'workbench',
            });
            active.examplePhase = 'workbench';
          }
          setWorkbooks(restored);
          setSaveAllowed(true);
          setSaveStatus('Saved in this browser');
        } catch {
          setSaveBlocked(true);
          setSaveStatus(
            'Saved work could not be opened. It has not been overwritten.',
          );
        }
        setLoaded(true);
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
  useEffect(() => {
    if (!loaded || !saveAllowed) return;
    try {
      saveWorkbooks(window.localStorage, workbooks);
      queueMicrotask(() => setSaveStatus('Saved in this browser'));
    } catch {
      queueMicrotask(() =>
        setSaveStatus(
          'This browser could not save your latest changes. Keep this tab open.',
        ),
      );
    }
  }, [loaded, saveAllowed, workbooks]);
  function clearSavedWork() {
    if (!window.confirm('Erase both saved practice workbooks and start again?'))
      return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      setWorkbooks(emptyWorkbooks());
      setDice(null);
      setSaveAllowed(true);
      setSaveBlocked(false);
      setSaveStatus('Saved work cleared');
    } catch {
      setSaveStatus('This browser could not clear its saved workbook.');
    }
  }
  function setSession(next: WorkshopSession) {
    updateBook((current) => ({
      ...emptyBook(),
      draft: current.draft,
      initial: [next.shares.A, next.shares.C],
    }));
  }
  function fresh() {
    if (!engine || draft.length !== 52) return;
    if (workbooks.active === 'published') return;
    if (
      session &&
      !window.confirm(
        'Replace this practice workbook with a new one? Its worksheet answers will be erased.',
      )
    )
      return;
    try {
      const next = completePracticeSession(engine, draft);
      setSession(next);
      dispatchFlow({ type: 'session-created' });
      setPairText('C,D');
      setDraft('');
      setDice(null);
      setError('');
      setMakingAnother(false);
    } catch {
      setError(
        'The test backup could not be created or verified. Your rolled characters and previous session are unchanged. Please try again.',
      );
    }
  }
  function roll() {
    if (draft.length >= 52 || (dice && !book.diceEntry.recorded)) return;
    try {
      const next = rollDiceCharacter();
      setDice(next);
      setDiceError('');
      requestAnimationFrame(() => {
        const input =
          workshopElement.current?.querySelector<HTMLSelectElement>(
            '.dice-track select',
          );
        input?.focus({ preventScroll: true });
        input?.scrollIntoView({ block: 'center' });
      });
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
  function loadExample() {
    if (!engine) return;
    setError('');
    setMakingAnother(false);
    if (workbooks.active === 'published') {
      setWorkbooks((current) => ({ ...current, active: 'fresh' }));
      return;
    }
    try {
      const published = publishedSession(engine);
      setWorkbooks((current) => ({
        ...current,
        active: 'published',
        books: {
          ...current.books,
          published: current.books.published.initial
            ? current.books.published
            : {
                ...emptyBook(),
                initial: [published.shares.A, published.shares.C],
                flow: workshopFlow(emptyBook().flow, {
                  type: 'session-created',
                }),
                example: true,
              },
        },
      }));
    } catch {
      setError('The published example could not be verified.');
    }
  }
  function renderExercise(
    id: string,
    target: 'D' | 'S',
    onComplete: () => void,
  ) {
    if (!engine || !session || !exercises) return null;
    return (
      <ManualLesson
        key={session.shares.A + session.shares.C + id}
        engine={engine}
        session={session}
        exercise={exercises[id]}
        progress={prepareLesson(
          exercises[id],
          book.lessons[id] ?? emptyLesson(),
        )}
        example={book.example}
        active={
          phase ===
            (id.startsWith('checksum')
              ? 'checksum'
              : id.startsWith('verify')
                ? 'verify'
                : id === 'derive'
                  ? 'derive'
                  : 'recover') &&
          (!id.startsWith('checksum') || id === 'checksum-' + checksumIndex) &&
          (!id.startsWith('verify') || id === 'verify-' + verifyIndex)
        }
        target={target}
        onChange={(progress) =>
          updateBook((current) => {
            if (
              current.example &&
              progress.answers.length !==
                prepareLesson(exercises[id], current.lessons[id]).answers.length
            )
              return current;
            const checksums = { ...current.flow.checksums };
            const verified = { ...current.flow.verified };
            if (id.startsWith('verify-'))
              verified[id.slice(7) as 'A' | 'C' | 'D'] =
                progress.answers.length === exercises[id].steps.length;
            if (id === 'checksum-A' || id === 'checksum-C') {
              checksums[id === 'checksum-A' ? 'A' : 'C'] =
                progress.answers.length === exercises[id].steps.length;
            }
            return {
              ...current,
              lessons: { ...current.lessons, [id]: progress },
              flow: { ...current.flow, checksums, verified },
            };
          })
        }
        onComplete={onComplete}
      />
    );
  }
  function createButton() {
    return (
      <BookButton
        className="create-backup-button"
        onClick={fresh}
        disabled={draft.length !== 52}
      >
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
          <h1 className="codex-title">
            <Link href="/">Codex32</Link>
          </h1>
          <div className="workshop-header-actions">
            <a
              className="text-button"
              href={wheelData.sources.paper}
              target="_blank"
              rel="noreferrer"
            >
              Read the original book ↗
            </a>
            <button
              className="text-button"
              disabled={!engine || !loaded}
              onClick={loadExample}
            >
              {workbooks.active === 'published'
                ? 'Return to my workbook'
                : 'Use published shares'}
            </button>
            {phase !== 'random' && (
              <button
                className="secondary-button"
                onClick={() => {
                  setMakingAnother(false);
                  setWorkbooks((current) => ({
                    ...current,
                    active: 'fresh',
                    books: {
                      ...current.books,
                      fresh: {
                        ...current.books.fresh,
                        example: false,
                        flow: workshopFlow(current.books.fresh.flow, {
                          type: 'navigate',
                          phase: 'random',
                          reveal: true,
                        }),
                      },
                    },
                  }));
                }}
              >
                <Dices size={16} /> Make a new key
              </button>
            )}
          </div>
        </header>
        <div className="book-border" aria-hidden="true" />
        <div className="practice-notice">
          <ShieldCheck size={18} />
          <p>
            Disposable test keys only. Never enter a real backup or use these
            keys for funds. Practice keys and worksheet answers are saved only
            in this browser.
          </p>
        </div>
        {error && (
          <p className="error-banner" role="alert">
            {error}
          </p>
        )}
        <div className="workbook-tools">
          <label className="example-switch">
            <input
              type="checkbox"
              checked={book.example}
              disabled={!session || phase === 'random'}
              onChange={(event) =>
                updateBook((current) =>
                  showExample(current, event.target.checked),
                )
              }
            />
            Show worked example
          </label>
          <output className="save-status">{saveStatus}</output>
          <button className="text-button" onClick={clearSavedWork}>
            {saveBlocked
              ? 'Clear unreadable save and start fresh'
              : 'Clear saved work'}
          </button>
        </div>
        {!engine || !loaded ? (
          <div className="workshop-loading" aria-live="polite">
            {error
              ? 'Reload the page to load the workshop.'
              : 'Opening the paper computer…'}
          </div>
        ) : (
          <Tabs
            value={phase}
            onValueChange={(value) => navigate(value as Phase)}
            id="workshop"
          >
            <TabsList
              className="chapter-tabs workshop-tabs"
              aria-label="Workshop stages"
            >
              <TabsTrigger
                value="random"
                disabled={workbooks.active === 'published'}
              >
                <span>I.</span> Make a new key
              </TabsTrigger>
              <TabsTrigger value="checksum" disabled={!session}>
                <span>II.</span> Checksum
              </TabsTrigger>
              <TabsTrigger
                value="verify"
                disabled={
                  !session ||
                  (!book.example && !flow.checksums.A && !flow.checksums.C)
                }
              >
                <span>III.</span> Verify
              </TabsTrigger>
              <TabsTrigger
                value="derive"
                disabled={!session || (!book.example && !bothVerified)}
              >
                <span>IV.</span> Derive D
              </TabsTrigger>
              <TabsTrigger
                value="recover"
                disabled={
                  !session ||
                  (!book.example &&
                    (!bothVerified || !derived || !flow.verified.D))
                }
              >
                <span>V.</span> Recover S
              </TabsTrigger>
              <TabsTrigger value="workbench" className="workbench-tab">
                Recovery workbench
              </TabsTrigger>
            </TabsList>
            <TabsContent value="random" data-stage="random" keepMounted>
              {phase === 'random' && (
                <output className="stage-announcement">{flow.notice}</output>
              )}
              {session && !makingAnother ? (
                <section className="worksheet-page saved-key-page">
                  <div className="running-head">
                    <span>YOUR CURRENT WORKBOOK</span>
                    <span>SAVED IN THIS BROWSER</span>
                  </div>
                  <BookHeading text="The shares you created." />
                  <p className="serif-copy">
                    These are the 26 random characters you created for each
                    share. They still define the same test key. Your checksum
                    entries and wheel settings are kept when you change tabs.
                  </p>
                  <div className="random-share-drafts">
                    {(['A', 'C'] as const).map((index) => (
                      <div key={index}>
                        <div>
                          <strong>Share {index}</strong>
                          <span>26 / 26 characters</span>
                        </div>
                        <code>
                          {session.shares[index]
                            .slice(9, 35)
                            .split('')
                            .join(' ')}
                        </code>
                      </div>
                    ))}
                  </div>
                  <div className="saved-key-actions">
                    <BookButton
                      onClick={() =>
                        updateBook((current) => ({
                          ...current,
                          example: false,
                          flow: normalizeWorkshopFlow(
                            workshopFlow(current.flow, {
                              type: 'navigate',
                              phase: 'recover',
                              reveal: true,
                            }),
                            derived,
                          ),
                        }))
                      }
                    >
                      Continue this workbook <ArrowRight size={17} />
                    </BookButton>
                    <button
                      className="text-button"
                      onClick={() => setMakingAnother(true)}
                    >
                      Make another test key
                    </button>
                  </div>
                </section>
              ) : (
                <>
                  {session && (
                    <div className="new-key-draft-notice">
                      <p>
                        Your current workbook is kept until you create its
                        replacement.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setMakingAnother(false)}
                      >
                        Return to the current key
                      </button>
                    </div>
                  )}
                  <div className="random-spread">
                    <section className="worksheet-page">
                      <div className="running-head">
                        <span>FRESH INITIAL SHARES</span>
                        <span>NO REAL FUNDS</span>
                      </div>
                      <BookHeading text="Fresh initial shares." />
                      <p className="serif-copy">
                        Two independent strings become initial shares A and C.
                        Each needs 26 random characters. The two shares together
                        define a fresh 128-bit test seed.
                      </p>
                      <p className="serif-copy">
                        This exercise uses the name <b>PLAY</b> and three
                        shares, A, C and D. Any two recover the seed (k = 2). We
                        follow the book’s translation worksheet method.
                      </p>
                      <div className="random-share-drafts">
                        {['A', 'C'].map((label, row) => (
                          <div key={label}>
                            <div>
                              <strong>Share {label}</strong>
                              <span>
                                {Math.min(
                                  26,
                                  Math.max(0, draft.length - row * 26),
                                )}{' '}
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
                          data-roll-dice
                          disabled={
                            draft.length >= 52 ||
                            Boolean(dice && !book.diceEntry.recorded)
                          }
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
                          Complete all 52 characters first. “Fill remaining” is
                          an optional shortcut.
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
                        Randomness comes from your browser’s cryptographic
                        random source. This educational page displays the
                        material openly and is not a key vault.
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
                      <DiceWorksheet
                        dice={dice}
                        entry={book.diceEntry}
                        error={diceError}
                        onChange={(diceEntry) => {
                          setDiceError('');
                          updateBook((current) => ({ ...current, diceEntry }));
                        }}
                        onRecord={() => {
                          if (!dice) return;
                          const next = recordDiceCharacter(
                            draft,
                            dice,
                            book.diceEntry,
                          );
                          if (next === null) {
                            setDiceError(
                              'Check all five comparisons, then follow those branches to the character at the end of the tree.',
                            );
                            return;
                          }
                          updateBook((current) => ({
                            ...current,
                            draft: next,
                            diceEntry: { ...current.diceEntry, recorded: true },
                          }));
                          setDiceError('');
                          requestAnimationFrame(() => {
                            const button =
                              workshopElement.current?.querySelector<HTMLButtonElement>(
                                next.length === 52
                                  ? '.create-backup-button'
                                  : '[data-roll-dice]',
                              );
                            button?.focus({ preventScroll: true });
                            button?.scrollIntoView({ block: 'center' });
                          });
                        }}
                      />
                      <details className="technical-note">
                        <summary>
                          How does this relate to the paper exercise?
                        </summary>
                        <p>
                          The book uses comparisons between two rolls to remove
                          bias. Here virtual dice use browser randomness, equal
                          pairs are retried. You compare the rolls and follow
                          the original tree to record a character.
                        </p>
                        <p>
                          “Fill remaining” samples uniform characters directly.
                          Turning a volvelle performs calculations; it does not
                          supply randomness.
                        </p>
                      </details>
                    </section>
                  </div>
                </>
              )}
            </TabsContent>
            <TabsContent value="checksum" data-stage="checksum" keepMounted>
              {phase === 'checksum' && (
                <output className="stage-announcement">{flow.notice}</output>
              )}
              <div className="stage-toolbar">
                <p>
                  Fill in every step. Use the example only when you want a hint.
                </p>
                <label htmlFor="checksum-share">
                  Initial share
                  <NativeSelect
                    id="checksum-share"
                    value={checksumIndex}
                    onChange={(e) => {
                      const index = e.target.value as 'A' | 'C';
                      if (book.example)
                        updateBook((current) => ({
                          ...current,
                          exampleChecksumIndex: index,
                        }));
                      else dispatchFlow({ type: 'select-checksum', index });
                    }}
                  >
                    <NativeSelectOption value="A">Share A</NativeSelectOption>
                    <NativeSelectOption value="C">Share C</NativeSelectOption>
                  </NativeSelect>
                </label>
              </div>
              {session &&
                (['A', 'C'] as const).map((index) => (
                  <div key={index} hidden={checksumIndex !== index}>
                    {renderExercise('checksum-' + index, 'S', () =>
                      dispatchFlow({ type: 'checksum-completed', index }),
                    )}
                  </div>
                ))}
            </TabsContent>
            <TabsContent value="verify" data-stage="verify" keepMounted>
              {phase === 'verify' && (
                <output className="stage-announcement">{flow.notice}</output>
              )}
              <div className="stage-toolbar">
                <p>
                  Recopy the complete share. Calculate downward; the final row
                  must be SECRETSHARE32.
                </p>
                <label htmlFor="verify-share">
                  Verify share
                  <NativeSelect
                    id="verify-share"
                    value={verifyIndex}
                    onChange={(event) => {
                      const index = event.target.value as 'A' | 'C' | 'D';
                      if (book.example)
                        updateBook((current) => ({
                          ...current,
                          exampleVerifyIndex: index,
                        }));
                      else dispatchFlow({ type: 'select-verification', index });
                    }}
                  >
                    {(['A', 'C', 'D'] as const).map((index) => (
                      <NativeSelectOption
                        key={index}
                        value={index}
                        disabled={
                          !book.example &&
                          (index === 'D'
                            ? !bothVerified || !derived
                            : !flow.checksums[index])
                        }
                      >
                        Share {index}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
              </div>
              {session &&
                (['A', 'C', 'D'] as const).map((index) => (
                  <div key={index} hidden={verifyIndex !== index}>
                    {renderExercise('verify-' + index, 'S', () =>
                      dispatchFlow({ type: 'verification-completed', index }),
                    )}
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
              {renderExercise('derive', 'D', () => {
                setPairText('C,D');
                dispatchFlow({ type: 'derivation-completed' });
              })}
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
                      navigate('recover');
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
              {renderExercise('recover-' + pairText, 'S', () =>
                dispatchFlow({ type: 'recovery-completed' }),
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
