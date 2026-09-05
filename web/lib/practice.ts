import fixture from './practice-fixture.json' with { type: 'json' };
import type * as Wasm from './wasm/codex32_wasm.js';

export type Engine = typeof Wasm;
export type ShareIndex = 'A' | 'C' | 'D';
export const practice = fixture;
export const shares = fixture.shares.map((text, i) => ({
  index: fixture.shareIndices[i].toUpperCase() as ShareIndex,
  text,
}));
export const grouped = (value: string) =>
  value
    .toUpperCase()
    .match(/.{1,4}/g)
    ?.join(' ') ?? '';

export function validateSelection(input: unknown): ShareIndex[] {
  if (
    !Array.isArray(input) ||
    input.length !== 2 ||
    new Set(input).size !== 2 ||
    !input.every((value) => shares.some((share) => share.index === value))
  ) {
    throw new Error(
      'Choose exactly two different practice shares: A, C, or D.',
    );
  }
  return [...input] as ShareIndex[];
}

export function recoverPractice(engine: Engine, input: unknown) {
  const indices = validateSelection(input);
  const selected = indices.map(
    (index) => shares.find((share) => share.index === index)!.text,
  );
  const backup = engine.recoverBackup(selected);
  try {
    const secret = backup.exportText();
    if (secret !== fixture.expectedSecret)
      throw new Error(
        'The recovered secret did not match the published example.',
      );
    const wallet = new engine.RecoveryWallet([secret], 'signet');
    try {
      const addresses = fixture.addresses.map((expected) => ({
        index: expected.index,
        path: expected.path,
        address: wallet.address(false, expected.index),
        expected: expected.address,
      }));
      if (!addresses.every((result) => result.address === result.expected)) {
        throw new Error(
          'The recovered addresses did not match the practice wallet.',
        );
      }
      return { indices, secret, addresses };
    } finally {
      wallet.free();
    }
  } finally {
    backup.free();
  }
}
export type RecoveryResult = ReturnType<typeof recoverPractice>;

export type ShareCheck =
  | { ok: false; message: string }
  | {
      ok: true;
      identifier: string;
      index: string;
      threshold: number;
      seedBytes: number;
      isSecret: boolean;
      knownExample: boolean;
    };

export function checkShare(engine: Engine, raw: string): ShareCheck {
  if (!raw.trim())
    return { ok: false, message: 'Enter a public Codex32 example first.' };
  if (raw.length > 1024)
    return {
      ok: false,
      message: 'This input is too long for a Codex32 string.',
    };
  // Display grouping is separate from decoding. Preserve case and punctuation:
  // mixed-case strings must fail rather than being silently repaired.
  const normalized = raw.replace(/[ \t\r\n]/g, '');
  let backup: Wasm.Backup | undefined;
  try {
    backup = new engine.Backup(normalized);
    return {
      ok: true,
      identifier: backup.identifier,
      index: backup.index,
      threshold: backup.threshold,
      seedBytes: backup.seedBytes,
      isSecret: backup.index === 's',
      knownExample: [...fixture.shares, fixture.publishedSecret].includes(
        normalized.toUpperCase(),
      ),
    };
  } catch (error) {
    const message = String(error);
    if (message.includes('checksum'))
      return {
        ok: false,
        message:
          'The checksum does not match. Check the characters against the original; none have been corrected.',
      };
    if (message.includes('mix uppercase'))
      return {
        ok: false,
        message:
          'Use all uppercase or all lowercase. A Codex32 string cannot mix the two.',
      };
    return {
      ok: false,
      message:
        'This is not a valid Codex32 string. Check its length, characters, and MS1 prefix.',
    };
  } finally {
    backup?.free();
  }
}
