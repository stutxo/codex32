import { publicAsset } from '@/lib/public-asset';
import { symbol, wheelData } from '@/lib/workshop';

export default function RingDisc({
  kind,
  order,
  angle,
  other,
  onPrimary,
  onOther,
  guide,
}: {
  kind: 'recovery' | 'translation' | 'fusion';
  order: string;
  angle: number;
  other: string;
  onPrimary: (letter: string) => void;
  onOther: (letter: string) => void;
  guide?: { primary: string; other?: string };
}) {
  const recovery = kind === 'recovery';
  const radius = recovery ? 170 : 176;
  const artRadius = radius * 0.85;
  const glyph = (letter: string) =>
    kind === 'fusion' ? symbol(letter) : letter;
  const art = recovery ? 'wheel-lock' : kind === 'fusion' ? 'potion' : 'sun';
  return (
    <>
      <g className="ring-bottom-disc">
        <circle r="200" fill="#fffdf5" stroke="#29251f" />
        {order.split('').map((letter, i) => (
          <g
            key={letter}
            transform={`rotate(${(i * 360) / 31})`}
            className="wheel-character"
            data-character={letter}
            data-guided-active={
              guide
                ? letter === guide.primary ||
                  (recovery && letter === guide.other)
                : undefined
            }
            onClick={() =>
              recovery && (!guide || letter !== guide.primary)
                ? onOther(letter)
                : onPrimary(letter)
            }
          >
            <rect
              x="-11"
              y="-198"
              width="22"
              height="29"
              fill={
                (
                  guide
                    ? letter === guide.primary ||
                      (recovery && letter === guide.other)
                    : recovery && letter === other
                )
                  ? '#ffe194'
                  : 'transparent'
              }
            />
            <text x="0" y="-179.6" className="ring-printed-letter">
              {glyph(letter)}
            </text>
            {recovery && <path d="M 0 -170 l -3 -6 h 6 Z" fill="#111" />}
          </g>
        ))}
      </g>
      <g className="ring-top-disc" transform={`rotate(${angle})`}>
        {/* Even-odd fill leaves a real window through the handle. */}
        <path
          d={`M -27 0 V -222 Q -27 -227 -22 -227 H 22 Q 27 -227 27 -222 V 0 Z M -6.48 -194 H 6.48 V -176 H -6.48 Z`}
          fill="#ccc"
          fillRule="evenodd"
          stroke="#29251f"
          strokeWidth="0.5"
        />
        {kind !== 'translation' && (
          <path d="M 0 -194 l -8 -16 h 16 Z" fill="#111" />
        )}
        <circle r={radius} fill="#fffdf5" stroke="#29251f" strokeWidth="0.5" />
        <image
          className="wheel-original-art"
          href={publicAsset(`/art/${art}.png`)}
          x={-artRadius}
          y={-artRadius}
          width={artRadius * 2}
          height={artRadius * 2}
          aria-hidden="true"
        />
        {order.split('').map((letter, i) => {
          const read = recovery ? wheelData.recoveryReadouts[i] : letter;
          return (
            <g
              key={letter}
              transform={`rotate(${(i * 360) / 31})`}
              className="ring-printed-position"
              data-character={letter}
              data-guided-active={
                guide ? !recovery && letter === guide.other : undefined
              }
              onClick={() => {
                if (!recovery) onOther(letter);
              }}
            >
              <rect
                x="-10"
                y="-172"
                width="20"
                height="26"
                fill={
                  !recovery && letter === (guide ? guide.other : other)
                    ? '#ffe194'
                    : 'transparent'
                }
              />
              <text x="0" y="-155.6" className="ring-printed-letter">
                {recovery ? (read ? symbol(read) : '') : glyph(read!)}
              </text>
              {!recovery && <path d="M 0 -176 l -3 6 h 6 Z" fill="#111" />}
            </g>
          );
        })}
        {kind === 'translation' && (
          <text
            x="0"
            y="-202"
            className="ring-zero-reminder"
            data-guided-active={guide ? guide.other === 'Q' : undefined}
            onClick={() => onOther('Q')}
          >
            Q↔Q
          </text>
        )}
      </g>
      <circle r="3" className="wheel-rivet" />
    </>
  );
}
