import type { ReactNode } from 'react';

interface ModalProps {
  ariaLabel: string;
  className: string;
  children: ReactNode;
}

export function Modal(props: ModalProps) {
  const { ariaLabel, className, children } = props;
  return (
    <div className={className} role="dialog" aria-modal="true" aria-label={ariaLabel}>
      {children}
    </div>
  );
}
