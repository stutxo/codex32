import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(project, 'dist/client');
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
const origin = 'https://static-export.invalid';
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    assert.ok(
      !entry.isSymbolicLink(),
      `Export contains a symlink: ${entry.name}`,
    );
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else files.push(path);
  }
}
walk(output);
for (const route of ['', 'workshop/', 'workbench/']) {
  assert.ok(
    existsSync(join(output, route, 'index.html')),
    `Missing route: /${route}`,
  );
}

let references = 0;
function checkReference(reference, page) {
  if (!reference || reference.startsWith('#')) return;
  const url = new URL(reference.replaceAll('&amp;', '&'), page);
  if (url.origin !== origin) return;
  assert.ok(
    url.pathname.startsWith(`${base}/`),
    `URL escapes hosting path: ${url.pathname}`,
  );
  const relative = decodeURIComponent(url.pathname.slice(base.length + 1));
  const path = join(output, relative);
  assert.ok(
    existsSync(path) || existsSync(join(path, 'index.html')),
    `Missing exported target: ${url.pathname}`,
  );
  references++;
}
for (const file of files) {
  const relative = file.slice(output.length + 1);
  const page = `${origin}${base}/${relative}`;
  if (file.endsWith('.html')) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /(?:href|src)="([^"]+)"/g,
    )) {
      checkReference(match[1], page);
    }
  } else if (file.endsWith('.css')) {
    for (const match of readFileSync(file, 'utf8').matchAll(
      /url\(\s*["']?([^\s"')]+)["']?\s*\)/g,
    )) {
      checkReference(match[1], page);
    }
  } else if (file.endsWith('.js')) {
    // Includes the lazy-loaded WASM URL, which is absent from prerendered HTML.
    for (const match of readFileSync(file, 'utf8').matchAll(
      /["'](\/[^"'\s]+\.(?:wasm|png|css|js))["']/g,
    )) {
      checkReference(match[1], page);
    }
  }
}
const wasm = files.filter((file) => file.endsWith('.wasm'));
assert.equal(wasm.length, 1, 'Expected the single tested browser WASM module');
const hash = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
assert.equal(
  hash(wasm[0]),
  hash(join(project, 'lib/wasm/codex32_wasm_bg.wasm')),
);
assert.equal(
  files.filter((file) => file.includes('/art/') && file.endsWith('.png'))
    .length,
  11,
);
console.log(
  `Static export verified at ${base || '/'}: 3 routes, ${references} local references, 11 artwork assets, tested WASM.`,
);
