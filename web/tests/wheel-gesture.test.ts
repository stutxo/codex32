import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  beginWheelDrag,
  lostWheelCapture,
  moveWheelDrag,
} from '../lib/wheel-gesture.ts';

const bounds = { left: 10, top: 20, width: 320, height: 320 };
const pointer = (change = {}) => ({
  pointerId: 1,
  pointerType: 'touch',
  isPrimary: true,
  button: 0,
  clientX: 170,
  clientY: 60,
  ...change,
});
const atAngle = (angle: number, radius = 176) =>
  pointer({
    clientX: 170 + radius * Math.cos(angle),
    clientY: 180 + radius * Math.sin(angle),
  });
const begin = (
  change = {},
  slot = 0,
  count = 32,
  surface: 'handle' | 'disc' = 'handle',
) => {
  const drag = beginWheelDrag(pointer(change), bounds, slot, count, surface);
  assert.ok(drag);
  return drag;
};

await test('all touch and pen gestures on artwork scroll without turning or selecting a letter', () => {
  for (const pointerType of ['touch', 'pen']) {
    for (const [dx, dy] of [
      [0, 30],
      [20, 30],
      [20, -20],
      [40, 0],
    ]) {
      const drag = begin({ pointerType }, 0, 32, 'disc');
      assert.equal(
        moveWheelDrag(
          drag,
          pointer({ pointerType, clientX: 170 + dx, clientY: 60 + dy }),
        ),
        null,
      );
      assert.equal(drag.intent, 'scroll');
      assert.equal(drag.lastSlot, 0);
      assert.equal(
        drag.moved,
        true,
        'Scrolling must not become a character tap',
      );
      assert.equal(
        moveWheelDrag(drag, atAngle(Math.PI)),
        null,
        'A scroll never becomes a turn',
      );
    }
  }
});

await test('vertical movement at the right-hand grip immediately turns clockwise', () => {
  const start = atAngle(0, 140);
  const grip = begin(start);
  const artwork = begin(start, 0, 32, 'disc');
  const next = pointer({ clientX: start.clientX, clientY: start.clientY + 40 });
  assert.equal(moveWheelDrag(grip, next), 1);
  assert.equal(moveWheelDrag(artwork, next), null);
  assert.equal(moveWheelDrag(grip, atAngle(Math.PI / 2)), 8);
});

await test('circular touch and pen turns follow either direction from every quadrant across multiple revolutions', () => {
  for (const pointerType of ['touch', 'pen']) {
    for (const count of [31, 32]) {
      for (const start of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        for (const direction of [-1, 1]) {
          const drag = begin(
            { ...atAngle(start), pointerType },
            count - 1,
            count,
          );
          for (let step = 1; step <= count * 3; step++) {
            const angle = start + (direction * step * Math.PI * 2) / count;
            const expected =
              (((count - 1 + direction * step) % count) + count) % count;
            assert.equal(
              moveWheelDrag(drag, { ...atAngle(angle), pointerType }),
              expected,
            );
          }
        }
      }
    }
  }
});

await test('small movements near a sector boundary do not cause a one-letter jump', () => {
  for (const count of [31, 32]) {
    const boundary = Math.PI / count;
    const drag = begin(atAngle(boundary - 0.001), 0, count);
    assert.equal(moveWheelDrag(drag, atAngle(boundary + 0.001)), null);
    assert.equal(drag.lastSlot, 0);
    assert.equal(drag.moved, false);
    assert.equal(
      moveWheelDrag(drag, atAngle(boundary + (Math.PI * 2) / count)),
      1,
    );
    assert.equal(
      moveWheelDrag(drag, atAngle(boundary + (Math.PI * 2) / count)),
      null,
    );
  }
});

await test('explicit grip starts include the entire outside-rim hit target', () => {
  const start = atAngle(0, 200);
  assert.equal(beginWheelDrag(start, bounds, 0, 32, 'disc'), null);
  const drag = begin(start);
  assert.equal(moveWheelDrag(drag, atAngle(Math.PI / 2, 220)), 8);
});

await test('mouse dragging remains angular, including a final pointerup-only movement', () => {
  const drag = begin({ pointerType: 'mouse' }, 0, 32, 'disc');
  assert.equal(
    moveWheelDrag(drag, pointer({ pointerType: 'mouse', clientY: 62 })),
    null,
  );
  assert.equal(
    moveWheelDrag(
      drag,
      pointer({ pointerType: 'mouse', clientX: 290, clientY: 180 }),
    ),
    8,
  );
  assert.equal(moveWheelDrag(drag, pointer({ pointerType: 'mouse' })), 0);
});

await test('secondary pointers, right clicks, and central starts cannot drive the wheel', () => {
  for (const change of [
    { isPrimary: false },
    { button: 2 },
    { clientX: 170, clientY: 180 },
  ])
    assert.equal(
      beginWheelDrag(pointer(change), bounds, 0, 32, 'handle'),
      null,
    );
  const drag = begin();
  assert.equal(
    moveWheelDrag(drag, pointer({ pointerId: 2, clientX: 230 })),
    null,
  );
  assert.equal(drag.moved, false);
  assert.equal(
    moveWheelDrag(drag, pointer({ clientX: 170, clientY: 180 })),
    null,
    'Avoid undefined angles at the pivot',
  );
  assert.equal(drag.lastSlot, 0);
});

await test('implicit capture transfer from a child does not end the active drag', () => {
  const owner = new EventTarget();
  const child = new EventTarget();
  const drag = begin();
  assert.equal(
    lostWheelCapture(drag, {
      pointerId: 1,
      target: child,
      currentTarget: owner,
    }),
    false,
  );
  assert.equal(
    lostWheelCapture(drag, {
      pointerId: 2,
      target: owner,
      currentTarget: owner,
    }),
    false,
  );
  assert.equal(
    lostWheelCapture(drag, {
      pointerId: 1,
      target: owner,
      currentTarget: owner,
    }),
    true,
  );
  assert.equal(
    lostWheelCapture(null, {
      pointerId: 1,
      target: owner,
      currentTarget: owner,
    }),
    false,
  );
});

await test('only the explicit grip blocks native scrolling; its full orbit has reserved space', async () => {
  const css = await readFile(
    new URL('../app/workshop/workshop.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.volvelle\s*\{[^}]*touch-action: pan-y pinch-zoom;/);
  assert.match(
    css,
    /\.wheel-drag-handle\s*\{[^}]*width: 48px;[^}]*height: 48px;[^}]*touch-action: none;/,
  );
  assert.match(
    css,
    /\.wheel-drag-handle:disabled\s*\{[^}]*touch-action: pan-y pinch-zoom;/,
  );
  assert.match(css, /\.wheel-drag-handle > \*\s*\{[^}]*pointer-events: none;/);
  assert.match(css, /\.wheel-surface\s*\{[^}]*padding: 24px;/);
  assert.equal([...css.matchAll(/touch-action:\s*none;/g)].length, 1);
});
