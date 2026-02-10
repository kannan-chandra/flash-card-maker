import type { FlashcardRow } from '../types';

export function hasRowImage(row?: FlashcardRow): boolean {
  return Boolean(row?.imageUrl || row?.localImageDataUrl);
}

export function setImageFromUrl(url: string): Partial<FlashcardRow> {
  return {
    imageUrl: url.trim(),
    localImageDataUrl: undefined
  };
}

export function setImageFromDataUrl(dataUrl: string): Partial<FlashcardRow> {
  return {
    imageUrl: '',
    localImageDataUrl: dataUrl
  };
}

export function clearRowImage(): Partial<FlashcardRow> {
  return {
    imageUrl: '',
    localImageDataUrl: undefined
  };
}
