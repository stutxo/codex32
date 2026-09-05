'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { publicAsset } from '@/lib/public-asset';
import Link from 'next/link';
import BookCredits from '@/components/book-credits';
import { flushSync } from 'react-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  Printer,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { loadEngine } from '@/lib/engine';
import {
  checkShare,
  grouped,
  practice,
  recoverPractice,
  shares,
  type RecoveryResult,
  type ShareCheck,
  type ShareIndex,
} from '@/lib/practice';
import { recoveryTool } from '@/lib/webmcp';

type Chapter = 'recover' | 'check' | 'print';

export default function Workbench() {
  const [chapter, setChapter] = useState<Chapter>('recover');
  const [selected, setSelected] = useState<ShareIndex[]>(['A', 'C']);
  const [ready, setReady] = useState(false);
  const [engineFailed, setEngineFailed] = useState(false);
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [recoveryError, setRecoveryError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [input, setInput] = useState(shares[0].text);
  const [checked, setChecked] = useState<ShareCheck | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  const prepareEngine = useCallback(async () => {
    try {
      await loadEngine();
      setReady(true);
      setEngineFailed(false);
    } catch {
      setEngineFailed(true);
    }
  }, []);
  useEffect(() => {
    let mounted = true;
    void loadEngine().then(
      () => {
        if (mounted) setReady(true);
      },
      () => {
        if (mounted) setEngineFailed(true);
      },
    );
    return () => {
      mounted = false;
    };
  }, []);

  const runRecovery = useCallback(async (indices: ShareIndex[]) => {
    try {
      const restored = recoverPractice(await loadEngine(), indices);
      flushSync(() => {
        setChapter('recover');
        setSelected([...indices]);
        setResult(restored);
        setRecoveryError('');
        setCopyMessage('');
        setReady(true);
        setEngineFailed(false);
      });
      resultHeading.current?.focus({ preventScroll: true });
      resultHeading.current?.scrollIntoView({ block: 'nearest' });
      return {
        shareIndices: restored.indices,
        secretMatchesPublishedExample: true,
        signetAddressesMatched: restored.addresses.length,
      };
    } catch {
      flushSync(() => {
        setResult(null);
        setRecoveryError(
          'Recovery could not be verified. Reload the page and try the public example again.',
        );
      });
      throw new Error('Practice recovery could not be verified.');
    }
  }, []);

  useEffect(() => {
    if (!document.modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        document.modelContext.registerTool(recoveryTool(runRecovery), {
          signal: lifecycle.signal,
        }),
      ).catch(() => {});
    } catch {
      /* Optional browser capability; visible actions remain available. */
    }
    return () => lifecycle.abort();
  }, [runRecovery]);

  function selectShare(index: ShareIndex, isSelected: boolean) {
    setSelected((current) =>
      isSelected
        ? [...new Set([...current, index])]
        : current.filter((value) => value !== index),
    );
    setResult(null);
    setRecoveryError('');
    setCopyMessage('');
  }
  function chooseExample(value: string) {
    setInput(value);
    setChecked(null);
  }
  async function inspect() {
    try {
      setChecked(checkShare(await loadEngine(), input));
    } catch {
      setChecked({
        ok: false,
        message: 'The checker could not load. Reload the page and try again.',
      });
    }
  }
  async function copySecret() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.secret);
      setCopyMessage('Public example copied.');
    } catch {
      setCopyMessage('Select the string above and copy it manually.');
    }
  }
  const selectionHint =
    selected.length === 2
      ? 'Ready to recover'
      : selected.length < 2
        ? 'Choose two shares to continue'
        : 'Remove one share; exactly two are needed';

  return (
    <>
      <main className="site-shell">
        <a className="skip-link" href="#workbench">
          Skip to workbench
        </a>
        <header className="masthead">
          <Link className="wordmark" href="/" aria-label="Codex32 home">
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
          <span className="edition">A FIELD GUIDE TO RECOVERY</span>
          <span className="practice-badge">
            <ShieldCheck size={16} /> Public practice edition
          </span>
        </header>
        <div className="title-row">
          <div>
            <p className="eyebrow">THE INTERACTIVE COMPANION</p>
            <h1>The recovery workbench</h1>
          </div>
          <Link className="workshop-entry" href="/">
            Turn the volvelles <ArrowRight size={17} />
          </Link>
        </div>
        <div className="practice-notice">
          <ShieldCheck size={18} />
          <p>
            For practice only. These examples are public. Never use them to hold
            funds or enter a real backup here.
          </p>
        </div>
        {engineFailed && (
          <div className="error-banner" role="alert">
            <p>The recovery library could not load.</p>
            <button
              className="text-button"
              onClick={() => void prepareEngine()}
            >
              Try loading again
            </button>
          </div>
        )}
        <Tabs
          value={chapter}
          onValueChange={(value) => setChapter(value as Chapter)}
          id="workbench"
        >
          <TabsList className="chapter-tabs" aria-label="Workbench chapters">
            <TabsTrigger value="recover">
              <span>I.</span> Practice recovery
            </TabsTrigger>
            <TabsTrigger value="check">
              <span>II.</span> Check a share
            </TabsTrigger>
            <TabsTrigger value="print">
              <span>III.</span> Print practice cards
            </TabsTrigger>
          </TabsList>
          <TabsContent value="recover">
            <div className="book">
              <section className="book-page entry-page">
                <div className="running-head">
                  <span>CHAPTER I</span>
                  <a
                    href={practice.provenance.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    BIP93 · EXAMPLE 2 ↗
                  </a>
                </div>
                <h2>Begin with two shares.</h2>
                <p className="intro">
                  <span className="drop-cap">A</span> share is one piece of a
                  backup. This example needs any two of the three below to
                  recover the same secret.
                </p>
                <div className="selection-label">
                  <strong>Choose your shares</strong>
                  <span aria-live="polite">
                    {selected.length} of 2 selected
                  </span>
                </div>
                <div className="share-options">
                  {shares.map((share) => (
                    <label
                      key={share.index}
                      className={`share-option ${selected.includes(share.index) ? 'is-selected' : ''}`}
                    >
                      <span className="share-top">
                        <span className="share-title">
                          <Checkbox
                            checked={selected.includes(share.index)}
                            onCheckedChange={(value) =>
                              selectShare(share.index, value)
                            }
                            aria-label={`Select share ${share.index}`}
                          />
                          <strong>Share {share.index}</strong>
                        </span>
                        <span className="small-label">PUBLIC EXAMPLE</span>
                      </span>
                      <code>{grouped(share.text)}</code>
                    </label>
                  ))}
                </div>
                <button
                  className="primary-button"
                  disabled={!ready || selected.length !== 2}
                  onClick={() => void runRecovery(selected).catch(() => {})}
                >
                  Recover practice secret <ArrowRight size={18} />
                </button>
                <output className="quiet-line">
                  {ready ? (
                    <>
                      <Check size={15} /> {selectionHint}
                    </>
                  ) : engineFailed ? (
                    'Library unavailable'
                  ) : (
                    'Loading the recovery library…'
                  )}
                </output>
                {recoveryError && (
                  <p className="check-error" role="alert">
                    {recoveryError}
                  </p>
                )}
                <div className="folio">
                  <span>Any two distinct shares. The same secret.</span>
                  <span>01</span>
                </div>
              </section>
              <section
                className="book-page result-page"
                aria-label="Recovery result"
              >
                <div className="running-head">
                  <span>THE RECOVERED SECRET</span>
                  <span>02</span>
                </div>
                {!result ? (
                  <div className="result-empty">
                    <Image
                      unoptimized
                      src={publicAsset('/art/book-cover.png')}
                      width="1224"
                      height="1584"
                      alt="Original Codex32 book cover by Micaela Paez, with a wizard, dragons, and the paper wheels"
                    />
                    <h2>Two shares. One secret.</h2>
                    <p>
                      Recover the example to reveal its complete Codex32 string
                      and check the wallet addresses.
                    </p>
                    <span className="ornament" aria-hidden="true">
                      ✦
                    </span>
                  </div>
                ) : (
                  <div className="recovered">
                    <div className="verified-label">
                      <CheckCircle2 size={17} /> Published secret matched
                    </div>
                    <h2 ref={resultHeading} tabIndex={-1}>
                      The secret, recovered.
                    </h2>
                    <p className="result-explanation">
                      Shares <strong>{result.indices.join(' + ')}</strong>{' '}
                      recovered the complete <strong>S</strong> string. It
                      contains the seed itself.
                    </p>
                    <div className="secret-block">
                      <span className="small-label">
                        PUBLIC PRACTICE SECRET · INDEX S
                      </span>
                      <code>{grouped(result.secret)}</code>
                      <button
                        className="text-button"
                        onClick={() => void copySecret()}
                      >
                        <Copy size={14} /> Copy ungrouped string
                      </button>
                    </div>
                    <output className="copy-status">{copyMessage}</output>
                    <div className="address-heading">
                      <h3>Check the wallet</h3>
                      <span className="network-badge">SIGNET</span>
                    </div>
                    <p className="address-description">
                      All three addresses match the expected practice wallet.
                    </p>
                    <ol className="address-list">
                      {result.addresses.map((address) => (
                        <li key={address.index}>
                          <div>
                            <span>Receive address {address.index + 1}</span>
                            <span className="match">
                              <Check size={14} /> Match
                            </span>
                          </div>
                          <code>{address.address}</code>
                        </li>
                      ))}
                    </ol>
                    <details className="technical-note">
                      <summary>How is this checked?</summary>
                      <p>
                        The S string is compared with the published BIP93
                        example. Addresses are compared with fixed expectations
                        derived separately from its published seed, using BIP86
                        Taproot, Signet, account 0.
                      </p>
                      <code>m/86′/1′/0′/0/[0–2]</code>
                      <p>
                        This checks the built-in example. A checksum alone does
                        not establish that shares belong to the same wallet.
                      </p>
                    </details>
                    <button
                      className="text-button reset-button"
                      onClick={() => {
                        setResult(null);
                        setCopyMessage('');
                      }}
                    >
                      <RotateCcw size={15} /> Try a different pair
                    </button>
                  </div>
                )}
                <div className="folio">
                  <span>The secret is a string, not a word list.</span>
                  <span>02</span>
                </div>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="check">
            <div className="book checker-book">
              <section className="book-page entry-page">
                <div className="running-head">
                  <span>CHAPTER II</span>
                  <span>READING A SHARE</span>
                </div>
                <h2>Every character counts.</h2>
                <p className="intro">
                  A Codex32 string carries its own checksum. Try the public
                  example, then change one character to see the check fail.
                </p>
                <label className="input-label" htmlFor="share-input">
                  Public Codex32 example
                </label>
                <textarea
                  id="share-input"
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    setChecked(null);
                  }}
                  maxLength={1024}
                  spellCheck={false}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  aria-describedby="input-help"
                />
                <p id="input-help" className="input-help">
                  Spaces and line breaks are removed. Case and all other
                  characters are checked as entered.
                </p>
                <div className="example-buttons">
                  <span>Try:</span>
                  <button
                    className="text-button"
                    onClick={() => chooseExample(shares[0].text)}
                  >
                    Share A
                  </button>
                  <button
                    className="text-button"
                    onClick={() => chooseExample(practice.publishedSecret)}
                  >
                    Secret S
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      chooseExample(shares[0].text.slice(0, -1) + 'Q')
                    }
                  >
                    A typo
                  </button>
                </div>
                <button
                  className="primary-button"
                  disabled={!ready}
                  onClick={() => void inspect()}
                >
                  Check share <ShieldCheck size={18} />
                </button>
                <p className="quiet-line">
                  <ShieldCheck size={15} /> Checked locally. Inputs are not
                  saved by this app.
                </p>
                <div className="folio">
                  <span>Copy carefully. Check deliberately.</span>
                  <span>03</span>
                </div>
              </section>
              <section
                className="book-page result-page"
                aria-label="Share check result"
              >
                <div className="running-head">
                  <span>INSIDE THE STRING</span>
                  <span>04</span>
                </div>
                {checked ? (
                  checked.ok ? (
                    <section
                      className="checked-result"
                      aria-live="polite"
                      aria-label="Valid share metadata"
                    >
                      <div className="verified-label">
                        <CheckCircle2 size={17} /> Checksum valid
                      </div>
                      <h2>
                        {checked.isSecret
                          ? 'A complete secret.'
                          : `This is share ${checked.index.toUpperCase()}.`}
                      </h2>
                      <dl className="metadata-grid">
                        <div>
                          <dt>Identifier</dt>
                          <dd>
                            <code>{checked.identifier.toUpperCase()}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Index</dt>
                          <dd>
                            <code>{checked.index.toUpperCase()}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>Backup threshold</dt>
                          <dd>
                            {checked.threshold === 0
                              ? 'Unshared'
                              : `${checked.threshold} shares`}
                          </dd>
                        </div>
                        <div>
                          <dt>Seed size</dt>
                          <dd>{checked.seedBytes * 8} bits</dd>
                        </div>
                      </dl>
                      <p>
                        {checked.isSecret
                          ? 'Index S contains the complete seed. It does not need another share for recovery.'
                          : `This share needs ${checked.threshold - 1} more distinct, compatible ${checked.threshold === 2 ? 'share' : 'shares'} to recover the seed.`}
                      </p>
                      <p className="check-note">
                        {checked.knownExample
                          ? 'This is one of the built-in public examples.'
                          : 'This string is not one of the built-in examples. A valid checksum does not verify its origin or wallet.'}
                      </p>
                    </section>
                  ) : (
                    <div className="checked-result" role="alert">
                      <div className="invalid-label">
                        <TriangleAlert size={18} /> Check failed
                      </div>
                      <h2>Check the original.</h2>
                      <p>{checked.message}</p>
                      <p className="check-note">
                        The checker detects errors. It does not guess or repair
                        characters.
                      </p>
                    </div>
                  )
                ) : (
                  <div className="check-guide">
                    <h2>A little guide to the string.</h2>
                    <div
                      className="string-diagram"
                      aria-label="Example header: MS1 prefix, 2 threshold, NAME identifier, A share index"
                    >
                      <span>
                        MS1<small>prefix</small>
                      </span>
                      <span>
                        2<small>threshold</small>
                      </span>
                      <span>
                        NAME<small>identifier</small>
                      </span>
                      <span>
                        A<small>index</small>
                      </span>
                    </div>
                    <p>
                      The remaining characters carry the share data and
                      checksum.
                    </p>
                    <p>
                      <strong>A, C, D…</strong> identify pieces of a backup.
                      <br />
                      <strong>S</strong> identifies the complete secret.
                    </p>
                    <p className="check-note">
                      The threshold tells you how many shares are required, not
                      how many were created.
                    </p>
                  </div>
                )}
                <div className="folio">
                  <span>A checksum checks the text, not the wallet.</span>
                  <span>04</span>
                </div>
              </section>
            </div>
          </TabsContent>
          <TabsContent value="print">
            <div className="book print-book">
              <section className="book-page entry-page">
                <div className="running-head">
                  <span>CHAPTER III</span>
                  <span>PAPER PRACTICE</span>
                </div>
                <h2>Take it to paper.</h2>
                <p className="intro">
                  Print the three public example cards. Put one aside, then use
                  the other two to practice recovery.
                </p>
                <ol className="paper-steps">
                  <li>Print on A4 or US Letter, at 100% scale.</li>
                  <li>
                    Each page holds one clearly labeled share and a short
                    practice guide.
                  </li>
                  <li>
                    Recover with any two cards and compare the result in Chapter
                    I.
                  </li>
                </ol>
                <button
                  className="primary-button"
                  onClick={() => window.print()}
                >
                  <Printer size={18} /> Print three practice cards
                </button>
                <p className="quiet-line">
                  Black ink friendly · Public examples only
                </p>
                <div className="folio">
                  <span>A rehearsal, before a real recovery.</span>
                  <span>05</span>
                </div>
              </section>
              <section className="book-page result-page">
                <div className="running-head">
                  <span>YOUR PRACTICE CARDS</span>
                  <span>06</span>
                </div>
                <div className="card-preview-list">
                  {shares.map((share) => (
                    <div className="mini-card" key={share.index}>
                      <div>
                        <h3>Share {share.index}</h3>
                        <span className="small-label">2 REQUIRED · NAME</span>
                      </div>
                      <code>{grouped(share.text)}</code>
                      <p>PUBLIC PRACTICE DATA · NEVER FUND</p>
                    </div>
                  ))}
                </div>
                <div className="folio">
                  <span>Keep real backups away from websites.</span>
                  <span>06</span>
                </div>
              </section>
            </div>
          </TabsContent>
        </Tabs>
        <footer className="site-footer">
          <span>Codex32 · A practice companion</span>
          <a
            href="https://secretcodex32.com/docs/2023-03-07--color.pdf"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen size={15} /> Read the original codex{' '}
            <ArrowRight size={14} />
          </a>
          <span>PUBLIC EXAMPLES · NO REAL FUNDS</span>
        </footer>
        <BookCredits />
      </main>
      <div className="print-document" aria-hidden="true">
        {shares.map((share) => (
          <article className="printed-page" key={share.index}>
            <header>
              <span>CODEX32 · PRACTICE COMPANION</span>
              <strong>PUBLIC PRACTICE DATA — NEVER FUND</strong>
            </header>
            <h1>Practice share {share.index}</h1>
            <p>
              BIP93 example 2 · Identifier NAME · Any two of A, C, D recover the
              secret.
            </p>
            <div className="printed-share">
              <h2>Share {share.index} · 2 shares required</h2>
              <code>{grouped(share.text)}</code>
              <p>Spaces are only for readability.</p>
            </div>
            <h2>Practice recovery</h2>
            <ol>
              <li>
                Keep this card with one different card from the A, C, D set.
              </li>
              <li>
                Open the Codex32 practice companion and select those two shares
                in Chapter I.
              </li>
              <li>
                Recover the example. Confirm that the published secret and all
                three Signet addresses match.
              </li>
              <li>
                Repeat with a different pair. The recovered secret should be
                identical.
              </li>
            </ol>
            <p>
              To practice transcription, type this share into Chapter II. Change
              one character and check it again to see the checksum fail.
            </p>
            <aside>
              These strings and their seed are publicly known. They are for
              learning only. Never send funds to the example wallet. Never enter
              a real backup into this website.
            </aside>
            <footer>
              Source: BIP93, Test vector 2 · bitcoin/bips · BSD-3-Clause
              <br />
              Companion: codex32-practice-book.xenocardo.chatgpt.site
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
