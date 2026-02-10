import type { ReactNode } from 'react';

interface FloatingInspectorPanelProps {
  left: number;
  top: number;
  width: number;
  className?: string;
  children: ReactNode;
}

export function FloatingInspectorPanel(props: FloatingInspectorPanelProps) {
  const { left, top, width, className, children } = props;
  const classes = className ? `floating-inspector-panel ${className}` : 'floating-inspector-panel';

  return (
    <div
      className={classes}
      style={{
        left,
        top,
        width
      }}
    >
      {children}
    </div>
  );
}
