import Link from 'next/link';

export default function BookCredits() {
  return (
    <p className="credits">
      Original Codex32 artwork: Micaela Paez; illuminated letters and inline
      illustrations: M. Lutfi’ As’ad. Book edited and produced by Arri Isak
      Beck. © Blockstream, used under the{' '}
      <Link href="/art/LICENSE.txt" target="_blank" prefetch={false}>
        MIT license
      </Link>
      .{' '}
      <a
        href="https://github.com/apoelstra/codex32/tree/new-complete"
        target="_blank"
        rel="noreferrer"
      >
        Original artwork source
      </a>{' '}
      ·{' '}
      <Link href="/LICENSE-BIP93.txt" target="_blank" prefetch={false}>
        BIP93 example license
      </Link>
      . Independent educational companion. No real funds.
    </p>
  );
}
