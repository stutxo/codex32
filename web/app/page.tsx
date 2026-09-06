import type { Metadata } from 'next';
import Workshop from './workshop/workshop';
export const metadata: Metadata = {
  title: 'Codex32',
  description:
    'Turn the Codex32 paper wheels, follow the original worksheets, and make disposable educational test keys.',
};
export default function Page() {
  return <Workshop />;
}
