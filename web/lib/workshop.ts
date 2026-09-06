import data from './wheel-data.json' with { type: 'json' };
import { practice, type Engine } from './practice.ts';

export const alphabet = data.alphabet;
export const wheelData = data;
export const symbol = (character: string) =>
  data.symbols[alphabet.indexOf(character.toUpperCase())] ?? '—';
export type Pair = ['A' | 'C' | 'D', 'A' | 'C' | 'D'];
export type RandomFill = (bytes: Uint8Array) => void;
export const browserRandom: RandomFill = (bytes) => {
  globalThis.crypto.getRandomValues(bytes);
};
export const add = (engine: Engine, a: string, b: string) =>
  engine.addSymbols(a, b).toUpperCase();
export const multiply = (engine: Engine, a: string, b: string) =>
  engine.multiplySymbols(a, b).toUpperCase();

export function randomCharacters(
  count: number,
  fill: RandomFill = browserRandom,
): string {
  if (!Number.isInteger(count) || count < 0 || count > 52)
    throw new Error('Choose at most 52 practice characters.');
  const bytes = new Uint8Array(count);
  try {
    fill(bytes);
    return Array.from(bytes, (byte) => alphabet[byte & 31]).join('');
  } finally {
    bytes.fill(0);
  }
}

export function rollDiceCharacter(fill: RandomFill = browserRandom) {
  function die() {
    const bytes = new Uint8Array(1);
    try {
      for (let attempt = 0; attempt < 128; attempt++) {
        fill(bytes);
        if (bytes[0] < 252) return (bytes[0] % 6) + 1;
      }
      throw new Error('Could not obtain an unbiased dice roll.');
    } finally {
      bytes.fill(0);
    }
  }
  const dice: { first: number; second: number; bit: number; ties: number }[] =
    [];
  let value = 0;
  for (let i = 0; i < 5; i++) {
    let found = false;
    for (let ties = 0; ties < 128; ties++) {
      const first = die(),
        second = die();
      if (first === second) continue;
      const bit = second > first ? 1 : 0;
      dice.push({ first, second, bit, ties });
      value = (value << 1) | bit;
      found = true;
      break;
    }
    if (!found) throw new Error('Could not obtain distinct dice pairs.');
  }
  return {
    dice,
    bits: dice.map((d) => d.bit).join(''),
    character: alphabet[value],
  };
}
export type DiceResult = ReturnType<typeof rollDiceCharacter>;
export type DiceEntry = {
  bits: string[];
  character: string;
  recorded: boolean;
};
export const emptyDiceEntry = (): DiceEntry => ({
  bits: ['', '', '', '', ''],
  character: '',
  recorded: false,
});
export function recordDiceCharacter(
  draft: string,
  dice: DiceResult,
  entry: DiceEntry,
): string | null {
  if (
    draft.length >= 52 ||
    entry.recorded ||
    entry.bits.length !== 5 ||
    entry.bits.some((bit, i) => bit !== String(dice.dice[i].bit)) ||
    entry.character !== dice.character
  )
    return null;
  return draft + dice.character;
}

export function autoDiceCharacter(
  draft: string,
  pending: DiceResult | null,
  entry: DiceEntry,
  fill: RandomFill = browserRandom,
) {
  if (draft.length >= 52) return null;
  const dice = pending && !entry.recorded ? pending : rollDiceCharacter(fill);
  const completed = {
    bits: dice.bits.split(''),
    character: dice.character,
    recorded: false,
  };
  const next = recordDiceCharacter(draft, dice, completed);
  return next === null
    ? null
    : {
        draft: next,
        dice,
        diceEntry: { ...completed, recorded: true },
      };
}

