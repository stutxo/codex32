import type { Metadata } from 'next';
import { publicAsset } from '@/lib/public-asset';
export const metadata: Metadata = {
  title: 'Codex32',
  description:
    'Turn the Codex32 paper wheels, follow the worksheets, and make disposable educational test keys.',
};
export default function Page() {
  const destination = publicAsset('/');
  return (
    <>
      <meta httpEquiv="refresh" content={`0;url=${destination}`} />
      <a href={destination}>Open the volvelle workshop</a>
    </>
  );
}
