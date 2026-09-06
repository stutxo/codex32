import { alphabet, wheelData } from './workshop.ts';

// Original /showTopWheelPage and /drawBottomWheelPage in SSS32.ps.
// These are printed once. Turning the wheel only changes the top disc's angle.
const permutation = [
  22, 11, 10, 29, 31, 28, 17, 24, 27, 12, 21, 13, 19, 14, 20, 25, 1, 6, 26, 9,
  0, 4, 30, 8, 3, 2, 7, 23, 16, 15, 5, 18,
];
export const additionWindows = Array.from({ length: 32 }, (_, i) => {
  const radius = 40 * Math.sqrt(i + 2) - 2;
  const angle = ((94 * (i + 1) + 24) * Math.PI) / 180;
  return {
    letter: alphabet[permutation[31 - i]],
    x: radius * Math.sin(angle),
    y: radius * Math.cos(angle),
  };
});
export const additionPrinting = wheelData.additionOrder
  .split('')
  .map((primary, slot) => ({
    primary,
    angle: (slot * 360) / 32,
    windows: additionWindows.map((window) => ({
      ...window,
      result:
        alphabet[alphabet.indexOf(primary) ^ alphabet.indexOf(window.letter)],
    })),
  }));

export function rotatePoint(x: number, y: number, degrees: number) {
  const angle = (degrees * Math.PI) / 180;
  return {
    x: x * Math.cos(angle) - y * Math.sin(angle),
    y: x * Math.sin(angle) + y * Math.cos(angle),
  };
}
