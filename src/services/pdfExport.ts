import { PDFDocument, StandardFonts, type PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { CardPreset, FlashcardRow, ProjectData, TextElement } from '../types';
import { splitTextForPdf } from '../utils/layout';

function getPresetGrid(preset: CardPreset): { cols: number; rows: number } {
  if (preset === 6) return { cols: 2, rows: 3 };
  if (preset === 8) return { cols: 2, rows: 4 };
  return { cols: 3, rows: 4 };
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function detectImageType(bytes: Uint8Array): 'png' | 'jpg' {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return 'png';
  }
  return 'jpg';
}

function mapFontForPdf(fontFamily: string): StandardFonts {
  if (fontFamily === 'Courier New') return StandardFonts.Courier;
  if (fontFamily === 'Times New Roman' || fontFamily === 'Georgia') return StandardFonts.TimesRoman;
  return StandardFonts.Helvetica;
}

function hasTamil(text: string): boolean {
  return /[\u0b80-\u0bff]/i.test(text);
}

function fitTextValue(row: FlashcardRow, role: TextElement['role']): string {
  return role === 'word' ? row.word : row.subtitle;
}

async function fetchImageBytes(row: FlashcardRow): Promise<Uint8Array> {
  if (row.localImageDataUrl) {
    return dataUrlToBytes(row.localImageDataUrl);
  }

  if (!row.imageUrl) {
    throw new Error('Missing image URL');
  }

  const response = await fetch(row.imageUrl, { mode: 'cors' });
  if (!response.ok) {
    throw new Error(`Image fetch failed (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export interface PdfGenerationResult {
  bytes: Uint8Array;
  imageIssues: Record<string, string>;
}

export interface GeneratePdfOptions {
  project: ProjectData;
  tamilFontUrl: string;
  onProgress: (percent: number, stage: string) => void;
}

export async function generatePdfBytes(options: GeneratePdfOptions): Promise<PdfGenerationResult> {
  const { project, tamilFontUrl, onProgress } = options;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const tamilFontBytes = await fetch(tamilFontUrl).then((response) => response.arrayBuffer());
  const tamilFont = await doc.embedFont(tamilFontBytes, { subset: true });

  onProgress(5, 'Preparing layout...');
  const standardFontCache = new Map<StandardFonts, PDFFont>();
  const grid = getPresetGrid(project.preset);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 36;
  const gutter = 12;
  const usableWidth = pageWidth - margin * 2 - gutter * (grid.cols - 1);
  const usableHeight = pageHeight - margin * 2 - gutter * (grid.rows - 1);
  const slotWidth = usableWidth / grid.cols;
  const slotHeight = usableHeight / grid.rows;

  const ratio = project.template.width / project.template.height;
  let cardWidth = slotWidth;
  let cardHeight = slotWidth / ratio;
  if (cardHeight > slotHeight) {
    cardHeight = slotHeight;
    cardWidth = slotHeight * ratio;
  }

  const cols = grid.cols;
  const perPage = grid.cols * grid.rows;
  const nextIssues: Record<string, string> = {};
  const totalRows = project.rows.length;
  const totalPagePairs = Math.ceil(totalRows / perPage);

  function getCardPosition(rowInPage: number, colInPage: number): { cardX: number; cardY: number } {
    const slotX = margin + colInPage * (slotWidth + gutter);
    const slotYTop = margin + rowInPage * (slotHeight + gutter);
    return {
      cardX: slotX + (slotWidth - cardWidth) / 2,
      cardY: pageHeight - slotYTop - cardHeight - (slotHeight - cardHeight) / 2
    };
  }

  async function drawCardSide(
    page: ReturnType<typeof doc.getPages>[number],
    row: FlashcardRow,
    rowInPage: number,
    colInPage: number,
    side: 1 | 2
  ) {
    const { cardX, cardY } = getCardPosition(rowInPage, colInPage);
    page.drawRectangle({
      x: cardX,
      y: cardY,
      width: cardWidth,
      height: cardHeight,
      color: rgb(1, 1, 1),
      borderWidth: project.showCutGuides ? 0.5 : 0,
      borderColor: rgb(0.75, 0.75, 0.75)
    });

    const imageElement = project.template.image;
    if (imageElement.side === side) {
      const imageX = cardX + (imageElement.x / project.template.width) * cardWidth;
      const imageY = cardY + cardHeight - ((imageElement.y + imageElement.height) / project.template.height) * cardHeight;
      const imageW = (imageElement.width / project.template.width) * cardWidth;
      const imageH = (imageElement.height / project.template.height) * cardHeight;

      try {
        const imageBytes = await fetchImageBytes(row);
        const embeddedImage =
          detectImageType(imageBytes) === 'png' ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
        page.drawImage(embeddedImage, {
          x: imageX,
          y: imageY,
          width: imageW,
          height: imageH
        });
      } catch {
        nextIssues[row.id] = 'Unable to load image. Workaround: save the image and upload it from your computer.';
      }
    }

    for (const textElement of project.template.textElements.filter((item) => item.side === side)) {
      const rawText = fitTextValue(row, textElement.role);
      const lines = splitTextForPdf(rawText, textElement);

      const scaledFontSize = (textElement.fontSize / project.template.width) * cardWidth;
      const lineHeight = scaledFontSize * textElement.lineHeight;
      const maxLines = Math.floor(((textElement.height / project.template.height) * cardHeight) / lineHeight);
      const clipped = lines.slice(0, Math.max(maxLines, 0));

      const textX = cardX + (textElement.x / project.template.width) * cardWidth;
      const textYTop = cardY + cardHeight - (textElement.y / project.template.height) * cardHeight;
      const boxW = (textElement.width / project.template.width) * cardWidth;

      clipped.forEach((line, lineIndex) => {
        const shouldUseTamilFont = textElement.fontFamily === 'Noto Sans Tamil' || hasTamil(line);
        const standardFontName = mapFontForPdf(textElement.fontFamily);
        let font = standardFontCache.get(standardFontName);
        if (!font) {
          font = doc.embedStandardFont(standardFontName);
          standardFontCache.set(standardFontName, font);
        }
        const activeFont = shouldUseTamilFont ? tamilFont : font;
        const lineWidth = activeFont.widthOfTextAtSize(line, scaledFontSize);

        let x = textX;
        if (textElement.align === 'center') {
          x = textX + Math.max((boxW - lineWidth) / 2, 0);
        } else if (textElement.align === 'right') {
          x = textX + Math.max(boxW - lineWidth, 0);
        }

        page.drawText(line, {
          x,
          y: textYTop - lineHeight * (lineIndex + 1),
          size: scaledFontSize,
          font: activeFont,
          color: rgb(0.1, 0.1, 0.1)
        });
      });
    }
  }

  for (let pagePairIndex = 0; pagePairIndex < totalPagePairs; pagePairIndex += 1) {
    const frontPage = doc.addPage([pageWidth, pageHeight]);
    const backPage = project.doubleSided ? doc.addPage([pageWidth, pageHeight]) : null;

    for (let slotIndex = 0; slotIndex < perPage; slotIndex += 1) {
      const rowIndex = pagePairIndex * perPage + slotIndex;
      if (rowIndex >= project.rows.length) {
        continue;
      }

      const renderPercent = 10 + ((rowIndex + 1) / totalRows) * 80;
      onProgress(renderPercent, `Rendering card ${rowIndex + 1} of ${totalRows}...`);
      if (rowIndex % 4 === 0) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      const row = project.rows[rowIndex];
      const rowInPage = Math.floor(slotIndex / cols);
      const colInPage = slotIndex % cols;
      await drawCardSide(frontPage, row, rowInPage, colInPage, 1);

      if (backPage) {
        const mirroredCol = cols - 1 - colInPage;
        await drawCardSide(backPage, row, rowInPage, mirroredCol, 2);
      }
    }
  }

  onProgress(92, 'Finalizing PDF file...');
  const bytes = await doc.save();

  return {
    bytes: new Uint8Array(bytes),
    imageIssues: nextIssues
  };
}
