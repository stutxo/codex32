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
for (const change of [false, true]) {
  for (const index of [0, 1, 25]) assert.equal(original.address(change, index), restored.address(change, index));
}
assert.equal(restored.nextReceiveAddress(), original.address(false, 0));
assert.equal(restored.nextReceiveAddress(), original.address(false, 1));
assert.equal(JSON.parse(restored.exportPublicState()).network, 'regtest');
assert.throws(() => new RecoveryWallet([test.secret], 'bitcoin'));
assert.throws(() => recoverBackup([test.shares[0], test.shares[0]]));
assert.throws(() => recoverBackup(Array(10).fill(test.shares[0])));
assert.throws(() => restored.address(false, 2 ** 31));
original.free();
restored.free();
console.log('PASS: JavaScript ABI, public vectors, 392 recoveries, wallet addresses, and error propagation.');
