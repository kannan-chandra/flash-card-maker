import { useEffect, useState } from 'react';

export function useImage(src?: string): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();

  useEffect(() => {
    if (!src) {
      setImg(undefined);
      return;
    }
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => setImg(image);
    image.onerror = () => setImg(undefined);
    image.src = src;
  }, [src]);

  return img;
}
