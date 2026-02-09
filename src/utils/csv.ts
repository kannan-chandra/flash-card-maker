import Papa, { type ParseResult } from 'papaparse';
import type { FlashcardRow } from '../types';

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function makeId(index: number): string {
  return `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseCsvInput(csvText: string): FlashcardRow[] {
  const parsed: ParseResult<string[]> = Papa.parse<string[]>(csvText.trim(), {
    skipEmptyLines: true
  });

  if (!parsed.data.length) {
    return [];
  }

  const first = parsed.data[0].map((value: string) => normalizeCell(value).toLowerCase());
  const hasHeader = first.includes('word') || first.includes('imageurl') || first.includes('subtitle');
  const rows = hasHeader ? parsed.data.slice(1) : parsed.data;

  if (hasHeader) {
    const wordIndex = first.indexOf('word');
    const subtitleIndex = first.indexOf('subtitle');
    const imageIndex = first.indexOf('imageurl');
    return rows.map((row: string[], index: number) => ({
      id: makeId(index),
      word: normalizeCell(row[wordIndex]),
      subtitle: normalizeCell(row[subtitleIndex]),
      imageUrl: normalizeCell(row[imageIndex])
    }));
  }

  return rows.map((row: string[], index: number) => ({
    id: makeId(index),
    word: normalizeCell(row[0]),
    subtitle: normalizeCell(row[1]),
    imageUrl: normalizeCell(row[2])
  }));
}
