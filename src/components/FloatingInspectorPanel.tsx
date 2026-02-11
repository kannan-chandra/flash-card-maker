import { useEffect, useRef, type ReactNode } from 'react';

interface FloatingInspectorPanelProps {
  left: number;
  top: number;
  width: number;
  className?: string;
  onHeightChange?: (height: number) => void;
  children: ReactNode;
}

export function FloatingInspectorPanel(props: FloatingInspectorPanelProps) {
  const { left, top, width, className, onHeightChange, children } = props;
  const classes = className ? `floating-inspector-panel ${className}` : 'floating-inspector-panel';
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onHeightChange || !panelRef.current) {
      return;
    }
    const node = panelRef.current;
    const update = () => onHeightChange(node.offsetHeight);
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const observer = new ResizeObserver(() => update());
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <div
      ref={panelRef}
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
