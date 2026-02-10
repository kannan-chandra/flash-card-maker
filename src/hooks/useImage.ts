import { useEffect, useState } from 'react';

interface UseImageResult {
  image?: HTMLImageElement;
  isLoading: boolean;
}

export function useImage(src?: string): UseImageResult {
  const [img, setImg] = useState<HTMLImageElement>();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!src) {
      setImg(undefined);
      setIsLoading(false);
      return undefined;
    }

    setImg(undefined);
    setIsLoading(true);
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      setImg(image);
      setIsLoading(false);
    };
    image.onerror = () => {
      setImg(undefined);
      setIsLoading(false);
    };
    image.src = src;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [src]);

  return { image: img, isLoading };
}
