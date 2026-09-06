import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { wheelData } from '../lib/workshop.ts';

// Compile the actual SVG components with the project's TypeScript compiler.
// No DOM mock or duplicate rendering implementation is used for the regression.
async function component(filename: string) {
  const source = await readFile(
    new URL('../app/workshop/' + filename, import.meta.url),
    'utf8',
  );
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    })
    .outputText.replace(
      /from (["'])([^"']+)\1/g,
      (_, quote: string, specifier: string) => {
        const resolved = specifier.startsWith('@/lib/')
          ? new URL('../lib/' + specifier.slice(6) + '.ts', import.meta.url)
              .href
          : import.meta.resolve(specifier);
        return 'from ' + quote + resolved + quote;
      },
    );
  return (
    await import(
      'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
    )
  ).default;
}
const text = (markup: string) =>
  [...markup.matchAll(/<text[^>]*>(.*?)<\/text>/g)].map((match) => match[1]);
const noop = () => {};

await test('turning the actual addition SVG changes the top transform and never rewrites its printed ink', async () => {
  const Disc = await component('addition-disc.tsx');
  let printed: string[] | undefined;
  for (let i = 0; i < 32; i++) {
    const angle = (i * 360) / 32;
    const markup = renderToStaticMarkup(
      createElement(Disc, {
        id: 'paper',
        angle,
        other: 'C',
        onPrimary: noop,
        onOther: noop,
      }),
    );
    assert.ok(
      markup.includes(`class="addition-top-disc" transform="rotate(${angle})"`),
    );
    assert.equal((markup.match(/class="addition-window"/g) ?? []).length, 32);
    assert.ok(markup.includes('mask="url(#paper-windows)"'));
    const current = text(markup);
    assert.equal(current.length, 1088); // 1,024 results + 32 outer labels + 32 window labels.
    if (printed) assert.deepEqual(current, printed);
    printed = current;
  }
});

await test('all actual ring faces rotate their fixed printed text with the artwork and handle', async () => {
  const Disc = await component('ring-disc.tsx');
  for (const kind of ['recovery', 'translation', 'fusion'] as const) {
    const order =
      wheelData[
        kind === 'recovery'
          ? 'recoveryOrder'
          : kind === 'translation'
            ? 'translationOrder'
            : 'fusionOrder'
      ];
    let printed: string[] | undefined;
    for (let i = 0; i < 31; i++) {
      const angle = (i * 360) / 31;
      const markup = renderToStaticMarkup(
        createElement(Disc, {
          kind,
          order,
          angle,
          other: 'C',
          onPrimary: noop,
          onOther: noop,
        }),
      );
      assert.ok(
        markup.includes(`class="ring-top-disc" transform="rotate(${angle})"`),
      );
      assert.ok(markup.includes('fill-rule="evenodd"'));
      if (printed) assert.deepEqual(text(markup), printed);
      printed = text(markup);
    }
  }
});
