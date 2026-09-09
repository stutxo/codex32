'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The interactive SVG needs its own accessible title and description; an img cannot contain its controls. */
import { useEffect, useId, useRef, type PointerEvent } from 'react';
import AdditionDisc from './addition-disc';
import RingDisc from './ring-disc';
import StableMessage from './stable-message';
import { ChevronLeft, ChevronRight, Grip, LockKeyhole } from 'lucide-react';
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import {
  add,
  alphabet,
  multiply,
  nextSlot,
  recoveryOrder,
  recoveryReadout,
  symbol,
  wheelData,
} from '@/lib/workshop';
import type { Engine } from '@/lib/practice';
import { additionWindows } from '@/lib/paper-volvelle';
import {
  beginWheelDrag,
  lostWheelCapture,
  moveWheelDrag,
  type WheelDrag,
} from '@/lib/wheel-gesture';

export type WheelKind = 'recovery' | 'translation' | 'addition' | 'fusion';
type WheelProps = {
  engine: Engine;
  kind: WheelKind;
  primary: string;
  other: string;
  target?: string;
  onPrimary: (value: string) => void;
  onOther: (value: string) => void;
  onTurn?: (value: string) => void;
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
  guided,
  onTurn = onPrimary,
  showFlip = true,
  translationGuide,
}: WheelProps & {
  controls?: boolean;
  factorSide: boolean;
  onFactorSide: (value: boolean) => void;
  guided?: { primary: string; other: string };
  showFlip?: boolean;
  translationGuide?: {
    locked: boolean;
    onAdjust?: () => void;
    disabled?: boolean;
  };
}) {
  if (kind === 'recovery' && target !== 'S')
    throw new Error(
      'The printed recovery wheel targets S. Use the derivation table for D.',
    );
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const adjustButton = useRef<HTMLButtonElement>(null);
  const turnButton = useRef<HTMLButtonElement>(null);
  const requestedFocus = useRef<'held' | 'turn' | null>(null);
  const primary =
    (kind === 'translation' || kind === 'fusion') && requestedPrimary === 'Q'
      ? 'P'
      : requestedPrimary;
  const face = kind === 'translation' && factorSide ? 'fusion' : kind;
  const drag = useRef<WheelDrag | null>(null);
  const capture = useRef<Element | null>(null);
  const moved = useRef(false);
  const turningLocked =
    kind === 'translation' && Boolean(translationGuide?.locked);
  // Keep keyboard focus on a useful control when the arrows and Adjust swap.
  useEffect(() => {
    if (requestedFocus.current === 'held' && turningLocked)
      adjustButton.current?.focus();
    if (requestedFocus.current === 'turn' && !turningLocked)
      turnButton.current?.focus();
    requestedFocus.current = null;
  });
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
  // A captured gesture survives slot rerenders, but not a different wheel or
  // a newly held factor. Release the actual owner (grip or SVG), also on unmount.
  useEffect(() => {
    return () => {
      const pointer = drag.current?.pointer;
      const owner = capture.current;
      drag.current = null;
      capture.current = null;
      moved.current = true;
      if (pointer !== undefined && owner?.hasPointerCapture(pointer))
        owner.releasePointerCapture(pointer);
    };
  }, [turningLocked, kind, face, target, order]);
  function endDrag(cancelled = false) {
    const pointer = drag.current?.pointer;
    const owner = capture.current;
    drag.current = null;
    capture.current = null;
    moved.current ||= cancelled;
    if (pointer !== undefined && owner?.hasPointerCapture(pointer))
      owner.releasePointerCapture(pointer);
  }
  type WheelPointer = PointerEvent<SVGSVGElement | HTMLButtonElement>;
  function startDrag(event: WheelPointer, surface: 'disc' | 'handle') {
    if (!event.isPrimary || turningLocked || !svg.current) return;
    endDrag();
    moved.current = false;
    drag.current = beginWheelDrag(
      event,
      svg.current.getBoundingClientRect(),
      slot,
      count,
      surface,
    );
    if (surface === 'handle' && drag.current?.intent === 'turn') {
      capture.current = event.currentTarget;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  function updateDrag(event: WheelPointer) {
    if (turningLocked || drag.current?.pointer !== event.pointerId) return;
    const next = moveWheelDrag(drag.current, event);
    moved.current ||= drag.current.moved;
    if (next !== null) {
      // A mouse click on a printed character must stay on that character.
      // Capture artwork only after it becomes a drag; grips capture at start.
      if (!capture.current) {
        capture.current = event.currentTarget;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      onTurn(order[next]);
    }
  }
  const pointerHandlers = {
    onPointerMove: updateDrag,
    onPointerUp(event: WheelPointer) {
      if (drag.current?.pointer !== event.pointerId) return;
      // Some devices deliver their final movement only with pointerup.
      updateDrag(event);
      endDrag();
    },
    onPointerCancel(event: WheelPointer) {
      if (drag.current?.pointer === event.pointerId) endDrag(true);
    },
    onLostPointerCapture(event: WheelPointer) {
      if (lostWheelCapture(drag.current, event)) endDrag(true);
    },
    onPointerLeave(event: WheelPointer) {
      if (drag.current?.pointer !== event.pointerId) return;
      if (!capture.current?.hasPointerCapture(event.pointerId)) endDrag(true);
    },
  };
  const gripAngle = (slot * Math.PI * 2) / count - Math.PI / 2;
  const answer = wheelAnswer(engine, kind, primary, other, target);
  const window = additionWindows.find((item) => item.letter === other)!;
  const isMultiplication = kind === 'translation' || kind === 'fusion';
  const zero = isMultiplication && primary === 'Q';
  const canRead =
    !guided ||
    (primary === guided.primary && !(kind === 'translation' && factorSide));
  const discGuide = guided
    ? {
        primary: guided.primary,
        other: canRead ? guided.other : undefined,
      }
    : undefined;
  const primaryLabel =
    kind === 'recovery'
      ? 'Share to translate'
      : kind === 'addition'
        ? 'Top-row character'
        : 'Translation factor';
  return (
    <div
      className="wheel-tool"
      data-turning-locked={turningLocked}
      onPointerDownCapture={(event) => {
        if (!event.isPrimary) endDrag(true);
      }}
    >
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
      {translationGuide && guided && (
        <div
          className="wheel-translation-legend"
          aria-label="Two different wheel markings"
        >
          <span className="wheel-factor-label">
            Factor {guided.primary} · handle setting
          </span>
          <span className="wheel-read-label">
            <StableMessage
              active={other === 'Q' ? 0 : 1}
              messages={[
                `Read ${other} · Q↔Q on handle`,
                `Read ${other} · inner-ring character`,
              ]}
            />
          </span>
        </div>
      )}
      <div className="wheel-surface">
        <div className="wheel-disc-frame">
          <svg
            ref={svg}
            className="volvelle"
            viewBox={
              kind === 'addition' ? '-300 -300 600 600' : '-240 -240 480 480'
            }
            role="img"
            aria-labelledby={`${id}-title ${id}-desc`}
            onPointerDown={(event) => startDrag(event, 'disc')}
            {...pointerHandlers}
          >
            <title id={`${id}-title`}>{names[kind] + ' wheel'}</title>
            <desc id={`${id}-desc`}>
              {turningLocked
                ? `Wheel held at factor ${primary}. No turning needed. Read ${other} to get ${answer}. The factor marks the handle setting; the read mark identifies the current input, not a new setting.`
                : guided
                  ? `Drag the disc to turn it. Aim for ${guided.primary}, then read ${guided.other}. The highlighted setting shows the current worksheet calculation.`
                  : `Drag the inner disc to change ${primaryLabel.toLowerCase()}. Read ${other} to get ${answer ?? 'an invalid index pair'}.`}{' '}
              On a touchscreen, drag the purple grip around the circle to turn.
              Swipe elsewhere on the wheel to scroll. Use the labeled controls
              beside the worksheet for keyboard access.
            </desc>
            <g id={`${id}-paper`}>
              {kind === 'addition' ? (
                <AdditionDisc
                  id={id}
                  angle={(slot * 360) / count}
                  other={other}
                  guide={discGuide}
                  onPrimary={(letter) => {
                    if (!turningLocked && !moved.current) onPrimary(letter);
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
                  guide={discGuide}
                  distinguishReadout={Boolean(translationGuide)}
                  onPrimary={(letter) => {
                    if (!turningLocked && !moved.current) onPrimary(letter);
                  }}
                  onOther={(letter) => {
                    if (!moved.current) onOther(letter);
                  }}
                />
              )}
            </g>
          </svg>
          <button
            type="button"
            className="wheel-drag-handle"
            style={{
              left: `${50 + 50 * Math.cos(gripAngle)}%`,
              top: `${50 + 50 * Math.sin(gripAngle)}%`,
            }}
            disabled={turningLocked}
            aria-label={
              turningLocked
                ? `Wheel held at ${primary}`
                : 'Turn wheel clockwise, or drag the purple grip around the circle'
            }
            title={
              turningLocked
                ? 'No turning needed'
                : 'Drag around the circle to turn'
            }
            onPointerDown={(event) => startDrag(event, 'handle')}
            {...pointerHandlers}
            onClick={() => {
              if (!moved.current) onTurn(order[nextSlot(slot, 1, count)]);
            }}
            onKeyDown={() => {
              moved.current = false;
            }}
          >
            {turningLocked ? (
              <LockKeyhole size={20} aria-hidden="true" />
            ) : (
              <Grip size={20} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {kind === 'addition' && (
        <figure className="paper-magnifier">
          <figcaption>Window {other} · current reading</figcaption>
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
      <div className="wheel-turn-slot">
        {translationGuide && (
          <div
            className="wheel-held-notice"
            aria-hidden={!turningLocked ? true : undefined}
            inert={!turningLocked}
          >
            <span>
              <LockKeyhole size={17} aria-hidden="true" /> Wheel held at{' '}
              {primary}
            </span>
            {translationGuide?.onAdjust && (
              <button
                ref={adjustButton}
                className="text-button"
                disabled={translationGuide.disabled}
                onClick={() => {
                  requestedFocus.current = 'turn';
                  translationGuide.onAdjust?.();
                }}
              >
                Adjust wheel
              </button>
            )}
          </div>
        )}
        <div
          className="wheel-turn-buttons"
          aria-hidden={turningLocked ? true : undefined}
          inert={turningLocked}
        >
          <button
            ref={turnButton}
            className="secondary-button"
            onClick={() => {
              requestedFocus.current = 'held';
              onTurn(order[nextSlot(slot, -1, count)]);
            }}
            aria-label="Turn wheel one position counterclockwise"
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            <span className="wheel-mouse-hint">
              Drag the disc, or use the arrows to turn it.
            </span>
            <span className="wheel-touch-hint">
              Drag the purple grip around the circle to turn. Swipe elsewhere to
              scroll, or use the arrows to turn.
            </span>
          </span>
          <button
            className="secondary-button"
            onClick={() => {
              requestedFocus.current = 'held';
              onTurn(order[nextSlot(slot, 1, count)]);
            }}
            aria-label="Turn wheel one position clockwise"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      {guided && (
        <p className="wheel-guided-note">
          {turningLocked
            ? 'Keep the handle fixed. Only the character to read changes.'
            : translationGuide
              ? 'Turn the handle to the factor mark. The blue mark is the character to read, not a setting.'
              : 'Drag to turn. The gold marks show the setting for this calculation.'}
        </p>
      )}
      {kind === 'translation' && showFlip && (
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
          expected={guided}
          factorSide={factorSide}
        />
      )}
      <p className="wheel-footnote">
        {zero
          ? 'Q is zero. With a zero factor, every input maps to Q.'
          : kind === 'addition'
            ? 'Point the dragon’s arrow at the top-row character on the fixed outer disc. Find the bottom-row character printed on the dragon; read through its square window. The ink stays fixed on each sheet as the top sheet turns.'
            : kind === 'recovery'
              ? 'Point the handle at the share being translated; read the other share’s index. Their roles matter.'
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
  factorSide = false,
}: WheelProps & {
  expected?: { primary: string; other: string };
  factorSide?: boolean;
}) {
  const id = useId();
  const primary =
    (kind === 'translation' || kind === 'fusion') && requestedPrimary === 'Q'
      ? 'P'
      : requestedPrimary;
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
  const canRead =
    !expected ||
    (primary === expected.primary && !(kind === 'translation' && factorSide));
  const aligned = !expected || (canRead && other === expected.other);
  const nextAction =
    !expected || aligned
      ? 'write'
      : primary !== expected.primary
        ? 'turn'
        : !canRead
          ? 'flip'
          : 'read';
  const choice = kind === 'recovery' ? recoveryOrder(engine, target) : alphabet;
  const primaryChoices =
    kind === 'translation' || kind === 'fusion'
      ? alphabet.replace('Q', '')
      : choice;
  const setLabel =
    kind === 'addition'
      ? 'Point the arrow at'
      : kind === 'recovery'
        ? 'Point the handle at'
        : 'Set the factor to';
  const readLabel = kind === 'addition' ? 'Read window' : 'Read character';
  return (
    <div
      className="wheel-calculator"
      data-aligned={aligned}
      data-next-action={nextAction}
    >
      {expected && (
        <p className="wheel-next-instruction" aria-live="polite">
          {nextAction === 'turn' ? (
            <>
              First, {setLabel.toLowerCase()} <b>{expected.primary}</b>. Use
              button 1 below or the highlighted character on the instrument.
            </>
          ) : nextAction === 'flip' ? (
            <>
              The factor is set. Use “Turn over to translate” below the wheel to
              read from its other face.
            </>
          ) : nextAction === 'read' ? (
            <>
              The setting is correct. Now {readLabel.toLowerCase()}{' '}
              <b>{expected.other}</b> using button 2 or the highlighted
              character.
            </>
          ) : (
            <>
              {kind === 'addition'
                ? 'Read the letter through window '
                : 'Read the result for '}
              <b>{expected.other}</b>, then write it in the answer box below.
            </>
          )}
        </p>
      )}
      <div className="wheel-controls">
        {expected ? (
          <>
            <div className="guided-wheel-control">
              <span>{primaryLabel}</span>
              <button
                type="button"
                className="secondary-button"
                aria-pressed={primary === expected.primary}
                onClick={() => onPrimary(expected.primary)}
              >
                1. {setLabel} {expected.primary}
                {kind === 'translation' ? ' · ' + symbol(expected.primary) : ''}
              </button>
            </div>
            <div className="guided-wheel-control">
              <span>{otherLabel}</span>
              <button
                type="button"
                className="secondary-button"
                disabled={!canRead}
                aria-pressed={aligned}
                onClick={() => onOther(expected.other)}
              >
                2. {readLabel} {expected.other}
              </button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor={`${id}-primary`}>
              {primaryLabel}
              <NativeSelect
                id={`${id}-primary`}
                value={primary}
                onChange={(event) => onPrimary(event.target.value)}
              >
                {primaryChoices.split('').map((character) => (
                  <NativeSelectOption key={character} value={character}>
                    {character}
                    {kind === 'translation' || kind === 'fusion'
                      ? ' · ' + symbol(character)
                      : ''}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label htmlFor={`${id}-other`}>
              {otherLabel}
              <NativeSelect
                id={`${id}-other`}
                value={other}
                onChange={(event) => onOther(event.target.value)}
              >
                {choice.split('').map((character) => (
                  <NativeSelectOption key={character} value={character}>
                    {character}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          </>
        )}
      </div>
      {aligned && (
        <output className="wheel-output" aria-live="polite">
          <strong className="wheel-reading" aria-hidden="true">
            {answer ?? '—'}
          </strong>
          <span>
            <b className="reading-label">Result · write this character</b>
            {answer
              ? `${primary} ${kind === 'recovery' ? `with ${other}, toward ${target}` : `${kind === 'addition' ? '+' : '×'} ${other}`} = ${answer}${kind === 'recovery' || kind === 'fusion' ? ` (${symbol(answer)})` : ''}`
              : 'Choose distinct share indices, neither equal to the target.'}
          </span>
        </output>
      )}
    </div>
  );
}