function exported(backup: { exportText(): string; free(): void }): string {
  try {
    return backup.exportText().toUpperCase();
  } finally {
    backup.free();
  }
}
export function sessionFromInitial(
  engine: Engine,
  initial: [string, string],
  kind: 'published' | 'fresh',
) {
  const d = exported(engine.deriveBackup(initial, 'D'));
  const secret = exported(engine.recoverBackup(initial));
  const shares = {
    A: initial[0].toUpperCase(),
    C: initial[1].toUpperCase(),
    D: d,
  };
  for (const pair of [
    [shares.A, shares.D],
    [shares.C, shares.D],
  ]) {
    if (exported(engine.recoverBackup(pair)) !== secret)
      throw new Error('The practice pairs do not recover the same secret.');
  }
  const wallet = new engine.RecoveryWallet([secret], 'signet');
  let addresses: string[];
  try {
    addresses = [0, 1, 2].map((index) => wallet.address(false, index));
  } finally {
    wallet.free();
  }
  if (
    kind === 'published' &&
    (secret !== practice.publishedSecret ||
      d !== practice.shares[2] ||
      addresses.some(
        (address, index) => address !== practice.addresses[index].address,
      ))
  ) {
    throw new Error(
      'The published example did not match its fixed expectations.',
    );
  }
  return { kind, shares, secret, addresses };
}
export type WorkshopSession = ReturnType<typeof sessionFromInitial>;
export function publishedSession(engine: Engine) {
  return sessionFromInitial(
    engine,
    [practice.shares[0], practice.shares[1]],
    'published',
  );
}
export function freshSession(engine: Engine, characters: string) {
  if (!/^[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{52}$/.test(characters))
    throw new Error('Create all 52 uppercase practice characters first.');
  const a = exported(engine.createPracticeShare('A', characters.slice(0, 26)));
  const c = exported(engine.createPracticeShare('C', characters.slice(26)));
  return sessionFromInitial(engine, [a, c], 'fresh');
}

// Keep the characters the learner rolled and supply the remaining independent
// randomness before accepting a new session. Any failure leaves UI state alone.
export function completePracticeSession(
  engine: Engine,
  draft: string,
  fill: RandomFill = browserRandom,
) {
  if (!/^[QPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]{0,52}$/.test(draft))
    throw new Error('Choose at most 52 uppercase practice characters.');
  const remaining =
    draft.length < 52 ? randomCharacters(52 - draft.length, fill) : '';
  return freshSession(engine, draft + remaining);
}

export function translationLesson(
  engine: Engine,
  session: WorkshopSession,
  pair: Pair,
  target: 'D' | 'S',
) {
  if (pair[0] === pair[1] || pair.includes(target as Pair[number]))
    throw new Error('Choose two distinct shares and a different target.');
  const input = pair.map((index) => session.shares[index]);
  const weights = engine
    .interpolationWeights(input, target)
    .toUpperCase()
    .split('');
  const rows = input.map((text, row) =>
    text
      .slice(3)
      .split('')
      .map((c) => multiply(engine, weights[row], c))
      .join(''),
  );
  const columns = rows[0].split('').map((left, i) => ({
    position: i + 4,
    region: i < 6 ? 'header' : i < 32 ? 'share data' : 'checksum',
    inputs: input.map((text) => text[i + 3]),
    translated: [left, rows[1][i]],
    result: add(engine, left, rows[1][i]),
  }));
  const output = 'MS1' + columns.map((c) => c.result).join('');
  const expected = target === 'S' ? session.secret : session.shares.D;
  if (output !== expected)
    throw new Error('The wheel worksheet disagrees with Rust recovery.');
  const checked = new engine.Backup(output);
  checked.free();
  return { pair, target, input, weights, rows, columns, output };
}
export type TranslationLesson = ReturnType<typeof translationLesson>;

// The physical Recovery wheel targets S. Relabeling its fixed scale gives the
// same two-point derivation operation for D; this is disclosed in the interface.
export function recoveryOrder(engine: Engine, target: string) {
  return data.recoveryOrder
    .split('')
    .map((c) => add(engine, add(engine, c, 'S'), target))
    .join('');
}
export function recoveryReadout(
  order: string,
  handle: string,
  other: string,
): string | null {
  const p = order.indexOf(handle),
    r = order.indexOf(other);
  if (p < 0 || r < 0 || p === r) return null;
  return data.recoveryReadouts[(r - p + 31) % 31];
}

const xorRow = (engine: Engine, left: string, right: string) =>
  left
    .split('')
    .map((c, i) =>
      c === '?' || right[i] === '?' ? '?' : add(engine, c, right[i]),
    )
    .join('');

export function checksumWorksheet(
  engine: Engine,
  encoded: string,
  generate = true,
) {
  const backup = new engine.Backup(encoded);
  try {
    if (backup.seedBytes !== 16 || encoded.length !== 48)
      throw new Error(
        'This paper worksheet requires a 48-character Codex32 string.',
      );
  } finally {
    backup.free();
  }
  const complete = encoded.toUpperCase().slice(3);
  const input = generate ? complete.slice(0, -13) + '?'.repeat(13) : complete;
  const initialRow = '33XW87RR3YLJG';
  const initialSum = xorRow(engine, input.slice(0, 13), initialRow);
  let residue = initialSum;
  const forward = [];
  for (let offset = 13; offset < 45; offset += 2) {
    const key = residue.slice(0, 2);
    if (key.includes('?')) throw new Error('A checksum lookup key is unknown.');
    const lookup =
      data.checksumTable[alphabet.indexOf(key[0])][alphabet.indexOf(key[1])];
    const following = input.slice(offset, offset + 2);
    const shifted = residue.slice(2) + following;
    const after = xorRow(engine, shifted, lookup);
    forward.push({
      offset,
      key,
      lookup,
      following,
      before: residue,
      shifted,
      after,
    });
    residue = after;
  }
  const backward = [];
  let solved = 'SECRETSHARE32';
  const completed = input.split('');
  if (generate) {
    for (let index = forward.length - 1; index >= 0; index--) {
      const step = forward[index];
      const shifted = xorRow(engine, solved, step.lookup);
      const before = step.key + shifted.slice(0, 11);
      const pair = shifted.slice(-2);
      for (let i = 0; i < 2; i++) {
        if (
          completed[step.offset + i] !== '?' &&
          completed[step.offset + i] !== pair[i]
        )
          throw new Error('Checksum backsolve changed a known character.');
        completed[step.offset + i] = pair[i];
      }
      backward.push({
        forwardStep: index + 1,
        solved,
        lookup: step.lookup,
        shifted,
        before,
        pair,
        offset: step.offset,
      });
      solved = before;
    }
    if (solved !== initialSum || completed.join('') !== complete)
      throw new Error('The checksum worksheet disagrees with Rust.');
  } else if (residue !== 'SECRETSHARE32')
    throw new Error('The checksum verification row did not match.');
  return {
    initialRow,
    initialData: input.slice(0, 13),
    initialSum,
    forward,
    backward,
    finalForward: residue,
    checksum: complete.slice(-13),
    output: 'MS1' + completed.join(''),
  };
}
export type ChecksumWorksheet = ReturnType<typeof checksumWorksheet>;

export function angleSlot(x: number, y: number, count: number) {
  const turn = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  return Math.round((turn / (Math.PI * 2)) * count) % count;
}
export function nextSlot(slot: number, direction: number, count: number) {
  return (slot + direction + count) % count;
}
