import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as engine from '../lib/wasm/codex32_wasm.js';
import { alphabet, publishedSession } from '../lib/workshop.ts';
import {
  checksumExercise,
  emptyLesson,
  shareExercise,
  restoreLesson,
  migrateLegacyLesson,
} from '../lib/workbook.ts';
import {
  confirmTutorialReading,
  autoStage,
  openNextStage,
  tutorialCalculation,
  finishTutorialReading,
  instrumentHandoff,
} from '../lib/workbook-guide.ts';

// Render the real tutorial and its controls, resolving TSX with the installed
// compiler. Testing only the answer helper missed the recovery-only UI guard.
// A small hook harness lets us exercise the real pointer handlers without a
// browser. This checks event wiring/capture, not physical-device touch feel.
const pointerHookUrl =
  'data:text/javascript;base64,' +
  Buffer.from(`
  let refs = [], effects = [], states = [], stateIndex = 0, refIndex = 0, effectIndex = 0, pending = [];
  export function useState(initial) {
    const i = stateIndex++;
    if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
    return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
  }
  export function useRef(value) { return refs[refIndex++] ??= { current: value }; }
  export function useId() { return 'pointer-test'; }
  export function useEffect(run, deps) {
    const i = effectIndex++, prev = effects[i];
    if (!deps || !prev || deps.some((value, j) => !Object.is(value, prev.deps[j])))
      pending.push(() => { prev?.cleanup?.(); effects[i] = { deps, cleanup: run() }; });
  }
  export function begin() { refIndex = 0; effectIndex = 0; stateIndex = 0; }
  export function commit() { pending.splice(0).forEach(run => run()); }
  export function unmount() {
    effects.forEach(effect => effect?.cleanup?.());
    refs = []; effects = []; states = []; pending = [];
  }
`).toString('base64');
const modules = new Map<string, Promise<string>>();
function componentUrl(url: URL): Promise<string> {
  if (!url.pathname.endsWith('.tsx')) return Promise.resolve(url.href);
  if (!modules.has(url.href)) modules.set(url.href, compile(url));
  return modules.get(url.href)!;
}
async function compile(url: URL) {
  let source = ts.transpileModule(await readFile(url, 'utf8'), {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  for (const [statement, quote, specifier] of source.matchAll(
    /from (["'])([^"']+)\1/g,
  )) {
    let resolved: string;
    if (specifier.startsWith('@/') || specifier.startsWith('.')) {
      const base = specifier.startsWith('@/')
        ? new URL('../' + specifier.slice(2), import.meta.url)
        : new URL(specifier, url);
      const file = [
        base,
        new URL(base.href + '.ts'),
        new URL(base.href + '.tsx'),
      ].find((candidate) => existsSync(candidate));
      assert.ok(file, 'Resolve ' + specifier);
      resolved = await componentUrl(file);
    } else if (specifier === 'react' && url.search === '?pointer-test') {
      resolved = pointerHookUrl;
    } else resolved = import.meta.resolve(specifier);
    source = source.replace(statement, 'from ' + quote + resolved + quote);
  }
  return (
    'data:text/javascript;base64,' + Buffer.from(source).toString('base64')
  );
}
const TutorialLesson = (
  await import(
    await componentUrl(
      new URL('../app/workshop/tutorial-lesson.tsx', import.meta.url),
    )
  )
).default;
const MathExplanation = (
  await import(
    await componentUrl(
      new URL('../app/workshop/math-explanation.tsx', import.meta.url),
    )
  )
).default;
engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});
const session = publishedSession(engine);
const noop = () => {};

await test('the shared footer exposes this website and the original website sources separately', async () => {
  const SiteFooter = (
    await import(
      await componentUrl(
        new URL('../app/workshop/site-footer.tsx', import.meta.url),
      )
    )
  ).default;
  const markup = renderToStaticMarkup(createElement(SiteFooter));
  assert.match(markup, /^<footer class="site-footer">/);
  assert.match(
    markup,
    /<nav class="footer-resources" aria-label="Project and resources">/,
  );
  const links = [...markup.matchAll(/<a href="([^"]+)"([^>]*)>(.*?)<\/a>/g)];
  const resources = [
    ['https://github.com/stutxo/codex32', 'This website’s GitHub'],
    ['https://secretcodex32.com/', 'Secret Codex32'],
    [
      'https://github.com/apoelstra/volvelle-website',
      'Secret Codex32’s GitHub',
    ],
  ];
  for (const [href, label] of resources) {
    const matches = links.filter((link) => link[1] === href);
    assert.equal(matches.length, 1);
    assert.ok(matches[0][3].includes(label));
    assert.match(matches[0][2], /target="_blank"/);
    assert.match(matches[0][2], /rel="noreferrer"/);
  }
  assert.ok(
    markup.includes('Read the original codex'),
    'Keep the original book link',
  );
  assert.ok(!markup.includes('<details'), 'Resources are always visible');
  const workshop = await readFile(
    new URL('../app/workshop/workshop.tsx', import.meta.url),
    'utf8',
  );
  assert.match(workshop, /<SiteFooter\s*\/>\s*<BookCredits\s*\/>/);
  const css = await readFile(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.footer-resource-links\s*\{[^}]*flex-wrap: wrap;/);
  assert.match(css, /\.footer-resource-links\s*\{\s*flex-direction: column;/);
  assert.match(css, /\.site-footer a\s*\{[^}]*min-height: 44px;/);
});

await test('each wheel keeps a single accessible circular grip, including when held', async () => {
  const Wheel = (
    await import(
      await componentUrl(new URL('../app/workshop/wheel.tsx', import.meta.url))
    )
  ).default;
  for (const kind of ['addition', 'recovery', 'translation', 'fusion']) {
    for (const locked of kind === 'translation' ? [false, true] : [false]) {
      const markup = renderToStaticMarkup(
        createElement(Wheel, {
          engine,
          kind,
          primary: 'V',
          other: 'X',
          target: 'S',
          factorSide: false,
          onPrimary: noop,
          onOther: noop,
          onFactorSide: noop,
          translationGuide:
            kind === 'translation' ? { locked, onAdjust: noop } : undefined,
        }),
      );
      const grips = [
        ...markup.matchAll(/<button[^>]*class="wheel-drag-handle"[^>]*>/g),
      ];
      assert.equal(
        grips.length,
        1,
        'Never duplicate the grip in the magnifier',
      );
      assert.equal(grips[0][0].includes('disabled=""'), locked);
      assert.match(grips[0][0], /type="button"/);
      assert.match(grips[0][0], /aria-label="/);
      assert.match(
        markup,
        /class="wheel-surface"><div class="wheel-disc-frame">/,
      );
      assert.ok(markup.includes('drag the purple grip around the circle'));
      assert.ok(!markup.includes('Swipe sideways to turn'));
    }
  }
});

await test('real wheel handlers capture the grip immediately, preserve mouse clicks, and release on lock or unmount', async () => {
  const hooks = await import(pointerHookUrl);
  const Wheel = (
    await import(
      await componentUrl(
        new URL('../app/workshop/wheel.tsx?pointer-test', import.meta.url),
      )
    )
  ).default;
  const captures = new Set<number>();
  const owner = () => ({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 320 }),
    setPointerCapture: (id: number) => {
      captures.add(id);
    },
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => {
      captures.delete(id);
    },
  });
  const svg = owner();
  const grip = owner();
  const turns: string[] = [];
  const props = {
    engine,
    kind: 'translation',
    primary: 'P',
    other: 'X',
    target: 'S',
    factorSide: false,
    onPrimary: noop,
    onOther: noop,
    onFactorSide: noop,
    onTurn: (letter: string) => turns.push(letter),
    translationGuide: { locked: false },
  };
  // The element tree is inspected before React mounts it; handlers are the
  // actual component closures, while capture ownership is a controlled stub.
  type ElementTree = {
    type: string;
    props: {
      className?: string;
      children?: ElementTree | ElementTree[];
      ref: { current: typeof svg };
    } & Record<
      | 'onPointerDown'
      | 'onPointerUp'
      | 'onPointerMove'
      | 'onPointerLeave'
      | 'onPointerCancel'
      | 'onPointerDownCapture',
      (pointer: ReturnType<typeof event>) => void
    >;
  };
  function find(node: ElementTree, className: string): ElementTree | undefined {
    if (node.props?.className === className) return node;
    const children = Array.isArray(node.props?.children)
      ? node.props.children
      : [node.props?.children];
    for (const child of children) {
      if (child && typeof child === 'object') {
        const found = find(child, className);
        if (found) return found;
      }
    }
  }
  function render() {
    hooks.begin();
    const tree = Wheel(props);
    const disc = find(tree, 'volvelle')!;
    disc.props.ref.current = svg;
    hooks.commit();
    return { tree, disc, handle: find(tree, 'wheel-drag-handle')! };
  }
  const event = (currentTarget: typeof svg, changes = {}) => ({
    currentTarget,
    target: currentTarget,
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: 320,
    clientY: 160,
    ...changes,
  });
  try {
    let ui = render();
    ui.disc.props.onPointerDown(event(svg, { pointerType: 'mouse' }));
    assert.equal(
      captures.size,
      0,
      'A mouse label click must not be retargeted',
    );
    ui.disc.props.onPointerUp(event(svg, { pointerType: 'mouse' }));
    assert.equal(turns.length, 0);
    ui.handle.props.onPointerDown(event(grip));
    assert.equal(captures.has(1), true, 'Grip captures before movement begins');
    ui.handle.props.onPointerMove(event(grip, { clientX: 160, clientY: 320 }));
    assert.equal(turns.length, 1);
    props.primary = turns.at(-1)!;
    ui = render();
    assert.equal(captures.has(1), true, 'A slot rerender preserves capture');
    ui.handle.props.onPointerLeave(event(grip));
    assert.equal(
      captures.has(1),
      true,
      'Leaving the grip while captured keeps turning',
    );
    ui.handle.props.onPointerUp(event(grip, { clientX: 0, clientY: 160 }));
    assert.equal(turns.length, 2, 'The final pointerup movement is recorded');
    assert.equal(captures.size, 0);
    ui.handle.props.onPointerDown(event(grip));
    props.translationGuide.locked = true;
    ui = render();
    assert.equal(captures.size, 0, 'Holding a factor releases capture');
    ui.handle.props.onPointerMove(event(grip, { clientX: 160, clientY: 320 }));
    assert.equal(turns.length, 2);
    props.translationGuide.locked = false;
    ui = render();
    ui.handle.props.onPointerDown(event(grip));
    ui.tree.props.onPointerDownCapture(
      event(svg, { pointerId: 2, isPrimary: false }),
    );
    assert.equal(captures.size, 0, 'A second touch cancels turning');
    ui.handle.props.onPointerDown(event(grip));
    ui.handle.props.onPointerCancel(event(grip));
    assert.equal(captures.size, 0);
    ui.handle.props.onPointerDown(event(grip));
    hooks.unmount();
    assert.equal(captures.size, 0, 'Unmount releases the active grip');
  } finally {
    hooks.unmount();
  }
});

function activeToolbar(markup: string, className: string) {
  const toolbar = markup.match(
    new RegExp(`<div class="${className}"[^>]*>`),
  )?.[0];
  return Boolean(toolbar && !toolbar.includes('inert=""'));
}

await test('actual paper controls wait for Next and flip, and one fill cannot consume migrated later rows', async (t) => {
  const Manual = (
    await import(
      await componentUrl(
        new URL(
          '../app/workshop/manual-lesson.tsx?pointer-test',
          import.meta.url,
        ),
      )
    )
  ).default;
  const hooks = await import(pointerHookUrl);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const frame = globalThis.requestAnimationFrame;
  const cancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 0;
  globalThis.cancelAnimationFrame = () => {};
  const exercise = shareExercise(engine, session, ['A', 'C'], 'D');
  const props = {
    engine,
    exercise,
    session,
    target: 'D',
    example: false,
    active: true,
    progress: autoStage(exercise, emptyLesson()).progress,
    onChange(value: ReturnType<typeof emptyLesson>) {
      props.progress = value;
    },
    onComplete: noop,
  };
  type Tree = {
    props?: { children?: unknown; onClick?: () => void; disabled?: boolean };
  };
  const label = (node: unknown): string =>
    Array.isArray(node)
      ? node.map(label).join('')
      : typeof node === 'string'
        ? node
        : typeof node === 'object' && node
          ? label((node as Tree).props?.children)
          : '';
  function button(node: unknown, text: string): Tree | undefined {
    if (Array.isArray(node))
      return node.map((child) => button(child, text)).find(Boolean);
    if (!node || typeof node !== 'object') return undefined;
    const tree = node as Tree;
    if (tree.props?.onClick && label(tree.props.children) === text) return tree;
    return button(tree.props?.children, text);
  }
  function render() {
    hooks.begin();
    const tree = Manual(props);
    hooks.commit();
    return tree;
  }
  try {
    let tree = render();
    assert.ok(instrumentHandoff(exercise, props.progress));
    assert.equal(button(tree, 'Auto-fill next letter'), undefined);
    button(tree, 'Return to my current step')!.props!.onClick!();
    tree = render();
    assert.ok(
      instrumentHandoff(exercise, props.progress),
      'Review navigation is not Next',
    );
    button(tree, 'Next: Fusion side → Translation side')!.props!.onClick!();
    tree = render();
    const fill = button(tree, 'Auto-fill next letter')!;
    assert.equal(fill.props!.disabled, true);
    fill.props!.onClick!(); // Handler is guarded even if called directly.
    assert.equal(props.progress.answers.length, 2);
    button(tree, 'Auto-set factor')!.props!.onClick!();
    tree = render();
    assert.equal(props.progress.factorSide, true);
    assert.equal(props.progress.answers.length, 2);
    button(tree, 'Next: Flip to translation')!.props!.onClick!();
    tree = render();
    assert.equal(props.progress.factorSide, false);
    assert.equal(props.progress.answers.length, 2);
    hooks.unmount();

    // A real v1 save used interleaved translate-A/translate-C/add entries.
    const oldSteps = exercise.steps.slice(0, 2);
    for (let i = 0; i < 45; i++)
      for (const suffix of ['translate-0', 'translate-1', 'add'])
        oldSteps.push(
          exercise.steps.find(
            (step) => step.id === 'column-' + i + '-' + suffix,
          )!,
        );
    const migrated = migrateLegacyLesson(exercise, {
      ...emptyLesson(),
      answers: oldSteps.slice(0, 134).map((step) => step.answer),
      cursor: 134,
    });
    assert.equal(migrated.answers.length, 46);
    props.progress = {
      ...migrated,
      primary: exercise.steps[46].left!,
      factorSide: false,
    };
    tree = render();
    button(tree, 'Auto-fill next letter')!.props!.onClick!();
    render();
    t.mock.timers.tick(650);
    assert.equal(
      props.progress.answers.length,
      47,
      'Only the last letter of the first share is recorded',
    );
    assert.ok(instrumentHandoff(exercise, props.progress));
    assert.ok(
      Object.keys(props.progress.deferredAnswers).length > 0,
      'Later checked work is preserved, not silently accepted',
    );
  } finally {
    hooks.unmount();
    globalThis.requestAnimationFrame = frame;
    globalThis.cancelAnimationFrame = cancel;
  }
});

await test('changing guidance reserves every message while exposing only the current one', async () => {
  const StableMessage = (
    await import(
      await componentUrl(
        new URL('../app/workshop/stable-message.tsx', import.meta.url),
      )
    )
  ).default;
  const messages = [
    'Turn to V before confirming.',
    'Correct setting.',
    'Recording…',
  ];
  let footprint: string | undefined;
  for (const active of [0, 1, 2]) {
    const markup = renderToStaticMarkup(
      createElement(StableMessage, { messages, active }),
    );
    assert.equal((markup.match(/aria-hidden="true"/g) ?? []).length, 2);
    assert.ok(markup.includes(`<span>${messages[active]}</span>`));
    const content = markup.replaceAll(' aria-hidden="true"', '');
    if (footprint)
      assert.equal(content, footprint, 'No message is mounted or removed');
    footprint = content;
  }
  const css = await readFile(
    new URL('../app/workshop/workshop.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.stable-message,[^{]*\{[^}]*display: grid;/);
  assert.match(css, /\.stable-message > span,[^{]*\{[^}]*grid-area: 1 \/ 1;/);
  assert.match(
    css,
    /\.stable-message > \[aria-hidden='true'\],[^{]*\{[^}]*visibility: hidden;/,
  );
  assert.match(css, /\.tutorial-grid\s*\{[^}]*align-items: start;/);
});

await test('the enlarged addition window and recorded result slot remain present between readings', () => {
  for (const verification of [false, true]) {
    const exercise = checksumExercise(engine, session.shares.A, verification);
    let progress: ReturnType<typeof emptyLesson> = {
      ...emptyLesson(),
      cursor: 1,
      answers: [exercise.steps[0].answer],
      tutorialStage: exercise.steps[1].id,
    };
    for (let index = 0; index < 5; index++) {
      const preview = tutorialCalculation(exercise, progress, 'S');
      const step = exercise.steps[preview.cursor];
      const left = step.left![preview.column];
      for (const primary of [
        left,
        alphabet[(alphabet.indexOf(left) + 1) % 32],
      ]) {
        const markup = renderToStaticMarkup(
          createElement(TutorialLesson, {
            engine,
            exercise,
            session,
            target: 'S',
            progress: { ...preview, primary },
            example: false,
            active: true,
            onChange: noop,
            onComplete: noop,
            onContinue: noop,
            onReset: noop,
            continueLabel: 'Next',
          }),
        );
        assert.equal(
          (markup.match(/class="paper-magnifier"/g) ?? []).length,
          1,
        );
        assert.ok(
          markup.includes(
            `Window ${step.right![preview.column]} · current reading`,
          ),
        );
        assert.equal(
          (markup.match(/class="tutorial-recorded"/g) ?? []).length,
          1,
        );
        assert.ok(
          markup.includes('<span>Last letter recorded:</span><b>—</b>'),
        );
        const confirm = markup.match(
          /<button\b[^>]*>Confirm character<\/button>/,
        )?.[0];
        assert.ok(confirm);
        assert.equal(confirm.includes('disabled=""'), primary !== left);
        const help = markup
          .match(/<output id="[^"]+-help"[^>]*>([\s\S]*?)<\/output>/)?.[1]
          .replace(/<span aria-hidden="true">[^<]*<\/span>/g, '');
        assert.ok(help);
        assert.equal(help.includes('Correct setting.'), primary === left);
        assert.equal(help.includes('before you confirm'), primary !== left);
      }
      const result =
        index % 2
          ? confirmTutorialReading(
              engine,
              exercise,
              { ...preview, primary: left },
              'S',
            )
          : finishTutorialReading(exercise, preview, 'S');
      assert.equal(result.correct, true);
      progress = result.progress;
    }
  }
});

await test('maths help starts closed and shows the current addition column as five-bit XOR', () => {
  assert.equal(engine.addSymbols('V', 'D').toUpperCase(), 'P');
  const exercise = checksumExercise(engine, session.shares.A);
  const step = {
    id: 'example-add',
    title: '',
    instruction: '',
    kind: 'addition',
    left: '?V',
    right: 'QD',
    answer: '?P',
  };
  const render = (column: number) =>
    renderToStaticMarkup(
      createElement(MathExplanation, { exercise, step, column, target: 'S' }),
    );
  const markup = render(1);
  assert.match(markup, /<summary>How does this work\?<\/summary>/);
  assert.doesNotMatch(markup, /<details\b[^>]*\bopen(?:[\s=>])/);
  assert.match(markup, /V     01100\nD XOR 01101\n      ─────\nP     00001/);
  assert.match(markup, /V \+ D = P/);
  assert.match(markup, /Q means zero and P means one/);
  assert.doesNotMatch(render(0), /<figure|<pre>/, 'Unknown is not zero');
  assert.doesNotMatch(render(2), /<figure|<pre>/, 'Missing is not zero');
});

await test('translation explanations use actual inputs and factors for each target and recovery pair', () => {
  assert.equal(engine.multiplySymbols('V', 'V').toUpperCase(), 'Z');
  for (const [pair, target] of [
    [['A', 'C'], 'D'],
    [['A', 'C'], 'S'],
    [['A', 'D'], 'S'],
    [['C', 'D'], 'S'],
  ] as const) {
    const exercise = shareExercise(engine, session, [...pair], target);
    for (const row of [0, 1]) {
      const step = exercise.steps.find((entry) =>
        entry.id.endsWith('-translate-' + row),
      )!;
      const markup = renderToStaticMarkup(
        createElement(MathExplanation, {
          exercise,
          step,
          column: 0,
          target,
        }),
      );
      const factor = exercise.steps[row];
      assert.match(markup, /<summary>What kind of multiplication\?<\/summary>/);
      assert.doesNotMatch(markup, /<details\b[^>]*\bopen(?:[\s=>])/);
      assert.ok(
        markup.includes(step.left + ' × ' + step.right + ' = ' + step.answer),
      );
      assert.ok(markup.includes('factor <b>' + factor.answer + '</b> fixed'));
      for (const weight of exercise.steps.slice(0, 2)) {
        // Verify the displayed interpolation formula using the actual engine.
        assert.equal(
          engine.multiplySymbols(
            weight.answer,
            engine.addSymbols(weight.left!, weight.right!),
          ),
          engine.addSymbols(target, weight.right!),
        );
        assert.ok(
          markup.includes(
            `(${target} + ${weight.right}) ÷ (${weight.left} + ${weight.right}) = <b>${weight.answer}</b>`,
          ),
        );
      }
      assert.ok(
        markup.includes(
          target === 'D' ? 'find share D' : 'find the secret at S',
        ),
      );
      assert.match(markup, /S is the secret’s index; it is not Q \(zero\)/);
      assert.equal(
        markup.includes('Which wheels does the book use?'),
        target === 'D',
      );
      if (target === 'D') {
        assert.ok(markup.includes('reuse the same translation wheel'));
        assert.ok(markup.includes('no recovery wheel is needed for D'));
        assert.ok(markup.includes('2023-03-07--color.pdf#page=25'));
      }
    }
  }
});

await test('checksum help distinguishes creating check characters from verifying a complete share', () => {
  for (const verification of [false, true]) {
    const exercise = checksumExercise(engine, session.shares.A, verification);
    const markup = renderToStaticMarkup(
      createElement(MathExplanation, {
        exercise,
        step: exercise.steps[1],
        column: 0,
        target: 'S',
      }),
    );
    assert.match(markup, /detect copying errors; it does not hide/);
    assert.equal(markup.includes('To verify a complete share'), verification);
    assert.equal(markup.includes('solves upward'), !verification);
    assert.doesNotMatch(markup, /Where do the factors come from/);
  }
});

await test('each translation row starts on fusion, flips explicitly, and then keeps its factor held', () => {
  for (const [exercise, target] of [
    [shareExercise(engine, session, ['A', 'C'], 'D'), 'D'],
    [shareExercise(engine, session, ['A', 'C'], 'S'), 'S'],
    [shareExercise(engine, session, ['A', 'D'], 'S'), 'S'],
    [shareExercise(engine, session, ['C', 'D'], 'S'), 'S'],
  ] as const) {
    const render = (progress: ReturnType<typeof emptyLesson>) =>
      renderToStaticMarkup(
        createElement(TutorialLesson, {
          engine,
          exercise,
          target,
          session,
          progress,
          example: false,
          active: true,
          onChange: noop,
          onComplete: noop,
          onContinue: noop,
          onReset: noop,
          continueLabel: 'Next',
        }),
      );
    let progress = autoStage(exercise, emptyLesson()).progress;
    for (const row of ['0', '1']) {
      assert.ok(instrumentHandoff(exercise, progress));
      const completed = render(progress);
      assert.ok(completed.includes('Step complete. Review it'));
      assert.ok(completed.includes('Next: Fusion side'));
      progress = openNextStage(exercise, progress);
      const factor = exercise.steps[progress.cursor].left!;
      const fusion = render(progress);
      assert.ok(fusion.includes('FUSION VOLVELLE'));
      assert.ok(fusion.includes('Auto-set this factor'));
      assert.ok(fusion.includes('Next: Flip to translation'));
      assert.ok(fusion.includes('data-turning-locked="false"'));
      assert.match(
        fusion,
        /<button[^>]*disabled=""[^>]*>Confirm character<\/button>/,
      );
      progress = { ...progress, primary: factor };
      assert.equal(
        confirmTutorialReading(engine, exercise, progress, target).correct,
        false,
      );
      progress = { ...progress, factorSide: false };
      let rotation: string | undefined;
      while (
        exercise.steps[progress.cursor]?.id.endsWith('-translate-' + row)
      ) {
        const markup = render(progress);
        const step = exercise.steps[progress.cursor];
        assert.ok(markup.includes('Auto-fill next letter'));
        assert.ok(markup.includes('Auto-fill this step'));
        assert.ok(markup.includes('data-turning-locked="true"'));
        assert.ok(markup.includes('no turning needed'));
        assert.ok(markup.includes('>Adjust wheel</button>'));
        assert.ok(!activeToolbar(markup, 'wheel-turn-buttons'));
        assert.ok(activeToolbar(markup, 'wheel-held-notice'));
        assert.ok(markup.includes('data-wheel-mark="factor"'));
        assert.ok(markup.includes('data-wheel-mark="read"'));
        assert.ok(markup.includes('Read ' + step.right + ' → ' + step.answer));
        const currentRotation = markup.match(
          /class="ring-top-disc" transform="([^"]+)"/,
        )?.[1];
        rotation ??= currentRotation;
        assert.equal(currentRotation, rotation);
        const result = confirmTutorialReading(
          engine,
          exercise,
          progress,
          target,
        );
        assert.equal(result.correct, true);
        progress = restoreLesson(exercise, result.progress);
      }
      assert.equal(progress.primary, factor);
      assert.ok(render(progress).includes('data-turning-locked="true"'));
    }
    assert.equal(instrumentHandoff(exercise, progress)!.next.kind, 'addition');
  }
});
await test('Adjust mode restores turning without changing the displayed factor or reading', async () => {
  const Wheel = (
    await import(
      await componentUrl(new URL('../app/workshop/wheel.tsx', import.meta.url))
    )
  ).default;
  const props = {
    engine,
    kind: 'translation',
    primary: 'V',
    other: 'V',
    guided: { primary: 'V', other: 'V' },
    controls: false,
    factorSide: false,
    showFlip: false,
    onPrimary: noop,
    onOther: noop,
    onFactorSide: noop,
  };
  for (const [locked, disabled] of [
    [true, false],
    [false, false],
    [true, true],
  ]) {
    const markup = renderToStaticMarkup(
      createElement(Wheel, {
        ...props,
        translationGuide: { locked, onAdjust: noop, disabled },
      }),
    );
    assert.equal(activeToolbar(markup, 'wheel-turn-buttons'), !locked);
    assert.equal(activeToolbar(markup, 'wheel-held-notice'), locked);
    assert.equal((markup.match(/class="wheel-turn-slot"/g) ?? []).length, 1);
    assert.ok(markup.includes('aria-hidden="true" inert=""'));
    const adjust = markup.match(/<button\b[^>]*>Adjust wheel<\/button>/)?.[0];
    assert.ok(adjust, 'Adjust keeps its space during auto-fill');
    assert.equal(adjust.includes('disabled=""'), disabled);
    assert.ok(markup.includes('data-wheel-mark="factor"'));
    assert.ok(markup.includes('data-wheel-mark="read"'));
  }
  const paper = renderToStaticMarkup(createElement(Wheel, props));
  assert.ok(activeToolbar(paper, 'wheel-turn-buttons'));
  assert.ok(!paper.includes('data-wheel-mark='));
});

await test('the book guide exposes copying and D table work, with persistent single-entry, stage-fill and Next controls', () => {
  for (const [exercise, target] of [
    [checksumExercise(engine, session.shares.A), 'S'],
    [checksumExercise(engine, session.shares.C, true), 'S'],
    [shareExercise(engine, session, ['A', 'C'], 'D'), 'D'],
    [shareExercise(engine, session, ['C', 'D'], 'S'), 'S'],
  ] as const) {
    const render = (progress: ReturnType<typeof emptyLesson>) =>
      renderToStaticMarkup(
        createElement(TutorialLesson, {
          engine,
          exercise,
          target,
          session,
          progress,
          example: false,
          active: true,
          onChange: noop,
          onComplete: noop,
          onContinue: noop,
          onReset: noop,
          continueLabel: 'Next: Verify share',
        }),
      );
    const untouched = emptyLesson();
    const initial = render(untouched);
    assert.deepEqual(untouched, emptyLesson());
    assert.ok(initial.includes('<summary>How does this work?</summary>'));
    assert.ok(initial.includes('Auto-fill this step'));
    assert.ok(initial.includes('Auto-fill next'));
    assert.ok(initial.includes('Next step'));
    assert.ok(initial.includes('class="book-stage-result"'));
    assert.ok(initial.includes('class="tutorial-recorded"'));
    assert.ok(!initial.includes('Auto-complete section'));
    assert.ok(!initial.includes('Skip the paper'));
    if (target === 'D') {
      assert.ok(initial.includes('DERIVATION TABLE'));
      assert.ok(!initial.includes('class="wheel-tool'));
      assert.ok(initial.includes('Factor from the table'));
    } else if (exercise.checksum) {
      assert.ok(
        initial.includes(
          exercise.verification
            ? 'Make a separate copy.'
            : 'The bottom row is given.',
        ),
      );
      assert.ok(!initial.includes('class="wheel-tool'));
    }
    const filled = autoStage(exercise, untouched);
    const paused = render(filled.progress);
    for (const selector of [
      'book-stage-actions',
      'book-stage-result',
      'tutorial-recorded',
      'tutorial-entry',
    ]) {
      assert.equal(
        (initial.match(new RegExp('class="' + selector + '"', 'g')) ?? [])
          .length,
        (paused.match(new RegExp('class="' + selector + '"', 'g')) ?? [])
          .length,
      );
    }
    assert.ok(paused.includes('Completed step'));
    assert.match(
      paused,
      /<button[^>]*disabled=""[^>]*>Auto-fill this step<\/button>/,
    );
    assert.equal(
      autoStage(exercise, filled.progress).progress,
      filled.progress,
    );
  }
});

await test('legacy parked wheel settings are used by both the rendered reading and its confirmation', () => {
  const exercise = shareExercise(engine, session, ['C', 'D'], 'S');
  const at = 3;
  const step = exercise.steps[at];
  const progress = {
    ...emptyLesson(),
    cursor: at,
    answers: exercise.steps.slice(0, at).map((entry) => entry.answer),
    parked: {
      [step.id]: {
        draft: '',
        wheel: {
          ...emptyLesson().exampleWheel,
          primary: step.left!,
          factorSide: false,
        },
      },
    },
  };
  const markup = renderToStaticMarkup(
    createElement(TutorialLesson, {
      engine,
      exercise,
      session,
      progress,
      target: 'S',
      example: false,
      active: true,
      onChange: noop,
      onComplete: noop,
      onContinue: noop,
      onReset: noop,
      continueLabel: 'Next',
    }),
  );
  assert.ok(markup.includes('data-turning-locked="true"'));
  assert.ok(!markup.includes('FUSION VOLVELLE'));
  assert.match(
    markup,
    /<button(?![^>]*disabled)[^>]*>Confirm character<\/button>/,
  );
  const current = tutorialCalculation(exercise, progress, 'S');
  assert.deepEqual(current.parked, {});
  assert.equal(
    confirmTutorialReading(engine, exercise, current, 'S').correct,
    true,
  );
  assert.ok(
    progress.parked[step.id],
    'Rendering itself does not mutate a saved workbook',
  );
});

await test('unknown cells keep the wheel footprint and every checksum stage renders before and after filling', () => {
  const exercise = checksumExercise(engine, session.shares.A);
  const render = (progress: ReturnType<typeof emptyLesson>) =>
    renderToStaticMarkup(
      createElement(TutorialLesson, {
        engine,
        exercise,
        session,
        progress,
        target: 'S',
        example: false,
        active: true,
        onChange: noop,
        onComplete: noop,
        onContinue: noop,
        onReset: noop,
        continueLabel: 'Next: Verify share A',
      }),
    );
  let progress = emptyLesson();
  while (progress.answers.length < exercise.steps.length) {
    progress = openNextStage(exercise, progress);
    assert.ok(render(progress).includes('Auto-fill this step'));
    progress = autoStage(exercise, progress).progress;
    assert.ok(render(progress).includes('Completed step'));
  }
  const at = exercise.steps.findIndex(
    (step) =>
      step.kind === 'addition' &&
      step.answer.includes('?') &&
      !/^\?+$/.test(step.answer),
  );
  const step = exercise.steps[at];
  const unknownColumn = step.answer.indexOf('?');
  const base = {
    ...emptyLesson(),
    cursor: at,
    answers: exercise.steps.slice(0, at).map((entry) => entry.answer),
    tutorialStage: step.id,
  };
  const known = render(base);
  const unknown = render({ ...base, column: unknownColumn });
  for (const markup of [known, unknown]) {
    assert.ok(markup.includes('class="book-instrument-stack"'));
    assert.equal((markup.match(/class="paper-magnifier"/g) ?? []).length, 1);
  }
  assert.match(unknown, /class="book-wheel-slot" aria-hidden="true" inert=""/);
  assert.ok(unknown.includes('>Confirm unknown cell</button>'));
  const one = finishTutorialReading(
    exercise,
    { ...base, column: unknownColumn },
    'S',
  );
  assert.equal(one.progress.answers.length, at);
  assert.equal(one.progress.draft[unknownColumn], '?');
});
