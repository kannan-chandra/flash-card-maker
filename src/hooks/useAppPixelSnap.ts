import { useCallback, useLayoutEffect, useState, type RefCallback } from 'react';

interface UseAppPixelSnapOptions {
  maxWidth: number;
}

export function useAppPixelSnap(options: UseAppPixelSnapOptions): RefCallback<HTMLDivElement> {
  const { maxWidth } = options;
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!node) {
      return;
    }

    let animationFrame: number | null = null;
    const alignAppLeft = () => {
      animationFrame = null;
      const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);
      const viewportWidth = document.documentElement.clientWidth;
      const appWidth = Math.min(maxWidth, viewportWidth);
      const centeredLeft = Math.max((viewportWidth - appWidth) / 2, 0);
      const snappedLeft = Math.round(centeredLeft * devicePixelRatio) / devicePixelRatio;
      // Keep centered layout aligned to the device-pixel grid to avoid odd/even-width shimmer artifacts.
      node.style.setProperty('--app-left', `${snappedLeft}px`);
    };

    const scheduleSnap = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(alignAppLeft);
    };

    window.addEventListener('resize', scheduleSnap);
    scheduleSnap();

    return () => {
      window.removeEventListener('resize', scheduleSnap);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [maxWidth, node]);

  return useCallback<RefCallback<HTMLDivElement>>((nextNode) => {
    setNode(nextNode);
  }, []);
}
