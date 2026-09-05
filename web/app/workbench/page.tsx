import type { Metadata } from 'next';
import { publicAsset } from '@/lib/public-asset';
export const metadata: Metadata = {
  title: 'The recovery workbench · Codex32',
  description:
    'Check a share, recover the public Codex32 example, or print educational practice cards.',
};
export default function Page() {
  const destination = `${publicAsset('/')}#workbench`;
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${destination}`} />
      <a href={destination}>Open the recovery workbench tab</a>
    </>
  );
}
