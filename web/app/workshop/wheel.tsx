'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The interactive SVG needs its own accessible title and description; an img cannot contain its controls. */
import { useId, useRef } from 'react';
import AdditionDisc from './addition-disc';
import RingDisc from './ring-disc';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  add,
  alphabet,
  angleSlot,
  multiply,
  nextSlot,
  recoveryOrder,
  recoveryReadout,
  symbol,
  wheelData,
} from '@/lib/workshop';
import type { Engine } from '@/lib/practice';
import { additionWindows } from '@/lib/paper-volvelle';

export type WheelKind = 'recovery' | 'translation' | 'addition' | 'fusion';
type WheelProps = {
  engine: Engine;
  kind: WheelKind;
  primary: string;
  other: string;
  target?: string;
  onPrimary: (value: string) => void;
  onOther: (value: string) => void;
};
export function wheelAnswer(
  engine: Engine,
  kind: WheelKind,
  primary: string,
  other: string,
  target: string,
) {
  if (kind === 'recovery')
    return recoveryReadout(recoveryOrder(engine, target), primary, other);
  return kind === 'addition'
    ? add(engine, primary, other)
    : multiply(engine, primary, other);
}
const selectedSlot = (order: string, primary: string) =>
  Math.max(0, order.indexOf(primary));
const names: Record<WheelKind, string> = {
  recovery: 'Recovery',
  translation: 'Translation',
  addition: 'Addition',
  fusion: 'Fusion',
};

