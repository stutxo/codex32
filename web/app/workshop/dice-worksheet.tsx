import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import BookButton from '@/components/book-button';
import { publicAsset } from '@/lib/public-asset';
import { alphabet, type DiceEntry, type DiceResult } from '@/lib/workshop';

const glyphs = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
export default function DiceWorksheet({
  dice,
  entry,
  onChange,
  onRecord,
  error,
}: {
  dice: DiceResult | null;
  entry: DiceEntry;
  onChange: (entry: DiceEntry) => void;
  onRecord: () => void;
  error: string;
}) {
  const path: string[] = [];
  let prefix = 0;
  for (let depth = 0; depth <= 5; depth++) {
    if (depth && !['0', '1'].includes(entry.bits[depth - 1])) break;
    if (depth) prefix = prefix * 2 + Number(entry.bits[depth - 1]);
    const x =
      325 + 2 ** (5 - depth) * (2 * prefix + 1) * 1.1 * ((0.705 * 72) / 8.5);
    path.push(`${depth ? 'L' : 'M'} ${x} ${92 + 60 * depth}`);
  }
  return (
    <div className="manual-dice">
      <div className="dice-tracks">
        {Array.from({ length: 5 }, (_, i) => (
          <div className="dice-track" key={i}>
            <span>Pair {i + 1}</span>
            <span
              className="die"
              aria-label={
                dice ? `First roll ${dice.dice[i].first}` : 'First roll pending'
              }
            >
              {dice ? glyphs[dice.dice[i].first - 1] : '□'}
            </span>
            <ArrowRight size={17} />
            <span
              className="die"
              aria-label={
                dice
                  ? `Second roll ${dice.dice[i].second}`
                  : 'Second roll pending'
              }
            >
              {dice ? glyphs[dice.dice[i].second - 1] : '□'}
            </span>
            <select
              aria-label={`Pair ${i + 1} comparison`}
              value={entry.bits[i]}
              disabled={!dice || entry.recorded}
              onChange={(event) =>
                onChange({
                  ...entry,
                  bits: entry.bits.map((bit, at) =>
                    at === i ? event.target.value : bit,
                  ),
                })
              }
            >
              <option value="">·</option>
              <option value="0">0 · lower</option>
              <option value="1">1 · higher</option>
            </select>
          </div>
        ))}
      </div>
      <p className="serif-copy">
        Start at the top of the book’s tree. For each pair in order, go left for
        0 or right for 1. Write the character where you finish.
      </p>
      <div className="dice-tree">
        <Image
          unoptimized
          src={publicAsset('/art/dice-tree.svg')}
          width="430"
          height="327"
          alt="The original five-level dice decision tree. Go left for zero and right for one, from the first pair to the fifth."
        />
        <svg viewBox="320 84 430 327" aria-hidden="true">
          <path d={path.join(' ')} />
        </svg>
      </div>
      <details className="dice-tree-text">
        <summary>Read the tree as a table</summary>
        <dl>
          {alphabet.split('').map((letter, i) => (
            <div key={letter}>
              <dt>{i.toString(2).padStart(5, '0')}</dt>
              <dd>{letter}</dd>
            </div>
          ))}
        </dl>
      </details>
      <label className="dice-character">
        Character at the end of your path
        <select
          value={entry.character}
          disabled={!dice || entry.recorded}
          onChange={(event) =>
            onChange({ ...entry, character: event.target.value })
          }
        >
          <option value="">Choose a character</option>
          {alphabet.split('').map((letter) => (
            <option key={letter}>{letter}</option>
          ))}
        </select>
      </label>
      {error && (
        <p className="answer-error" role="alert">
          {error}
        </p>
      )}
      <BookButton onClick={onRecord} disabled={!dice || entry.recorded}>
        {entry.recorded ? 'Character recorded' : 'Record this character'}{' '}
        <ArrowRight size={17} />
      </BookButton>
      <output className="dice-result">
        {entry.recorded ? (
          <>
            <code>{entry.bits.join('')}</code>
            <ArrowRight size={20} />
            <strong>{entry.character}</strong>
            <span>recorded in your share</span>
          </>
        ) : (
          'Compare all five pairs, then follow the tree.'
        )}
      </output>
      {dice && (
        <p className="worksheet-caption">
          {dice.dice.reduce((sum, row) => sum + row.ties, 0)} tied pairs
          rerolled. Both dice are rolled again on a tie.
        </p>
      )}
    </div>
  );
}
