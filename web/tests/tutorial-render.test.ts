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
} from '../lib/workbook.ts';
import {
  confirmTutorialReading,
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
  let refs = [], effects = [], refIndex = 0, effectIndex = 0, pending = [];
  export function useRef(value) { return refs[refIndex++] ??= { current: value }; }
  export function useId() { return 'pointer-test'; }
  export function useEffect(run, deps) {
    const i = effectIndex++, prev = effects[i];
    if (!deps || !prev || deps.some((value, j) => !Object.is(value, prev.deps[j])))
      pending.push(() => { prev?.cleanup?.(); effects[i] = { deps, cleanup: run() }; });
  }
  export function begin() { refIndex = 0; effectIndex = 0; }
  export function commit() { pending.splice(0).forEach(run => run()); }
  export function unmount() {
    effects.forEach(effect => effect?.cleanup?.());
    refs = []; effects = []; pending = [];
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
    let progress = tutorialCalculation(exercise, emptyLesson(), 'S');
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

await test('translation holds the factor while reading new characters and unlocks for the next share', () => {
  for (const [exercise, target] of [
    [shareExercise(engine, session, ['A', 'C'], 'D'), 'D'],
    [shareExercise(engine, session, ['A', 'C'], 'S'), 'S'],
    [shareExercise(engine, session, ['A', 'D'], 'S'), 'S'],
    [shareExercise(engine, session, ['C', 'D'], 'S'), 'S'],
  ] as const) {
    const first = exercise.steps.findIndex(
      (step) => step.kind === 'translation',
    );
    const props = {
      engine,
      exercise,
      target,
      session,
      example: false,
      active: true,
      onChange: noop,
      onComplete: noop,
      onContinue: noop,
      onReset: noop,
      continueLabel: 'Next',
    };
    const render = (
      progress: ReturnType<typeof emptyLesson>,
      example = false,
    ) =>
      renderToStaticMarkup(
        createElement(TutorialLesson, { ...props, progress, example }),
      );
    const rotation = (markup: string) =>
      markup.match(/class="ring-top-disc" transform="([^"]+)"/)?.[1];
    let progress = {
      ...emptyLesson(),
      cursor: first,
      answers: exercise.steps.slice(0, first).map((step) => step.answer),
      primary: exercise.steps[first].left!,
      tutorialStage: exercise.steps[first].id,
    };
    let initialRotation: string | undefined;
    // Every translation row uses manual confirmation at one fixed setting.
    while (exercise.steps[progress.cursor]?.id.endsWith('-translate-0')) {
      const step = exercise.steps[progress.cursor];
      const markup = render(progress);
      assert.ok(!markup.includes('Auto-fill next letter'));
      assert.ok(!markup.includes('Auto-fill sets the wheel'));
      assert.ok(markup.includes('>Confirm character</button>'));
      assert.ok(markup.includes('data-turning-locked="true"'));
      assert.ok(markup.includes('no turning needed'));
      assert.ok(markup.includes('>Adjust wheel</button>'));
      assert.ok(!activeToolbar(markup, 'wheel-turn-buttons'));
      assert.ok(activeToolbar(markup, 'wheel-held-notice'));
      assert.ok(markup.includes('data-wheel-mark="factor"'));
      assert.ok(markup.includes('data-wheel-mark="read"'));
      assert.ok(
        markup.includes(
          'Read ' +
            step.right +
            ' → ' +
            step.answer +
            '. Confirm ' +
            step.answer,
        ),
      );
      initialRotation ??= rotation(markup);
      assert.equal(
        rotation(markup),
        initialRotation,
        'Only the read highlight moves',
      );
      const result = confirmTutorialReading(engine, exercise, progress, target);
      assert.equal(result.correct, true);
      progress = {
        ...restoreLesson(exercise, result.progress),
        tutorialStage: progress.tutorialStage,
      };
    }
    const nextShare = exercise.steps[progress.cursor];
    assert.ok(nextShare.id.endsWith('-translate-1'));
    const changed = render(progress);
    assert.ok(!changed.includes('Auto-fill next letter'));
    assert.ok(
      /<button\b[^>]*disabled=""[^>]*>Confirm character<\/button>/.test(
        changed,
      ),
    );
    assert.ok(changed.includes('data-turning-locked="false"'));
    assert.ok(activeToolbar(changed, 'wheel-turn-buttons'));
    assert.ok(
      changed.includes('Set the handle to factor <b>' + nextShare.left),
    );
    assert.equal(
      rotation(changed),
      initialRotation,
      'Changing shares must not turn the wheel automatically',
    );
    assert.equal(
      confirmTutorialReading(engine, exercise, progress, target).correct,
      false,
    );
    const aligned = { ...progress, primary: nextShare.left! };
    assert.ok(render(aligned).includes('data-turning-locked="true"'));
    assert.equal(
      confirmTutorialReading(engine, exercise, aligned, target).correct,
      true,
    );
    {
      let secondRow = aligned;
      const secondRotation = rotation(render(secondRow));
      while (exercise.steps[secondRow.cursor]?.id.endsWith('-translate-1')) {
        const markup = render(secondRow);
        assert.ok(!markup.includes('Auto-fill next letter'));
        assert.ok(!markup.includes('Auto-fill sets the wheel'));
        assert.ok(markup.includes('>Confirm character</button>'));
        assert.equal(rotation(markup), secondRotation);
        const result = confirmTutorialReading(
          engine,
          exercise,
          secondRow,
          target,
        );
        assert.equal(result.correct, true);
        secondRow = {
          ...result.progress,
          tutorialStage: secondRow.tutorialStage,
        };
      }
      assert.ok(instrumentHandoff(exercise, secondRow));
      const addition = exercise.steps[secondRow.cursor];
      const additionMarkup = render({
        ...secondRow,
        tutorialStage: addition.id,
      });
      assert.ok(
        additionMarkup.includes('Auto-fill next letter'),
        'Addition still needs wheel turns',
      );
    }

    const last =
      exercise.steps.findIndex((step) => step.kind === 'addition') - 1;
    const handoff = confirmTutorialReading(
      engine,
      exercise,
      {
        ...emptyLesson(),
        cursor: last,
        answers: exercise.steps.slice(0, last).map((step) => step.answer),
        primary: exercise.steps[last].left!,
      },
      target,
    ).progress;
    assert.ok(instrumentHandoff(exercise, handoff));
    assert.ok(render(handoff).includes('data-turning-locked="true"'));
    assert.ok(!render(handoff).includes('>Adjust wheel</button>'));

    const example = render(
      {
        ...emptyLesson(),
        exampleCursor: first,
        exampleWheel: {
          ...emptyLesson().exampleWheel,
          primary: exercise.steps[first].left!,
        },
      },
      true,
    );
    assert.ok(activeToolbar(example, 'wheel-turn-buttons'));
    assert.ok(!example.includes('data-wheel-mark='));
    assert.ok(example.includes('Show the correct setting'));
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

await test('every practice tutorial exposes Confirm and only offers applicable Auto-fill controls', () => {
  for (const [exercise, target] of [
    [checksumExercise(engine, session.shares.A), 'S'],
    [checksumExercise(engine, session.shares.C, true), 'S'],
    [shareExercise(engine, session, ['A', 'C'], 'D'), 'D'],
    [shareExercise(engine, session, ['C', 'D'], 'S'), 'S'],
  ] as const) {
    const preview = tutorialCalculation(exercise, emptyLesson(), target);
    const step = exercise.steps[preview.cursor];
    const props = {
      engine,
      exercise,
      target,
      session,
      example: false,
      active: true,
      onChange: noop,
      onComplete: noop,
      onContinue: noop,
      onReset: noop,
      continueLabel: 'Next',
    };
    let workedExample: string | undefined;
    for (const aligned of [true, false]) {
      const primary = aligned
        ? step.left![preview.column]
        : alphabet
            .split('')
            .find(
              (letter) =>
                letter !== step.left![preview.column] && letter !== 'Q',
            )!;
      const progress = { ...preview, primary };
      const saved = structuredClone(progress);
      const markup = renderToStaticMarkup(
        createElement(TutorialLesson, { ...props, progress }),
      );
      assert.deepEqual(progress, saved, 'Explanations do not record answers');
      assert.ok(markup.includes('<summary>How does this work?</summary>'));
      assert.ok(!markup.includes('What is the computer doing?'));
      const calculation = markup.match(
        /<figure class="math-worked-example">[\s\S]*?<\/figure>/,
      )?.[0];
      if (aligned) workedExample = calculation;
      else
        assert.equal(
          calculation,
          workedExample,
          'The teaching example is not a wrong wheel reading',
        );
      const confirm = markup.match(
        /<button\b[^>]*>Confirm (?:character|factor)<\/button>/,
      )?.[0];
      assert.ok(
        confirm,
        'The learner needs a Confirm button in every worksheet',
      );
      assert.equal(confirm.includes('disabled=""'), !aligned);
      const input = markup.match(
        /<input\b[^>]*tutorial-wheel-character[^>]*>/,
      )?.[0];
      assert.ok(input, 'The current reading must fill a character box');
      assert.match(input, /readonly=""/i);
      if (aligned)
        assert.match(
          input,
          new RegExp('value="' + step.answer[preview.column] + '"'),
        );
      assert.equal(
        /Auto-fill next (?:letter|factor)/.test(markup),
        step.kind !== 'translation',
      );
      assert.ok(!markup.includes('Turn &amp; fill next letter'));
      assert.equal(
        confirmTutorialReading(engine, exercise, progress, target).correct,
        aligned,
      );
    }
    const example = renderToStaticMarkup(
      createElement(TutorialLesson, {
        ...props,
        progress: emptyLesson(),
        example: true,
      }),
    );
    assert.doesNotMatch(example, />Confirm (?:character|factor)<\/button>/);
    assert.match(example, /Show the correct setting/);
  }
});
