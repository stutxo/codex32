import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as engine from '../lib/wasm/codex32_wasm.js';
import {
  checksumWorksheet,
  completePracticeSession,
  freshSession,
  translationLesson,
} from '../lib/workshop.ts';
import {
  initialFlow,
  workshopFlow,
  type WorkshopFlow,
} from '../lib/workshop-flow.ts';

engine.initSync({
  module: await readFile(
    new URL('../lib/wasm/codex32_wasm_bg.wasm', import.meta.url),
  ),
});

await test('create backup keeps rolled characters and fills only what is missing, including after one roll', () => {
  const sample = 'QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L'.repeat(2).slice(0, 52);
  for (const count of [0, 1, 26, 51, 52]) {
    const draft = sample.slice(0, count);
    let requested = 0;
    const session = completePracticeSession(engine, draft, (bytes) => {
      requested += bytes.length;
      bytes.fill(255); // Uniform-byte mapping selects L for this public test.
    });
    assert.equal(requested, 52 - count);
    const expected = freshSession(engine, draft + 'L'.repeat(52 - count));
    assert.deepEqual(session, expected);
  }
});

await test('a full draft never asks for more randomness and malformed drafts are rejected before sampling', () => {
  const unavailable = () => {
    throw new Error('RNG must not be called');
  };
  assert.doesNotThrow(() =>
    completePracticeSession(engine, 'P'.repeat(52), unavailable),
  );
  for (const draft of ['q', 'B', '🔑', 'Q'.repeat(53)]) {
    assert.throws(
      () => completePracticeSession(engine, draft, unavailable),
      /uppercase practice characters/,
    );
  }
});

await test('failed randomness and verification do not return a replacement session', () => {
  const draft = 'QPZ';
  let scratch: Uint8Array | undefined;
  assert.throws(
    () =>
      completePracticeSession(engine, draft, (bytes) => {
        scratch = bytes;
        bytes.fill(255);
        throw new Error('RNG unavailable');
      }),
    /RNG unavailable/,
  );
  assert.ok(scratch!.every((byte) => byte === 0));
  const brokenEngine = {
    ...engine,
    createPracticeShare: () => {
      throw new Error('verification failed');
    },
  };
  assert.throws(
    () =>
      completePracticeSession(brokenEngine, draft, (bytes) => bytes.fill(1)),
    /verification failed/,
  );
});

await test('the full fresh-key journey advances through both real checksums, derivation, and recovery', () => {
  const session = completePracticeSession(engine, '3', (bytes) =>
    bytes.forEach((_, i) => {
      bytes[i] = i;
    }),
  );
  let flow = workshopFlow(initialFlow, { type: 'session-created' });
  assert.equal(flow.phase, 'checksum');
  assert.equal(flow.checksumIndex, 'A');
  for (const index of ['A', 'C'] as const) {
    assert.equal(
      checksumWorksheet(engine, session.shares[index]).output,
      session.shares[index],
    );
    flow = workshopFlow(flow, { type: 'checksum-completed', index });
    assert.equal(flow.focus, 'stage');
    if (index === 'A') {
      assert.equal(flow.phase, 'checksum');
      assert.equal(flow.checksumIndex, 'C');
    } else assert.equal(flow.phase, 'derive');
  }
  assert.equal(
    translationLesson(engine, session, ['A', 'C'], 'D').output,
    session.shares.D,
  );
  flow = workshopFlow(flow, { type: 'derivation-completed' });
  assert.equal(flow.phase, 'recover');
  assert.equal(
    translationLesson(engine, session, ['C', 'D'], 'S').output,
    session.secret,
  );
  flow = workshopFlow(flow, { type: 'recovery-completed' });
  assert.equal(flow.phase, 'recover');
  assert.equal(flow.focus, 'result');
  assert.equal(session.addresses.length, 3);
});

await test('completing C first still requires A; repeating a completion does not skip a missing checksum', () => {
  let flow = workshopFlow(initialFlow, { type: 'session-created' });
  flow = workshopFlow(flow, { type: 'checksum-completed', index: 'C' });
  assert.equal(flow.phase, 'checksum');
  assert.equal(flow.checksumIndex, 'A');
  flow = workshopFlow(flow, { type: 'checksum-completed', index: 'C' });
  assert.equal(flow.phase, 'checksum');
  assert.equal(flow.checksumIndex, 'A');
  flow = workshopFlow(flow, { type: 'checksum-completed', index: 'A' });
  assert.equal(flow.phase, 'derive');
});

await test('reviewing completed stages preserves progress and leaves keyboard focus with manual navigation', () => {
  let flow: WorkshopFlow = initialFlow;
  for (const index of ['A', 'C'] as const)
    flow = workshopFlow(flow, { type: 'checksum-completed', index });
  const completed = flow.checksums;
  flow = workshopFlow(flow, { type: 'navigate', phase: 'checksum' });
  assert.equal(flow.phase, 'checksum');
  assert.equal(flow.focus, null);
  flow = workshopFlow(flow, { type: 'select-checksum', index: 'A' });
  assert.equal(flow.phase, 'checksum');
  assert.equal(flow.checksumIndex, 'A');
  assert.equal(flow.checksums, completed);
  assert.equal(flow.focus, null);
  flow = workshopFlow(flow, {
    type: 'navigate',
    phase: 'random',
    reveal: true,
  });
  assert.equal(flow.focus, 'stage');
});

await test('a new session resets completed checksums and a published example starts at recovery', () => {
  let flow: WorkshopFlow = initialFlow;
  for (const index of ['A', 'C'] as const)
    flow = workshopFlow(flow, { type: 'checksum-completed', index });
  const fresh = workshopFlow(flow, { type: 'session-created' });
  assert.deepEqual(fresh.checksums, { A: false, C: false });
  assert.equal(fresh.phase, 'checksum');
  assert.equal(fresh.checksumIndex, 'A');
  assert.ok(fresh.navigation > flow.navigation);
  const published = workshopFlow(flow, { type: 'published-example' });
  assert.equal(published.phase, 'recover');
  assert.deepEqual(published.checksums, { A: false, C: false });
  assert.deepEqual(initialFlow.checksums, { A: false, C: false });
});

await test('restarting recovery clears the completed-result notice without moving keyboard focus', () => {
  const complete = workshopFlow(initialFlow, { type: 'recovery-completed' });
  const restarted = workshopFlow(complete, {
    type: 'navigate',
    phase: 'recover',
  });
  assert.equal(restarted.notice, '');
  assert.equal(restarted.focus, null);
  assert.equal(restarted.phase, 'recover');
});
