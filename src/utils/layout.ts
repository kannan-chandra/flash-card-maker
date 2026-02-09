import type { CardTemplate, FlashcardRow, RowValidation, TextElement } from '../types';

function getMeasureContext(textElement: TextElement): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }
  context.font = `${textElement.fontSize}px ${textElement.fontFamily}`;
  return context;
}

function splitLinesToFit(text: string, textElement: TextElement): string[] {
  const context = getMeasureContext(textElement);
  if (!context) {
    return [text];
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) {
    return [''];
  }

  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i += 1) {
    const candidate = `${current} ${words[i]}`;
    const width = context.measureText(candidate).width;
    if (width <= textElement.width) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }

  lines.push(current);
  return lines;
}

function hasOverflow(text: string, textElement: TextElement): boolean {
  const lines = splitLinesToFit(text, textElement);
  const context = getMeasureContext(textElement);
  const lineHeightPx = textElement.fontSize * textElement.lineHeight;
  const verticalOverflow = lines.length * lineHeightPx > textElement.height;
  const horizontalOverflow = context ? lines.some((line) => context.measureText(line).width > textElement.width) : false;
  return verticalOverflow || horizontalOverflow;
}

export function validateRows(template: CardTemplate, rows: FlashcardRow[]): RowValidation[] {
  const wordText = template.textElements.find((item) => item.role === 'word');
  const subtitleText = template.textElements.find((item) => item.role === 'subtitle');

  return rows.map((row) => ({
    rowId: row.id,
    wordOverflow: wordText ? hasOverflow(row.word, wordText) : false,
    subtitleOverflow: subtitleText ? hasOverflow(row.subtitle, subtitleText) : false,
    imageIssue: !row.imageUrl && !row.localImageDataUrl ? 'Missing image' : undefined
  }));
}

export function splitTextForPdf(text: string, textElement: TextElement): string[] {
  return splitLinesToFit(text, textElement);
}
