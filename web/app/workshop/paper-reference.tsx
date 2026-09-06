import type { Exercise, ExerciseStep } from '@/lib/workbook';

export function ShareHeader({ exercise }: { exercise: Exercise }) {
  const share = exercise.output;
  return (
    <details className="share-header-help">
      <summary>Where do the characters before my dice rolls come from?</summary>
      <p>
        The book puts a short header before your 26 random characters. The first
        addition starts after MS1.
      </p>
      <dl className="share-header-parts">
        {[
          ['MS1', 'Codex32 prefix'],
          [share[3], 'Shares needed'],
          [share.slice(4, 8), 'Backup name'],
          [share[8], 'This share'],
        ].map(([value, label]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>Your 26 dice characters</p>
      <code className="own-random-characters">{share.slice(9, 35)}</code>
      <p>
        Next come 13 checksum characters. This worksheet will find them. Each
        initial share has its own worksheet.
      </p>
    </details>
  );
}

function PaperRow({
  value,
  highlight = [],
  remove = [],
}: {
  value: string;
  highlight?: number[];
  remove?: number[];
}) {
  return (
    <div
      className="paper-row"
      style={{ '--paper-columns': value.length } as React.CSSProperties}
    >
      {value.split('').map((character, i) => (
        <span
          key={i}
          className={
            (highlight.includes(i) ? 'paper-mark ' : '') +
            (remove.includes(i) ? 'paper-remove ' : '') +
            (character === '?' ? 'paper-unknown' : '')
          }
        >
          {character}
        </span>
      ))}
    </div>
  );
}

export function DerivationTable() {
  return (
    <div className="paper-reference derivation-reference">
      <p className="small-label">DERIVATION TABLE · k = 2</p>
      <h3>Find column D.</h3>
      <p>
        The book starts with A and C. For each share, copy the factor in column
        D, then use it to translate that entire share.
      </p>
      <table className="paper-factor-table">
        <thead>
          <tr>
            <th>Initial share</th>
            <th>New share D</th>
            <th>Alphabet equivalent</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>A</th>
            <td>Π</td>
            <td>V</td>
          </tr>
          <tr>
            <th>C</th>
            <td>ρ</td>
            <td>D</td>
          </tr>
        </tbody>
      </table>
      <p>
        This is the k = 2, column D excerpt from the table on book page 9. Enter
        the alphabet equivalent of the factor you read.
      </p>
      <details className="technical-note">
        <summary>Which paper method are we following?</summary>
        <p>
          “Using Translation and the Translation Worksheet” (§III.1.B): find
          factors in this table, translate each share, then add the translated
          rows.
        </p>
        <p>
          The alternate Module 1 Share Booklet in revision 2303-1 has a{' '}
          <a
            href="https://github.com/BlockstreamResearch/codex32/issues/77"
            target="_blank"
            rel="noreferrer"
          >
            reported row error after R ↗
          </a>
          . Its input rows also omit S. S is valid share data; keep it when it
          occurs. This exercise does not use that booklet.
        </p>
      </details>
    </div>
  );
}

export default function PaperReference({ step }: { step: ExerciseStep }) {
  const upward = step.direction === 'up';
  return (
    <div className="paper-reference">
      <p className="small-label">
        {step.kind === 'lookup'
          ? 'USE THE CHECKSUM TABLE'
          : 'COPY ON YOUR WORKSHEET'}
      </p>
      {step.id === 'verify-copy' ? (
        <>
          <h3>Make a separate copy.</h3>
          <p>
            Recopy this complete share, including its checksum. You will run the
            checksum worksheet downward on this copy and compare the final row
            with SECRETSHARE32.
          </p>
          <code className="verification-copy">{step.left}</code>
          <p>Do not fill in the final row in advance. Calculate every row.</p>
        </>
      ) : step.id === 'endpoint' ? (
        <>
          <h3>The bottom row is given.</h3>
          <p>
            Copy these 13 characters into your answer. Everyone starts with this
            same final row.
          </p>
          <PaperRow value="SECRETSHARE32" />
          <p>
            The pink cells represent the checksum characters you have yet to
            find.
          </p>
          <PaperRow value={'?'.repeat(13)} />
          <p>
            You will work down the worksheet, then solve upward from the given
            row.
          </p>
        </>
      ) : step.kind === 'lookup' ? (
        <>
          <h3>Find this pair in the table.</h3>
          <p>
            Take the first two characters of your working row, highlighted here.
          </p>
          <PaperRow value={step.left!} highlight={[0, 1]} />
          <p className="lookup-target">
            Find entry <strong>{step.key}</strong>
          </p>
        </>
      ) : step.kind === 'shift' ? (
        <>
          <h3>
            {upward
              ? 'Rebuild the row above.'
              : 'Move two places along the worksheet.'}
          </h3>
          <p>
            {upward
              ? 'Keep the first eleven characters. The last two have just been recorded.'
              : 'The first two characters have been used for the table lookup. Keep the other eleven.'}
          </p>
          <PaperRow value={step.left!} remove={upward ? [11, 12] : [0, 1]} />
          <div className="shift-pieces">
            {upward && (
              <div>
                <span>Put these at the front</span>
                <code>{step.following}</code>
              </div>
            )}
            <div>
              <span>Keep these eleven</span>
              <code>
                {upward ? step.left!.slice(0, 11) : step.left!.slice(2)}
              </code>
            </div>
            {!upward && (
              <div>
                <span>Add these at the end</span>
                <code>{step.following}</code>
              </div>
            )}
          </div>
          <p>
            Write the two pieces together as one 13-character row. Keep each ?
            in its place.
          </p>
        </>
      ) : (
        <>
          <h3>Copy the last two characters.</h3>
          <PaperRow value={step.left!} highlight={[11, 12]} />
          <p>{step.instruction}</p>
        </>
      )}
      <p className="paper-tool-note">
        This is a {step.kind === 'lookup' ? 'table lookup' : 'copying'} step.
        The addition wheel is used when you add rows.
      </p>
    </div>
  );
}
