import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
    assert.ok(markup.includes('/art/addition-bottom-glyphs.svg'));
    assert.ok(markup.includes('/art/addition-top-glyphs.svg'));
    assert.ok(markup.includes('/art/addition-outer-titles.svg'));
    assert.ok(
      markup.indexOf('/art/addition-bottom-glyphs.svg') <
        markup.indexOf('class="addition-top-disc"'),
    );
    assert.ok(
      markup.indexOf('/art/addition-top-glyphs.svg') >
        markup.indexOf('mask="url(#paper-windows)"'),
    );
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
      const split = markup.indexOf('class="ring-top-disc"');
      assert.ok(
        markup.slice(0, split).includes(`/art/${kind}-bottom-glyphs.svg`),
      );
      assert.ok(
        markup.slice(0, split).includes(`/art/${kind}-outer-titles.svg`),
      );
      assert.ok(markup.slice(split).includes(`/art/${kind}-top-glyphs.svg`));
      assert.ok(
        markup.slice(split).includes(`/art/${kind}-top-annotations.svg`),
      );
      assert.equal(
        (markup.match(/class="ring-printed-letter" opacity="0"/g) ?? []).length,
        62,
      );
      if (kind === 'fusion')
        assert.ok(markup.includes('transform="rotate(45)"'));
      if (kind === 'translation')
        assert.ok(
          markup.slice(split).includes('/art/translation-zero-reminder.svg'),
        );
      if (printed) assert.deepEqual(text(markup), printed);
      printed = text(markup);
    }
  }
});

await test('published art and printed glyph paths match their provenance and need no substituted fonts', async () => {
  const directory = new URL('../public/art/', import.meta.url);
  for (const name of ['provenance.json', 'printed-ink-provenance.json']) {
    const manifest = JSON.parse(
      await readFile(new URL(name, directory), 'utf8'),
    );
    assert.equal(
      manifest.pdf_sha256,
      '9156c7ccf7dbf7fa5eb183af45296bfa132c348bd4583f737c1741482b92c236',
    );
    for (const asset of manifest.assets) {
      const bytes = await readFile(new URL(asset.file, directory));
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        asset.sha256,
        asset.file,
      );
      assert.equal(bytes.length, asset.bytes);
      if (name === 'printed-ink-provenance.json') {
        const svg = bytes.toString();
        assert.match(svg, /<path /);
        assert.doesNotMatch(
          svg,
          /<(?:text|script|image|foreignObject)\b|\b(?:href|font-family)=/,
        );
      }
    }
  }
});
