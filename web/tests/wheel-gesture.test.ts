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
const begin = (change = {}, slot = 0, count = 32) => {
  const drag = beginWheelDrag(pointer(change), bounds, slot, count);
  assert.ok(drag);
  return drag;
};

await test('vertical and diagonal touch gestures scroll without selecting a letter', () => {
  for (const start of [
    { clientX: 170, clientY: 60 },
    { clientX: 310, clientY: 180 },
    { clientX: 60, clientY: 180 },
    { clientX: 190, clientY: 180 },
  ]) {
    for (const [dx, dy] of [
      [0, 30],
      [20, 30],
      [20, -20],
      [24, 20],
    ]) {
      const drag = begin(start);
      assert.equal(
        moveWheelDrag(
          drag,
          pointer({
            clientX: start.clientX + dx,
            clientY: start.clientY + dy,
          }),
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
        moveWheelDrag(
          drag,
          pointer({
            clientX: start.clientX + 100,
            clientY: start.clientY + dy,
          }),
        ),
        null,
        'A scroll never becomes rotation later in the gesture',
      );
    }
  }
});

await test('touch jitter remains a tap, while sideways swipes turn from any disc position', () => {
  const tap = begin();
  assert.equal(
    moveWheelDrag(tap, pointer({ clientX: 174, clientY: 62 })),
    null,
  );
  assert.equal(tap.moved, false);
  assert.equal(tap.intent, 'pending');
  for (const [clientX, clientY] of [
    [170, 60],
    [310, 180],
    [60, 180],
  ]) {
    const drag = begin({ clientX, clientY });
    assert.equal(
      moveWheelDrag(drag, pointer({ clientX: clientX + 40, clientY })),
      2,
    );
    assert.equal(drag.intent, 'turn');
    assert.equal(drag.moved, true);
    assert.equal(
      moveWheelDrag(drag, pointer({ clientX: clientX + 42, clientY })),
      null,
    );
    assert.equal(
      moveWheelDrag(
        drag,
        pointer({ clientX: clientX + 80, clientY: clientY + 40 }),
      ),
      4,
    );
  }
});

await test('touch turns wrap both ways on 31- and 32-position wheels', () => {
  for (const count of [31, 32]) {
    const right = begin({}, count - 1, count);
    assert.equal(moveWheelDrag(right, pointer({ clientX: 190 })), 0);
    const left = begin({}, 0, count);
    assert.equal(moveWheelDrag(left, pointer({ clientX: 150 })), count - 1);
    assert.equal(
      moveWheelDrag(left, pointer({ clientX: 170 - 20 * (count + 2) })),
      count - 2,
    );
  }
});

await test('mouse dragging remains angular and only emits changed positions', () => {
  const drag = begin({ pointerType: 'mouse' });
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
  assert.equal(
    moveWheelDrag(
      drag,
      pointer({ pointerType: 'mouse', clientX: 288, clientY: 180 }),
    ),
    null,
  );
  assert.equal(moveWheelDrag(drag, pointer({ pointerType: 'mouse' })), 0);
});

await test('secondary pointers and invalid starts never drive the active wheel', () => {
  for (const change of [
    { isPrimary: false },
    { button: 2 },
    { clientX: 170, clientY: 180 },
    { clientX: 500 },
  ])
    assert.equal(beginWheelDrag(pointer(change), bounds, 0, 32), null);
  const drag = begin();
  assert.equal(
    moveWheelDrag(drag, pointer({ pointerId: 2, clientX: 230 })),
    null,
  );
  assert.equal(drag.intent, 'pending');
  assert.equal(drag.moved, false);
});

await test('implicit capture transfer from an SVG child does not end the wheel drag', () => {
  const svg = new EventTarget();
  const label = new EventTarget();
  const drag = begin();
  assert.equal(
    lostWheelCapture(drag, { pointerId: 1, target: label, currentTarget: svg }),
    false,
  );
  assert.equal(
    lostWheelCapture(drag, { pointerId: 2, target: svg, currentTarget: svg }),
    false,
  );
  assert.equal(
    lostWheelCapture(drag, { pointerId: 1, target: svg, currentTarget: svg }),
    true,
  );
  assert.equal(
    lostWheelCapture(null, { pointerId: 1, target: svg, currentTarget: svg }),
    false,
  );
});

await test('every wheel allows native vertical scrolling and pinch zoom, even when locked', async () => {
  const css = await readFile(
    new URL('../app/workshop/workshop.css', import.meta.url),
    'utf8',
  );
  assert.match(css, /\.volvelle\s*\{[^}]*touch-action: pan-y pinch-zoom;/);
  const overrides = [...css.matchAll(/touch-action:\s*([^;]+);/g)];
  assert.ok(overrides.every((match) => match[1] === 'pan-y pinch-zoom'));
  assert.match(css, /@media \(any-pointer: coarse\)\s*\{\s*\.wheel-mouse-hint/);
});
