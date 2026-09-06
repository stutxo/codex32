'use client';
import { useState } from 'react';
import BookButton from '@/components/book-button';
import { grouped } from '@/lib/practice';

export default function SecretResult({
  secret,
  addresses,
}: {
  secret: string;
  addresses: string[];
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  return (
    <section
      className="tutorial-secret"
      data-recovery-result="true"
      tabIndex={-1}
    >
      <h2>Secret revealed.</h2>
      <p className="tutorial-progress">
        {secret.length} / {secret.length} characters · complete
      </p>
      <p>
        Two shares recovered the same real, disposable test key. This complete{' '}
        <b>S</b> string is what a wallet imports.
      </p>
      <code className="secret-string">{grouped(secret)}</code>
      <BookButton
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(secret);
            setCopied(true);
            setError('');
          } catch {
            setError('Select and copy the string below instead.');
          }
        }}
      >
        {copied ? 'Secret copied' : 'Copy secret for Sparrow'}
      </BookButton>
      {error && <p role="alert">{error}</p>}
      <details className="sparrow-guide" open>
        <summary>Try it in Sparrow Wallet</summary>
        <ol>
          <li>
            In Sparrow, choose <b>Tools → Restart In → Signet</b>.
          </li>
          <li>
            Choose <b>File → New Wallet</b>, then <b>Single Signature</b> and{' '}
            <b>Taproot (P2TR)</b>.
          </li>
          <li>
            Open{' '}
            <b>
              New or Imported Software Wallet → Codex32 (BIP93) → Enter Secret
              Share
            </b>
            . Paste the copied string.
          </li>
          <li>
            Choose <b>Create Keystore</b>, keep account{' '}
            <code>{"m/86'/1'/0'"}</code>, then <b>Import Keystore → Apply</b>.
          </li>
        </ol>
        <p>
          Sparrow accepts the recovered S secret, including its header and
          checksum, without spaces. A, C and D are individual fragments. No
          seed-word conversion is needed.
        </p>
        <p>
          These instructions use the Codex32 importer added in{' '}
          <a
            href="https://github.com/sparrowwallet/sparrow/releases/tag/2.4.0"
            target="_blank"
            rel="noreferrer"
          >
            Sparrow 2.4.0
          </a>
          . Signet is the test network used by this tutorial.
        </p>
        <label className="copyable-secret">
          Unspaced secret
          <textarea
            readOnly
            value={secret}
            rows={2}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      </details>
      <details className="tutorial-addresses">
        <summary>Compare your first three receive addresses</summary>
        <p>They should match these addresses in Sparrow’s Receive tab.</p>
        <ol className="address-list">
          {addresses.map((address, index) => (
            <li key={address}>
              <span>Receive address {index + 1}</span>
              <code>{address}</code>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
