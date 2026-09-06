import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import BookButton from '../components/book-button.ts';

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

await test('primary actions render readable enabled and disabled states without a stylesheet', () => {
  for (const disabled of [false, true]) {
    const markup = renderToStaticMarkup(
      createElement(BookButton, { disabled }, 'Recover practice secret'),
    );
    assert.match(markup, /^<button /);
    assert.match(markup, /type="button"/);
    assert.equal(markup.includes('disabled=""'), disabled);
    assert.match(markup, />Recover practice secret<\/button>$/);
    const styles = Object.fromEntries(
      markup
        .match(/style="([^"]+)"/)![1]
        .split(';')
        .map((entry) => entry.split(':')),
    );
    assert.equal(styles.appearance, 'none');
    assert.equal(styles['-webkit-appearance'], 'none');
    assert.equal(styles.opacity, '1');
    const foreground = luminance(styles.color);
    const background = luminance(styles.background);
    const contrast =
      (Math.max(foreground, background) + 0.05) /
      (Math.min(foreground, background) + 0.05);
    assert.ok(
      contrast >= 4.5,
      `Button text contrast must be readable: ${contrast}`,
    );
  }
});

await test('every primary workshop and workbench action uses the shared button', async () => {
  for (const path of [
    '../app/workshop/workshop.tsx',
    '../app/workshop/manual-lesson.tsx',
    '../app/workbench/workbench.tsx',
  ]) {
    const source = ts.createSourceFile(
      path,
      await readFile(new URL(path, import.meta.url), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    let sharedButtons = 0;
    function visit(node: ts.Node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(source);
        if (name === 'BookButton') sharedButtons++;
        for (const attribute of node.attributes.properties) {
          if (
            !ts.isJsxAttribute(attribute) ||
            attribute.name.getText(source) !== 'className'
          )
            continue;
          const value = attribute.initializer?.getText(source) ?? '';
          assert.ok(
            !value.includes('primary-button'),
            `${path}: primary actions must use BookButton, not a locally styled ${name}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(
      sharedButtons > 0,
      `${path} must include the shared primary actions`,
    );
  }
});
