import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// beta.6 omits basePath and trailing-slash normalization on prerender requests.
// Its speculative renderer then silently skips every page as "dynamic".
// Keep this narrow workaround reproducible with npm ci; review it on upgrades.
const root = dirname(dirname(fileURLToPath(import.meta.resolve('vinext'))));
const version = JSON.parse(
  readFileSync(join(root, 'package.json'), 'utf8'),
).version;
assert.equal(
  version,
  '1.0.0-beta.6',
  'Review/remove the prerender workaround when upgrading vinext',
);
const file = join(root, 'dist/build/prerender.js');
let source = readFileSync(file, 'utf8');
const marker = '// Codex32: normalize base-path prerender requests.';
if (!source.startsWith(marker)) {
  const requests = [
    [
      '`http://localhost${urlPath}`, { headers: htmlHeaders }',
      '`http://localhost${config.basePath ?? ""}${normalizeTrailingSlashPathname(urlPath, config.trailingSlash) ?? urlPath}`, { headers: htmlHeaders }',
    ],
    [
      '`http://localhost${urlPath}`, { headers: rscHeaders }',
      '`http://localhost${config.basePath ?? ""}${normalizeTrailingSlashPathname(urlPath, config.trailingSlash) ?? urlPath}`, { headers: rscHeaders }',
    ],
    [
      '`http://localhost${NOT_FOUND_SENTINEL_PATH}`',
      '`http://localhost${config.basePath ?? ""}${normalizeTrailingSlashPathname(NOT_FOUND_SENTINEL_PATH, config.trailingSlash) ?? NOT_FOUND_SENTINEL_PATH}`',
    ],
  ];
  for (const [before, after] of requests) {
    assert.equal(
      source.split(before).length,
      2,
      'Unexpected vinext prerender source; review the workaround',
    );
    source = source.replace(before, after);
  }
  source = `${marker}\nimport { normalizeTrailingSlashPathname } from '../server/request-pipeline.js';\n${source}`;
  writeFileSync(file, source);
}
