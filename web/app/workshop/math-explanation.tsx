import type { Exercise, ExerciseStep } from '@/lib/workbook';
import { alphabet } from '@/lib/workshop';

type Props = {
  exercise: Exercise;
  step?: ExerciseStep;
  column: number;
  target: 'D' | 'S';
};

function bits(character: string) {
  return alphabet.indexOf(character).toString(2).padStart(5, '0');
}

export default function MathExplanation({
  exercise,
  step,
  column,
  target,
}: Props) {
  const left = step?.left?.[column] ?? '';
  const right = step?.right?.[column] ?? '';
  const answer = step?.answer?.[column] ?? '';
  const known = [left, right, answer].every(
    (character) => character.length === 1 && alphabet.includes(character),
  );
  const factors = exercise.steps.filter((entry) => entry.kind === 'recovery');
  const destination = target === 'D' ? 'share D' : 'the secret at S';

  return (
    <details className="tutorial-explanation math-explanation">
      <summary>How does this work?</summary>
      <div className="math-explanation-body">
        <p>
          Every character used by the wheels represents five bits. Q means zero
          and P means one. Even the printed digits are labels in this alphabet,
          not ordinary numbers.
        </p>

        {step?.kind === 'addition' && (
          <>
            <p>
              The addition wheel does <b>XOR</b>: compare each pair of bits.
              Different bits give 1; matching bits give 0. There is no carrying.
              Adding the same character twice cancels it out, which also lets us
              undo an addition.
            </p>
            {known && (
              <figure className="math-worked-example">
                <figcaption>This column’s calculation</figcaption>
                <pre>{`${left}     ${bits(left)}\n${right} XOR ${bits(right)}\n      ─────\n${answer}     ${bits(answer)}`}</pre>
                <p>
                  {left} + {right} = {answer}
                </p>
              </figure>
            )}
          </>
        )}

        {step?.kind === 'translation' && (
          <>
            <p>
              Translation means multiplying a character by its share’s factor.
              The wheel is a multiplication lookup table: keep factor{' '}
              <b>{left}</b> fixed and read the result beside each input
              character. These letters are calculated, not newly chosen at
              random.
            </p>
            {known && (
              <figure className="math-worked-example">
                <figcaption>This column’s calculation</figcaption>
                <p className="math-equation">
                  {left} × {right} = {answer}
                </p>
                <p>Factor × input character = translated character</p>
              </figure>
            )}
            <details className="math-deeper">
              <summary>What kind of multiplication?</summary>
              <p>
                It is arithmetic in a 32-element finite field, called GF(32),
                not ordinary multiplication followed by a remainder of 32. Treat
                the five bits as coefficients of a polynomial; multiply, then
                reduce using x⁵ + x³ + 1. Coefficients add with XOR.
              </p>
              <p>
                For example, V = 01100 = x³ + x². Squaring it gives x⁶ + x⁴.
                Since x⁵ = x³ + 1, x⁶ = x⁴ + x. The two x⁴ terms cancel, leaving
                x = 00010 = Z. So V × V = Z.
              </p>
            </details>
          </>
        )}

        {exercise.checksum ? (
          <p>
            The checksum helps detect copying errors; it does not hide the
            secret.{' '}
            {exercise.verification
              ? 'To verify a complete share, the worksheet uses table lookups, shifts and additions, then checks that the finishing row is SECRETSHARE32.'
              : 'To create it, the worksheet uses table lookups, shifts and additions on the way down, then solves upward from the given row SECRETSHARE32 to find the missing characters.'}
          </p>
        ) : (
          <>
            <p>
              In this two-share scheme, each secret-data position follows a line
              in this 32-value arithmetic. Two shares determine that line. The
              factors tell us how to combine them to find {destination}:
              multiply each share’s character by its factor, then add the two
              results at the same position.
            </p>
            {factors.length === 2 && (
              <details className="math-deeper">
                <summary>Where do the factors come from?</summary>
                <p>
                  They depend only on the two share indices and the target index
                  ({target}), so they stay the same for every position. The
                  book’s table or recovery wheel supplies these weights:
                </p>
                {factors.map((factor) => (
                  <p className="math-factor" key={factor.id}>
                    Factor for share {factor.left}:<br />({target} +{' '}
                    {factor.right}) ÷ ({factor.left} + {factor.right}) ={' '}
                    <b>{factor.answer}</b>
                  </p>
                ))}
                <p>
                  Here + means XOR, and ÷ uses the same finite-field arithmetic
                  as the translation wheel. This weighted combination is called
                  Lagrange interpolation. The target S is the secret’s index; it
                  is not Q (zero).
                </p>
              </details>
            )}
          </>
        )}

        <p>
          <a
            href="https://secretcodex32.com/docs/2023-08-23--math.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Explore the Codex32 maths companion (PDF)
          </a>
        </p>
      </div>
    </details>
  );
}
