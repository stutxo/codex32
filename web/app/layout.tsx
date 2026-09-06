import type { Metadata } from 'next';
import { publicAsset } from '@/lib/public-asset';
import './globals.css';

export const metadata: Metadata = {
  title: 'Codex32',
  icons: { icon: publicAsset('/art/sun.png') },
  description:
    'Explore the Codex32 paper computers: turn the volvelles, generate educational test keys, and learn secret sharing with the original book artwork.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        style={
          {
            '--book-border-image': `url("${publicAsset('/art/cover-top-border.png')}")`,
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
