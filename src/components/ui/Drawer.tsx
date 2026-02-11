import type { ReactNode } from 'react';

interface DrawerProps {
  className: string;
  isOpen: boolean;
  children: ReactNode;
}

export function Drawer(props: DrawerProps) {
  const { className, isOpen, children } = props;
  const classes = `${className} ${isOpen ? 'open' : ''}`.trim();
  return (
    <aside className={classes} aria-hidden={!isOpen}>
      {children}
    </aside>
  );
}
