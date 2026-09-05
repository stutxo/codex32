import type { Metadata } from 'next';
import Workbench from './workbench';
export const metadata: Metadata = {
  title: 'The recovery workbench · Codex32',
  description:
    'Check a share, recover the public Codex32 example, or print educational practice cards.',
};
export default function Page() {
  return <Workbench />;
}
