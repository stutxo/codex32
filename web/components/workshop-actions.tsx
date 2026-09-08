'use client';

import { useId } from 'react';
import { ArrowRight } from 'lucide-react';
import BookButton from './book-button';

export default function WorkshopActions({
  label,
  description,
  onAction,
  disabled = false,
}: {
  label: string;
  description: string;
  onAction: () => void;
  disabled?: boolean;
}) {
  const descriptionId = useId();
  return (
    <div className="workshop-actions">
      <p id={descriptionId}>{description}</p>
      <BookButton
        onClick={onAction}
        disabled={disabled}
        aria-describedby={descriptionId}
      >
        {label} <ArrowRight size={17} />
      </BookButton>
    </div>
  );
}
