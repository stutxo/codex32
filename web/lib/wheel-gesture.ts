import { angleSlot } from './workshop.ts';

type Pointer = Pick<
  PointerEvent,
  'pointerId' | 'pointerType' | 'isPrimary' | 'button' | 'clientX' | 'clientY'
>;
type Bounds = Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>;
export type WheelDrag = {
  pointer: number;
  x: number;
  y: number;
  centerX: number;
  centerY: number;
  start: number;
  slot: number;
  lastSlot: number;
  count: number;
  touchStep: number | null;
  intent: 'pending' | 'turn' | 'scroll';
  moved: boolean;
};

export function beginWheelDrag(
  event: Pointer,
  bounds: Bounds,
  slot: number,
  count: number,
): WheelDrag | null {
  if (!event.isPrimary || event.button !== 0) return null;
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const x = event.clientX - centerX;
  const y = event.clientY - centerY;
  const radius = Math.hypot(x, y);
  if (radius > bounds.width * 0.495 || radius < bounds.width * 0.025)
    return null;
  return {
    pointer: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    centerX,
    centerY,
    start: angleSlot(x, y, count),
    slot,
    lastSlot: slot,
    count,
    touchStep:
      event.pointerType === 'touch' || event.pointerType === 'pen'
        ? Math.max(12, bounds.width / 16)
        : null,
    intent:
      event.pointerType === 'touch' || event.pointerType === 'pen'
        ? 'pending'
        : 'turn',
    moved: false,
  };
}

// Native scrolling owns vertical/diagonal touch gestures. Once chosen, that
// intent cannot become a wheel turn, even if the finger later moves sideways.
export function moveWheelDrag(drag: WheelDrag, event: Pointer): number | null {
  if (event.pointerId !== drag.pointer) return null;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) >= 8) drag.moved = true;
  if (drag.intent === 'pending') {
    if (!drag.moved) return null;
    drag.intent = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'turn' : 'scroll';
  }
  if (drag.intent !== 'turn') return null;
  // Sideways touch swipes work anywhere on the disc, including its left/right
  // edges. Mouse input keeps the paper-like circular drag.
  const delta = drag.touchStep
    ? Math.round(dx / drag.touchStep)
    : angleSlot(
        event.clientX - drag.centerX,
        event.clientY - drag.centerY,
        drag.count,
      ) - drag.start;
  const next = (((drag.slot + delta) % drag.count) + drag.count) % drag.count;
  if (next === drag.lastSlot) return null;
  drag.moved = true;
  drag.lastSlot = next;
  return next;
}

// Touch starts with implicit capture on an SVG child. Its bubbling capture-loss
// event during transfer to the outer SVG must not end the new wheel drag.
export function lostWheelCapture(
  drag: WheelDrag | null,
  event: { pointerId: number; target: EventTarget; currentTarget: EventTarget },
) {
  return (
    drag?.pointer === event.pointerId && event.target === event.currentTarget
  );
}