export default function Wheel({
  engine,
  kind,
  primary: requestedPrimary,
  other,
  target = 'S',
  onPrimary,
  onOther,
  controls = true,
  factorSide,
  onFactorSide,
}: WheelProps & {
  controls?: boolean;
  factorSide: boolean;
  onFactorSide: (value: boolean) => void;
}) {
  const id = useId();
  const primary =
    (kind === 'translation' || kind === 'fusion') && requestedPrimary === 'Q'
      ? 'P'
      : requestedPrimary;
  const face = kind === 'translation' && factorSide ? 'fusion' : kind;
  const drag = useRef<{ pointer: number; start: number; slot: number } | null>(
    null,
  );
  const moved = useRef(false);
  const order =
    kind === 'recovery'
      ? recoveryOrder(engine, target)
      : face === 'addition'
        ? wheelData.additionOrder
        : face === 'fusion'
          ? wheelData.fusionOrder
          : wheelData.translationOrder;
  const slot = selectedSlot(order, primary);
  const count = order.length;
  const answer = wheelAnswer(engine, kind, primary, other, target);
  const window = additionWindows.find((item) => item.letter === other)!;
  const isMultiplication = kind === 'translation' || kind === 'fusion';
  const zero = isMultiplication && primary === 'Q';
  const primaryLabel =
    kind === 'recovery'
      ? 'Share to translate'
      : kind === 'addition'
        ? 'Top-row character'
        : 'Translation factor';
  return (
    <div className="wheel-tool">
      <div className="wheel-heading">
        <span className="small-label">
          {names[face].toUpperCase()} VOLVELLE
        </span>
        <span>
          {kind === 'recovery'
            ? `Target ${target}`
            : kind === 'addition'
              ? '32 lookup windows'
              : '31 positions + zero'}
        </span>
      </div>
      <svg
        className="volvelle"
        viewBox={
          kind === 'addition' ? '-300 -300 600 600' : '-240 -240 480 480'
        }
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        onPointerDown={(event) => {
          moved.current = false;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left - rect.width / 2,
            y = event.clientY - rect.top - rect.height / 2;
          if (
            Math.hypot(x, y) > rect.width * 0.495 ||
            Math.hypot(x, y) < rect.width * 0.025
          )
            return;
          drag.current = {
            pointer: event.pointerId,
            start: angleSlot(x, y, count),
            slot,
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current || drag.current.pointer !== event.pointerId) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const current = angleSlot(
            event.clientX - rect.left - rect.width / 2,
            event.clientY - rect.top - rect.height / 2,
            count,
          );
          if (current !== drag.current.start) {
            // Capture only an actual turn, so a simple tap still reaches a character.
            event.currentTarget.setPointerCapture(event.pointerId);
            moved.current = true;
          }
          onPrimary(
            order[
              (drag.current.slot + current - drag.current.start + count) % count
            ],
          );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          drag.current = null;
        }}
        onPointerLeave={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId))
            drag.current = null;
        }}
      >
        <title id={`${id}-title`}>{names[kind]} wheel</title>
        <desc id={`${id}-desc`}>
          Drag the inner disc to change {primaryLabel.toLowerCase()}. Read{' '}
          {other} to get {answer ?? 'an invalid index pair'}. Use the labeled
          controls beside the worksheet for keyboard access.
        </desc>
        <g id={`${id}-paper`}>
          {kind === 'addition' ? (
            <AdditionDisc
              id={id}
              angle={(slot * 360) / count}
              other={other}
              onPrimary={(letter) => {
                if (!moved.current) onPrimary(letter);
              }}
              onOther={(letter) => {
                if (!moved.current) onOther(letter);
              }}
            />
          ) : (
            <RingDisc
              kind={face as 'recovery' | 'translation' | 'fusion'}
              order={order}
              angle={(slot * 360) / count}
              other={other}
              onPrimary={(letter) => {
                if (!moved.current) onPrimary(letter);
              }}
              onOther={(letter) => {
                if (!moved.current) onOther(letter);
              }}
            />
          )}
        </g>
      </svg>
      {kind === 'addition' && (
        <figure className="paper-magnifier">
          <figcaption>Window {other} · enlarged</figcaption>
          <svg
            viewBox={`${window.x - 24} ${window.y - 10} 33 20`}
            aria-hidden="true"
          >
            <use
              href={`#${id}-paper`}
              transform={`rotate(${(-slot * 360) / count})`}
            />
          </svg>
        </figure>
      )}
      <div className="wheel-turn-buttons">
        <button
          className="secondary-button"
          onClick={() => onPrimary(order[nextSlot(slot, -1, count)])}
          aria-label="Turn wheel one position counterclockwise"
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {kind === 'addition'
            ? 'Point to the first character. Read the labeled window.'
            : 'Drag the handle to turn the printed disc.'}
        </span>
        <button
          className="secondary-button"
          onClick={() => onPrimary(order[nextSlot(slot, 1, count)])}
          aria-label="Turn wheel one position clockwise"
        >
          <ChevronRight size={17} />
        </button>
      </div>
      {kind === 'translation' && (
        <button
          className="secondary-button wheel-flip"
          onClick={() => onFactorSide(!factorSide)}
        >
          {factorSide
            ? 'Turn over to translate'
            : 'Turn over to set the factor'}
        </button>
      )}
      {controls && (
        <WheelControls
          engine={engine}
          kind={kind}
          primary={primary}
          other={other}
          target={target}
          onPrimary={onPrimary}
          onOther={onOther}
        />
      )}
      <p className="wheel-footnote">
        {zero
          ? 'Q is zero. With a zero factor, every input maps to Q.'
          : kind === 'addition'
            ? 'Point the dragon’s arrow at the top-row character on the fixed outer disc. Find the bottom-row character printed on the dragon; read through its square window. The ink stays fixed on each sheet as the top sheet turns.'
            : kind === 'recovery'
              ? target === 'S'
                ? 'Point the handle at the share being translated; read the other share’s index. Their roles matter.'
                : 'For deriving D, this digital adaptation relabels the paper recovery ring to target D.'
              : kind === 'fusion'
                ? 'The fusion face combines factors. A 2-share recovery uses one factor per share; fusion is useful for larger thresholds.'
                : factorSide
                  ? 'Set the factor symbol in the handle window on this side, then turn the instrument over. Its two faces keep the same setting.'
                  : 'Read the outer character at the arrow beside your inner character. Q always translates to Q, as printed on the handle.'}
      </p>
    </div>
  );
}

