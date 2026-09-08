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
  angle: number;
  rotation: number;
  minimumRadius: number;
  slot: number;
  lastSlot: number;
  count: number;
  intent: 'turn' | 'scroll';
  moved: boolean;
};

export function beginWheelDrag(
  event: Pointer,
  bounds: Bounds,
  slot: number,
  count: number,
  surface: 'disc' | 'handle' = 'disc',
): WheelDrag | null {
  if (!event.isPrimary || event.button !== 0) return null;
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const x = event.clientX - centerX;
  const y = event.clientY - centerY;
  const radius = Math.hypot(x, y);
  if (
    (surface === 'disc' && radius > bounds.width * 0.495) ||
    radius < bounds.width * 0.025
  )
    return null;
  return {
    pointer: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    centerX,
    centerY,
    angle: Math.atan2(y, x),
    rotation: 0,
    minimumRadius: bounds.width * 0.025,
    slot,
    lastSlot: slot,
    count,
    intent:
      surface === 'disc' && event.pointerType !== 'mouse' ? 'scroll' : 'turn',
    moved: false,
  };
}

// Touching the artwork scrolls. The separate grip owns circular turning from
// pointerdown, so the browser never has to guess between a turn and a scroll.
export function moveWheelDrag(drag: WheelDrag, event: Pointer): number | null {
  if (event.pointerId !== drag.pointer) return null;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (Math.hypot(dx, dy) >= 8) drag.moved = true;
  if (drag.intent !== 'turn') return null;
  const x = event.clientX - drag.centerX;
  const y = event.clientY - drag.centerY;
  if (Math.hypot(x, y) < drag.minimumRadius) return null;
  const angle = Math.atan2(y, x);
  // Unwrap each movement across the atan2 seam, then snap the accumulated
  // displacement once. Quantizing the starting angle causes tiny-drag jumps.
  const movement = angle - drag.angle;
  drag.rotation += Math.atan2(Math.sin(movement), Math.cos(movement));
  drag.angle = angle;
  const delta = Math.round((drag.rotation * drag.count) / (Math.PI * 2));
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
