import { memo } from 'react';
import { additionPrinting, additionWindows } from '@/lib/paper-volvelle';
import { publicAsset } from '@/lib/public-asset';

// A fixed sheet of ink beneath the cut-out dragon. No selected operand is
// passed to this component: its printed characters cannot change on a turn.
const PrintedResults = memo(function PrintedResults() {
  return (
    <g className="addition-printed-results" aria-hidden="true">
      {additionPrinting.map((setting) => (
        <g key={setting.primary} transform={`rotate(${setting.angle})`}>
          {setting.windows.map((window) => (
            <text key={window.letter} x={window.x} y={window.y + 3}>
              {window.result}
            </text>
          ))}
        </g>
      ))}
    </g>
  );
});

export default function AdditionDisc({
  id,
  angle,
  other,
  onPrimary,
  onOther,
}: {
  id: string;
  angle: number;
  other: string;
  onPrimary: (letter: string) => void;
  onOther: (letter: string) => void;
}) {
  return (
    <>
      <defs>
        <mask
          id={`${id}-windows`}
          maskUnits="userSpaceOnUse"
          x="-300"
          y="-300"
          width="600"
          height="600"
        >
          <rect x="-300" y="-300" width="600" height="600" fill="white" />
          {additionWindows.map((window) => (
            <rect
              key={window.letter}
              x={window.x - 6}
              y={window.y - 6}
              width="12"
              height="12"
              fill="black"
            />
          ))}
        </mask>
      </defs>
      <g className="addition-bottom-disc">
        <circle r="268" fill="#fffdf5" stroke="#29251f" strokeWidth="0.5" />
        <PrintedResults />
        {additionPrinting.map((setting) => (
          <g
            key={setting.primary}
            transform={`rotate(${setting.angle})`}
            className="wheel-character"
            onClick={() => onPrimary(setting.primary)}
          >
            <rect x="-12" y="-266" width="24" height="26" fill="transparent" />
            <text
              x="0"
              y={-40 * Math.sqrt(38)}
              className="addition-outer-letter"
            >
              {setting.primary}
            </text>
          </g>
        ))}
      </g>
      <g className="addition-top-disc" transform={`rotate(${angle})`}>
        <g mask={`url(#${id}-windows)`}>
          {/* Original paper handle: the long arc below the chord at 40°. */}
          <path
            d="M -222.153 -186.409 A 290 290 0 1 0 222.153 -186.409 Z"
            fill="#ccc"
            stroke="#555"
            strokeWidth="0.5"
          />
          <circle r="240" fill="white" />
          <image
            className="wheel-original-art"
            href={publicAsset('/art/dragon.png')}
            x="-240"
            y="-240"
            width="480"
            height="480"
            aria-hidden="true"
          />
          <circle r="240" fill="none" stroke="#29251f" strokeWidth="0.5" />
          <path d="M 0 -240 L 10 -220 L -10 -220 Z" fill="#111" />
          {additionWindows.map((window) => (
            <g
              key={window.letter}
              className="addition-window-label"
              data-window={window.letter}
              onClick={() => onOther(window.letter)}
            >
              <rect
                x={window.x - 23}
                y={window.y - 7}
                width="30"
                height="14"
                fill={other === window.letter ? '#ffe194' : 'white'}
                stroke="#111"
                strokeWidth="0.5"
              />
              <text x={window.x - 22} y={window.y + 3}>
                {window.letter}
              </text>
              <path
                d={`M ${window.x - 15} ${window.y} h 7 m -7 0 l 2 -2 m -2 2 l 2 2 m 5 -2 l -2 -2 m 2 2 l -2 2`}
                fill="none"
                stroke="#111"
                strokeWidth="0.6"
              />
            </g>
          ))}
        </g>
        {additionWindows.map((window) => (
          <rect
            key={window.letter}
            x={window.x - 6}
            y={window.y - 6}
            width="12"
            height="12"
            fill="transparent"
            stroke={other === window.letter ? '#a32f39' : '#111'}
            strokeWidth={other === window.letter ? 1.5 : 0.5}
            className="addition-window"
            onClick={() => onOther(window.letter)}
          />
        ))}
      </g>
      <circle r="3" className="wheel-rivet" />
    </>
  );
}
