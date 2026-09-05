'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The interactive SVG needs its own accessible title and description; an img cannot contain its controls. */
import { useId, useRef } from 'react';
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
import { publicAsset } from '@/lib/public-asset';

export type WheelKind = 'recovery' | 'translation' | 'addition' | 'fusion';
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
const point = (slot: number, count: number, radius: number) => {
  const angle = (slot / count) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
};
const names: Record<WheelKind, string> = {
  recovery: 'Recovery',
  translation: 'Translation',
  addition: 'Addition',
  fusion: 'Fusion',
};

const artwork: Record<WheelKind, string> = {
  recovery: 'wheel-lock',
  translation: 'sun',
  addition: 'dragon',
  fusion: 'potion',
};

export default function Wheel({
  engine,
  kind,
  primary,
  other,
  target = 'S',
  onPrimary,
  onOther,
}: {
  engine: Engine;
  kind: WheelKind;
  primary: string;
  other: string;
  target?: string;
  onPrimary: (value: string) => void;
  onOther: (value: string) => void;
}) {
  const id = useId();
  const drag = useRef<{ pointer: number; start: number; slot: number } | null>(
    null,
  );
  const moved = useRef(false);
  const order =
    kind === 'recovery'
      ? recoveryOrder(engine, target)
      : kind === 'addition'
        ? wheelData.additionOrder
        : kind === 'fusion'
          ? wheelData.fusionOrder
          : wheelData.translationOrder;
  const slot = Math.max(0, order.indexOf(primary));
  const count = order.length;
  const answer = wheelAnswer(engine, kind, primary, other, target);
  const choice = kind === 'recovery' ? order : alphabet;
  const isMultiplication = kind === 'translation' || kind === 'fusion';
  const zero = isMultiplication && primary === 'Q';
  const format = (c: string | null) =>
    c === null ? '—' : kind === 'fusion' ? symbol(c) : c;
  const otherSlot = order.indexOf(other);
  const highlighted =
    kind === 'recovery' || kind === 'addition'
      ? otherSlot
      : otherSlot < 0
        ? -1
        : (otherSlot + slot) % count;
  const handle = point(slot, count, 191);
  const spokeOuter = point(highlighted, count, 207),
    spokeInner = point(highlighted, count, 172);
  const primaryLabel =
    kind === 'recovery'
      ? 'Share to translate'
      : kind === 'addition'
        ? 'First character'
        : 'Translation factor';
  const otherLabel =
    kind === 'recovery'
      ? 'Other share'
      : kind === 'fusion'
        ? 'Factor to combine'
        : 'Character to read';
  return (
    <div className="wheel-tool">
      <div className="wheel-heading">
        <span className="small-label">
          {names[kind].toUpperCase()} VOLVELLE
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
        viewBox="-240 -240 480 480"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        onPointerDown={(event) => {
          moved.current = false;
          const rect = event.currentTarget.getBoundingClientRect();
          const x = event.clientX - rect.left - rect.width / 2,
            y = event.clientY - rect.top - rect.height / 2;
          if (
            Math.hypot(x, y) > rect.width * 0.4 ||
            Math.hypot(x, y) < rect.width * 0.1
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
          controls below for keyboard access.
        </desc>
        <circle r="232" className="wheel-cover" />
        <circle r="224" className="wheel-gold-line" />
        <circle r="190" className="wheel-paper" />
        <circle r="190" className="wheel-disc" />
        <circle r="157" className="wheel-inner-line" />
        {order.split('').map((letter, index) => {
          const at = point(index, count, 207),
            tick = point(index, count, 223),
            inside = point(index, count, 216);
          return (
            <g
              key={letter}
              onClick={() => {
                if (!moved.current) {
                  if (isMultiplication) onPrimary(letter);
                  else onOther(letter);
                }
              }}
              className="wheel-character"
            >
              <line
                x1={tick.x}
                y1={tick.y}
                x2={inside.x}
                y2={inside.y}
                className="wheel-tick"
              />
              {index ===
                (kind === 'translation' || kind === 'fusion'
                  ? highlighted
                  : otherSlot) && (
                <circle
                  cx={at.x}
                  cy={at.y}
                  r="16"
                  className="wheel-highlight"
                />
              )}
              <text
                x={at.x}
                y={at.y}
                className={
                  index === highlighted ? 'wheel-letter is-lit' : 'wheel-letter'
                }
              >
                {format(letter)}
              </text>
            </g>
          );
        })}
        {order.split('').map((letter, index) => {
          const positioned = isMultiplication ? (index + slot) % count : index;
          const at = point(positioned, count, 172);
          const read =
            kind === 'recovery'
              ? wheelData.recoveryReadouts[(index - slot + count) % count]
              : kind === 'addition'
                ? add(engine, primary, letter)
                : letter;
          const label =
            kind === 'recovery' ? (read ? symbol(read) : '—') : format(read);
          return (
            <g
              key={letter}
              onClick={() => {
                if (isMultiplication && !moved.current) onOther(letter);
              }}
            >
              {positioned === highlighted && (
                <circle
                  cx={at.x}
                  cy={at.y}
                  r="17"
                  className="wheel-window-active"
                />
              )}
              <text x={at.x} y={at.y} className="wheel-inner-letter">
                {zero ? '·' : label}
              </text>
            </g>
          );
        })}
        {highlighted >= 0 && !zero && (
          <line
            x1={spokeInner.x}
            y1={spokeInner.y}
            x2={spokeOuter.x}
            y2={spokeOuter.y}
            className="wheel-read-line"
          />
        )}
        <g className="wheel-handle">
          <circle cx={handle.x} cy={handle.y} r="10" />
          <text x={handle.x} y={handle.y}>
            ◆
          </text>
        </g>
        <image
          className="wheel-original-art"
          href={publicAsset(`/art/${artwork[kind]}.png`)}
          x="-154"
          y="-154"
          width="308"
          height="308"
          transform={`rotate(${(slot / count) * 360})`}
          aria-hidden="true"
        />
        <circle r="5" className="wheel-rivet" />
      </svg>
      <div className="wheel-turn-buttons">
        <button
          className="secondary-button"
          onClick={() => onPrimary(order[nextSlot(slot, -1, count)])}
          aria-label="Turn wheel one position counterclockwise"
        >
          <ChevronLeft size={17} />
        </button>
        <span>Drag the inner disc. Read the highlighted pair.</span>
        <button
          className="secondary-button"
          onClick={() => onPrimary(order[nextSlot(slot, 1, count)])}
          aria-label="Turn wheel one position clockwise"
        >
          <ChevronRight size={17} />
        </button>
      </div>
      <div className="wheel-controls">
        <label htmlFor={`${id}-primary`}>
          {primaryLabel}
          <NativeSelect
            id={`${id}-primary`}
            value={primary}
            onChange={(e) => onPrimary(e.target.value)}
          >
            {choice.split('').map((c) => (
              <NativeSelectOption key={c} value={c}>
                {c}
                {kind === 'fusion' ? ` · ${symbol(c)}` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label htmlFor={`${id}-other`}>
          {otherLabel}
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
        </label>
      </div>
      <output className="wheel-output">
        <strong className="wheel-reading" aria-hidden="true">
          {answer
            ? kind === 'recovery' || kind === 'fusion'
              ? symbol(answer)
              : answer
            : '—'}
        </strong>
        <span>
          {answer
            ? `${primary} ${kind === 'recovery' ? `with ${other}, toward ${target}` : `${kind === 'addition' ? '+' : '×'} ${other}`} = ${answer}${kind === 'recovery' || kind === 'fusion' ? ` (${symbol(answer)})` : ''}`
            : 'Choose distinct share indices, neither equal to the target.'}
        </span>
      </output>
      <p className="wheel-footnote">
        {zero
          ? 'Q is zero. With a zero factor, every input maps to Q.'
          : kind === 'addition'
            ? 'This digital layout displays the paper table’s lookup windows. Codex32 addition follows its own alphabet rules.'
            : kind === 'recovery'
              ? target === 'S'
                ? 'Point the handle at the share being translated; read the other share’s index. Their roles matter.'
                : 'For deriving D, this digital adaptation relabels the paper recovery ring to target D.'
              : kind === 'fusion'
                ? 'The fusion face combines factors. A 2-share recovery uses one factor per share; fusion is useful for larger thresholds.'
                : 'Inner characters point to their translated outer characters. Q always maps to Q.'}
      </p>
    </div>
  );
}
