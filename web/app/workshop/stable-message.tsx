import type { ReactNode } from 'react';

// Overlap each possible message so the longest one reserves enough space at
// the current width/font size. Only the active message is visible or announced.
export default function StableMessage({
  messages,
  active,
}: {
  messages: readonly ReactNode[];
  active: number;
}) {
  return (
    <span className="stable-message">
      {messages.map((message, index) => (
        <span key={index} aria-hidden={index !== active ? true : undefined}>
          {message}
        </span>
      ))}
    </span>
  );
}
