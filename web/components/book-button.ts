import { createElement, type ComponentPropsWithoutRef } from 'react';

type BookButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'style'>;

// Keep these fallback styles on the native element: browser button appearance
// and stylesheet order must never turn a primary action into pale text on paper.
export default function BookButton({
  className = '',
  disabled = false,
  type = 'button',
  children,
  ...props
}: BookButtonProps) {
  return createElement(
    'button',
    {
      ...props,
      type,
      disabled,
      className: `primary-button ${className}`.trim(),
      'data-book-button': '',
      style: {
        appearance: 'none',
        WebkitAppearance: 'none',
        background: disabled ? '#e3dcc9' : '#493d78',
        color: disabled ? '#575043' : '#fff9e9',
        border: `1px solid ${disabled ? '#b9ad91' : '#493d78'}`,
        borderRadius: '2px',
        opacity: 1,
      },
    },
    children,
  );
}
