// Exercises the actual JavaScript ABI using public fixtures only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Backup, RecoveryWallet, recoverBackup } = require('../target/wasm-node/codex32_wasm.js');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, '../tests/fixtures/bip93.json'), 'utf8'));

for (const input of fixtures.valid) {
  const backup = new Backup(input);
  assert.equal(backup.exportText(), input.toLowerCase());
  assert.equal(backup.identifier, input.slice(4, 8).toLowerCase());
  assert.equal(backup.index, input[8].toLowerCase());
  assert.equal(backup.threshold, Number(input[3]));
  backup.free();
}
for (const input of fixtures.invalid) assert.throws(() => new Backup(input));
for (const test of fixtures.reference_cases) {
  const backup = recoverBackup(test.shares.slice(1));
  assert.equal(backup.exportText(), test.secret);
  assert.equal(backup.seedBytes, test.hex.length / 2);
  backup.free();
}
const test = fixtures.reference_cases[0];
const original = new RecoveryWallet([test.secret], 'regtest');
const restored = new RecoveryWallet(test.shares.slice(1), 'regtest');
const originalState = original.exportPublicState();
const restoredState = restored.exportPublicState();
const invalidIndices = [
  -1, -0.5, -(2 ** 32), 0.5, 1.5,
  2 ** 31, 2 ** 31 + 1, 2 ** 32 - 1, 2 ** 32, 2 ** 32 + 1,
  Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, NaN, Infinity, -Infinity,
  '0', '1', '4294967296', '', null, undefined, false, true,
  0n, Symbol('0'), new Number(0), [], [0], {},
];
for (const change of [false, true]) {
  for (const index of [0, 1, 25, 2 ** 31 - 1]) {
    assert.equal(original.address(change, index), restored.address(change, index));
  }
  assert.equal(restored.address(change, -0), restored.address(change, 0));
  assert.notEqual(restored.address(change, 0), restored.address(change, 2 ** 31 - 1));
  for (const index of invalidIndices) {
    assert.throws(
      () => restored.address(change, index),
      (error) => error === 'address index must be a finite integer from 0 through 2147483647',
      `Invalid ${typeof index} index must be rejected on the ${change ? 'change' : 'receive'} keychain`,
    );
  }
  let coercions = 0;
  assert.throws(() => restored.address(change, { valueOf() { coercions++; return 0; } }));
  assert.equal(coercions, 0, 'Address indices must not invoke JavaScript coercion');
}
assert.equal(original.exportPublicState(), originalState, 'Valid previews must not reserve addresses');
assert.equal(restored.exportPublicState(), restoredState, 'Previews and invalid indices must not change wallet state');
assert.equal(restored.nextReceiveAddress(), original.address(false, 0));
assert.equal(restored.nextReceiveAddress(), original.address(false, 1));
assert.equal(JSON.parse(restored.exportPublicState()).network, 'regtest');
assert.throws(() => new RecoveryWallet([test.secret], 'bitcoin'));
assert.throws(() => recoverBackup([test.shares[0], test.shares[0]]));
assert.throws(() => recoverBackup(Array(10).fill(test.shares[0])));
original.free();
restored.free();
console.log('PASS: JavaScript ABI, public vectors, 392 recoveries, wallet addresses, strict index validation, and error propagation.');
