import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface FloatingInspectorPanelProps {
  left: number;
  top: number;
  width: number;
  maxHeight?: number;
  className?: string;
  onHeightChange?: (height: number) => void;
  children: ReactNode;
}

export function FloatingInspectorPanel(props: FloatingInspectorPanelProps) {
  const { left, top, width, maxHeight, className, onHeightChange, children } = props;
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

  const panel = (
    <div
      ref={panelRef}
      className={classes}
      style={{
        position: 'fixed',
        left,
        top,
        width,
        maxHeight,
        overflow: 'hidden',
        ['--floating-panel-top' as string]: `${Math.max(0, Math.round(top))}px`,
        ['--floating-panel-max-height' as string]: maxHeight ? `${Math.round(maxHeight)}px` : undefined
      }}
    >
      {children}
    </div>
  );

  if (typeof document === 'undefined') {
    return panel;
  }
  return createPortal(panel, document.body);
}