export function WheelControls({
  engine,
  kind,
  primary: requestedPrimary,
  other,
  target = 'S',
  onPrimary,
  onOther,
  expected,
}: WheelProps & { expected?: { primary: string; other: string } }) {
  const id = useId();
  const primary =
    (kind === 'translation' || kind === 'fusion') && requestedPrimary === 'Q'
      ? 'P'
      : requestedPrimary;
  const factorChoice =
    kind === 'translation' || kind === 'fusion'
      ? alphabet.replace('Q', '')
      : alphabet;
  const choice = kind === 'recovery' ? recoveryOrder(engine, target) : alphabet;
  const primaryLabel =
    kind === 'recovery'
      ? 'Share to translate'
      : kind === 'addition'
        ? 'Top-row character'
        : 'Translation factor';
  const otherLabel =
    kind === 'recovery'
      ? 'Other share'
      : kind === 'addition'
        ? 'Bottom-row character'
        : kind === 'fusion'
          ? 'Factor to combine'
          : 'Character to translate';
  const answer = wheelAnswer(engine, kind, primary, other, target);
  const aligned =
    !expected || (primary === expected.primary && other === expected.other);
  const guidedAddition = kind === 'addition' && expected;
  const nextAction =
    !expected || aligned
      ? 'write'
      : primary !== expected.primary
        ? 'turn'
        : 'read';
  const reading = (
    <output className="wheel-output" aria-live="polite">
      <strong className="wheel-reading" aria-hidden="true">
        {answer ?? '—'}
      </strong>
      <span>
        <b className="reading-label">
          {aligned ? 'Result · write this character' : 'Current wheel reading'}
        </b>
        {answer
          ? `${primary} ${kind === 'recovery' ? `with ${other}, toward ${target}` : `${kind === 'addition' ? '+' : '×'} ${other}`} = ${answer}${kind === 'recovery' || kind === 'fusion' ? ` (${symbol(answer)})` : ''}`
          : 'Choose distinct share indices, neither equal to the target.'}
      </span>
    </output>
  );
  return (
    <div
      className="wheel-calculator"
      data-aligned={aligned}
      data-next-action={nextAction}
    >
      {guidedAddition && (
        <p className="wheel-next-instruction" aria-live="polite">
          {nextAction === 'turn' ? (
            <>
              First, point the black arrow at <b>{expected.primary}</b> on the
              outside rim. It currently points at {primary}.
            </>
          ) : nextAction === 'read' ? (
            <>
              The arrow is at <b>{expected.primary}</b>. Now find the window
              labeled <b>{expected.other}</b> on the dragon.
            </>
          ) : (
            <>
              Read the letter through window <b>{expected.other}</b>, then write
              it in the answer box below.
            </>
          )}
        </p>
      )}
      <div className="wheel-controls">
        <label htmlFor={`${id}-primary`}>
          {primaryLabel}
          {expected && (
            <small>
              {guidedAddition ? '1. Point the arrow at ' : '1. Set to '}
              <b>{expected.primary}</b>
              {kind === 'translation' ? ' · ' + symbol(expected.primary) : ''}
            </small>
          )}
          <NativeSelect
            id={`${id}-primary`}
            value={primary}
            onChange={(e) => onPrimary(e.target.value)}
          >
            {(kind === 'recovery' ? choice : factorChoice)
              .split('')
              .map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {c}
                  {kind === 'fusion' || kind === 'translation'
                    ? ` · ${symbol(c)}`
                    : ''}
                </NativeSelectOption>
              ))}
          </NativeSelect>
          {guidedAddition && (
            <span className="wheel-control-help">
              Turn the disc, click {expected.primary} on the rim, or choose it
              here.
            </span>
          )}
        </label>
        <label htmlFor={`${id}-other`}>
          {otherLabel}
          {expected && (
            <small>
              {guidedAddition ? '2. Find window ' : '2. Read '}
              <b>{expected.other}</b>
            </small>
          )}
          <NativeSelect
            id={`${id}-other`}
            value={other}
            onChange={(e) => onOther(e.target.value)}
          >
            {choice.split('').map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
                {kind === 'fusion' ? ` · ${symbol(c)}` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {guidedAddition && (
            <span className="wheel-control-help">
              Click the {expected.other} label on the dragon, or choose it here
              to enlarge that window.
            </span>
          )}
        </label>
      </div>
      {expected && !guidedAddition && (
        <p className="wheel-alignment">
          {aligned
            ? 'The wheel is set. Write its result below.'
            : 'Set both characters above to match this column.'}
        </p>
      )}
      {guidedAddition && !aligned ? (
        <details className="current-wheel-detail">
          <summary>
            See the reading at your current setting ({primary} + {other})
          </summary>
          {reading}
        </details>
      ) : (
        reading
      )}
    </div>
  );
}
