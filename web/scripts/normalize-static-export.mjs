import assert from 'node:assert/strict';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Vinext includes basePath in its asset directories. Static hosts already mount
// the artifact at that path, so remove the extra filesystem prefix, not the URLs.
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
if (base) {
  const output = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../dist/client',
  );
  const nested = join(output, base.slice(1), '_next');
  const destination = join(output, '_next');
  assert.ok(
    existsSync(nested),
    'Expected vinext assets under the configured base path',
  );
  assert.ok(
    !existsSync(destination),
    'Refusing to overwrite another asset directory',
  );
  renameSync(nested, destination);
}
