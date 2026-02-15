import { PDFDocument, StandardFonts, clip, endPath, popGraphicsState, pushGraphicsState, rectangle, type PDFImage, type PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { CardPreset, FlashcardRow, ProjectData, TextElement } from '../types';
import { splitTextForPdf } from '../utils/layout';

function getPresetGrid(preset: CardPreset): { cols: number; rows: number } {
  if (preset === 6) return { cols: 2, rows: 3 };
  if (preset === 8) return { cols: 2, rows: 4 };
  return { cols: 3, rows: 4 };
}

interface PresetLayoutConfig {
  margin: number;
  gutter: number;
  fixedCardSize?: { width: number; height: number };
}

function getPresetLayoutConfig(preset: CardPreset): PresetLayoutConfig {
  if (preset === 8) {
    // Match standard playing-card dimensions (landscape): 3.5in x 2.5in.
    return {
      margin: 24,
      gutter: 8,
      fixedCardSize: {
        width: 72 * 3.5,
        height: 72 * 2.5
      }
    };
  }
  return {
    margin: 36,
    gutter: 12
  };
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

function getImageSourceKey(row: FlashcardRow): string | null {
  if (row.localImageDataUrl) {
    return `local:${row.localImageDataUrl}`;
  }
  if (row.imageUrl) {
    return `remote:${row.imageUrl}`;
  }
  return null;
}

function isRemoteSourceKey(sourceKey: string): boolean {
  return sourceKey.startsWith('remote:');
}

// In-memory cache for image bytes across PDF generations in this browser session.
const imageBytesMemoryCache = new Map<string, Uint8Array>();
const imageBytesInflight = new Map<string, Promise<Uint8Array>>();

async function fetchImageBytesWithMemoryCache(sourceKey: string, row: FlashcardRow): Promise<{ bytes: Uint8Array; fromCache: boolean }> {
  const cached = imageBytesMemoryCache.get(sourceKey);
  if (cached) {
    return { bytes: cached, fromCache: true };
  }

  let inflight = imageBytesInflight.get(sourceKey);
  if (!inflight) {
    inflight = fetchImageBytes(row);
    imageBytesInflight.set(sourceKey, inflight);
  }

  try {
    const bytes = await inflight;
    imageBytesMemoryCache.set(sourceKey, bytes);
    return { bytes, fromCache: false };
  } finally {
    imageBytesInflight.delete(sourceKey);
  }
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

function parseHexColor(value: string): { r: number; g: number; b: number } {
  const normalized = value.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(normalized);
  if (short) {
    const [r, g, b] = short[1].split('').map((char) => parseInt(char + char, 16) / 255);
    return { r, g, b };
  }

  const full = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (full) {
    const hex = full[1];
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255
    };
  }

  return { r: 0.1, g: 0.1, b: 0.1 };
}

function getContainRect(containerX: number, containerY: number, containerWidth: number, containerHeight: number, sourceWidth: number, sourceHeight: number) {
  if (containerWidth <= 0 || containerHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      x: containerX,
      y: containerY,
      width: containerWidth,
      height: containerHeight
    };
  }
  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    x: containerX + (containerWidth - width) / 2,
    y: containerY + (containerHeight - height) / 2,
    width,
    height
  };
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

interface PdfTextDebugConfig {
  enabled: boolean;
  yNudgePx: number;
}

interface PdfPerfDebugConfig {
  enabled: boolean;
}

const BASELINE_NUDGE_LINE_HEIGHT_RATIO = 0.21;

function getPdfTextDebugConfig(): PdfTextDebugConfig {
  if (typeof window === 'undefined') {
    return { enabled: false, yNudgePx: 0 };
  }

  const enabled = window.localStorage.getItem('pdfTextDebug') === '1';
  const yNudgeRaw = Number(window.localStorage.getItem('pdfTextYNudgePx') ?? '0');
  return {
    enabled,
    yNudgePx: Number.isFinite(yNudgeRaw) ? yNudgeRaw : 0
  };
}

function getPdfPerfDebugConfig(): PdfPerfDebugConfig {
  if (typeof window === 'undefined') {
    return { enabled: false };
  }
  return { enabled: window.localStorage.getItem('pdfPerfDebug') === '1' };
}

export async function generatePdfBytes(options: GeneratePdfOptions): Promise<PdfGenerationResult> {
  const { project, tamilFontUrl, onProgress } = options;
  const perfConfig = getPdfPerfDebugConfig();
  const perfStart = performance.now();
  const perf = {
    imagePrefetchMs: 0,
    imageCacheHits: 0,
    imageFetchMs: 0,
    imageEmbedMs: 0,
    textDrawMs: 0,
    pagesMs: 0,
    saveMs: 0,
    imageSources: 0,
    imageRows: 0
  };
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const pdfTextDebug = getPdfTextDebugConfig();

  const tamilFontBytes = await fetch(tamilFontUrl).then((response) => response.arrayBuffer());
  const tamilFont = await doc.embedFont(tamilFontBytes, { subset: true });

  onProgress(5, 'Preparing layout...');
  const standardFontCache = new Map<StandardFonts, PDFFont>();
  const grid = getPresetGrid(project.preset);
  const layout = getPresetLayoutConfig(project.preset);
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = layout.margin;
  const gutter = layout.gutter;
  const usableWidth = pageWidth - margin * 2 - gutter * (grid.cols - 1);
  const usableHeight = pageHeight - margin * 2 - gutter * (grid.rows - 1);
  const slotWidth = usableWidth / grid.cols;
  const slotHeight = usableHeight / grid.rows;

  const ratio = project.template.width / project.template.height;
  let cardWidth = 0;
  let cardHeight = 0;
  if (layout.fixedCardSize) {
    cardWidth = layout.fixedCardSize.width;
    cardHeight = layout.fixedCardSize.height;
  } else {
    cardWidth = slotWidth;
    cardHeight = slotWidth / ratio;
    if (cardHeight > slotHeight) {
      cardHeight = slotHeight;
      cardWidth = slotHeight * ratio;
    }
  }

  const cols = grid.cols;
  const perPage = grid.cols * grid.rows;
  const nextIssues: Record<string, string> = {};
  const rowImageSourceKey = new Map<string, string>();
  const rowImageBytes = new Map<string, Uint8Array>();
  const embeddedImageBySourceKey = new Map<string, PDFImage>();
  const totalRows = project.rows.length;
  const totalPagePairs = Math.ceil(totalRows / perPage);

  const rowsBySourceKey = new Map<string, FlashcardRow[]>();
  for (const row of project.rows) {
    const sourceKey = getImageSourceKey(row);
    if (!sourceKey) {
      continue;
    }
    rowImageSourceKey.set(row.id, sourceKey);
    const list = rowsBySourceKey.get(sourceKey);
    if (list) {
      list.push(row);
    } else {
      rowsBySourceKey.set(sourceKey, [row]);
    }
  }
  perf.imageRows = rowImageSourceKey.size;
  perf.imageSources = rowsBySourceKey.size;

  const prefetchStart = performance.now();
  const sourceEntries = Array.from(rowsBySourceKey.entries());
  const prefetchConcurrency = 6;
  let sourceIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(prefetchConcurrency, sourceEntries.length || 0) }).map(async () => {
      while (sourceIndex < sourceEntries.length) {
        const currentIndex = sourceIndex;
        sourceIndex += 1;
        const [, rowsForSource] = sourceEntries[currentIndex];
        const representativeRow = rowsForSource[0];
        const sourceKey = rowImageSourceKey.get(representativeRow.id);
        if (!sourceKey) {
          continue;
        }
        try {
          const fetchStart = performance.now();
          const { bytes, fromCache } = await fetchImageBytesWithMemoryCache(sourceKey, representativeRow);
          if (fromCache) {
            perf.imageCacheHits += 1;
          } else {
            perf.imageFetchMs += performance.now() - fetchStart;
          }
          for (const row of rowsForSource) {
            rowImageBytes.set(row.id, bytes);
          }
        } catch {
          if (!isRemoteSourceKey(sourceKey)) {
            continue;
          }
          for (const row of rowsForSource) {
            nextIssues[row.id] = 'Unable to load image. Workaround: save the image and upload it from your computer.';
          }
        }
      }
    })
  );
  perf.imagePrefetchMs = performance.now() - prefetchStart;

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
    const sideStart = performance.now();
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

    page.pushOperators(pushGraphicsState(), rectangle(cardX, cardY, cardWidth, cardHeight), clip(), endPath());
    try {
      const imageElement = project.template.image;
      if (imageElement.side === side) {
        const sourceKey = rowImageSourceKey.get(row.id);
        const imageBytes = rowImageBytes.get(row.id);
        const imageX = cardX + (imageElement.x / project.template.width) * cardWidth;
        const imageY = cardY + cardHeight - ((imageElement.y + imageElement.height) / project.template.height) * cardHeight;
        const imageW = (imageElement.width / project.template.width) * cardWidth;
        const imageH = (imageElement.height / project.template.height) * cardHeight;

        if (sourceKey && imageBytes) {
          const embedStart = performance.now();
          let embeddedImage = embeddedImageBySourceKey.get(sourceKey);
          if (!embeddedImage) {
            embeddedImage = detectImageType(imageBytes) === 'png' ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
            embeddedImageBySourceKey.set(sourceKey, embeddedImage);
          }
          perf.imageEmbedMs += performance.now() - embedStart;
          const containRect = getContainRect(imageX, imageY, imageW, imageH, embeddedImage.width, embeddedImage.height);
          page.drawImage(embeddedImage, containRect);
        } else if (sourceKey && isRemoteSourceKey(sourceKey) && !nextIssues[row.id]) {
          nextIssues[row.id] = 'Unable to load image. Workaround: save the image and upload it from your computer.';
        }
      }

      for (const textElement of project.template.textElements.filter((item) => item.side === side)) {
        const rawText = fitTextValue(row, textElement.role);
        const textPadding = 4;
        const lines = splitTextForPdf(rawText, {
          ...textElement,
          width: Math.max(textElement.width - textPadding * 2, 0)
        });

        const scaledFontSize = (textElement.fontSize / project.template.width) * cardWidth;
        const lineHeight = scaledFontSize * textElement.lineHeight;
        const boxH = (textElement.height / project.template.height) * cardHeight;
        const paddingY = (textPadding / project.template.height) * cardHeight;
        const innerH = Math.max(boxH - paddingY * 2, 0);
        const maxLines = Math.floor(innerH / lineHeight);
        const clipped = lines.slice(0, Math.max(maxLines, 0));

        const paddingX = (textPadding / project.template.width) * cardWidth;
        const textX = cardX + (textElement.x / project.template.width) * cardWidth + paddingX;
        const textYTop = cardY + cardHeight - (textElement.y / project.template.height) * cardHeight;
        const boxW = Math.max((textElement.width / project.template.width) * cardWidth - paddingX * 2, 0);
        const textBlockHeight = clipped.length * lineHeight;
        const topInset = paddingY + Math.max((innerH - textBlockHeight) / 2, 0);
        const textTopY = textYTop - topInset;
        const textColor = parseHexColor(textElement.color);
        const proportionalNudgeTemplatePx = textElement.fontSize * textElement.lineHeight * BASELINE_NUDGE_LINE_HEIGHT_RATIO;
        const yNudgeTemplatePx = proportionalNudgeTemplatePx + pdfTextDebug.yNudgePx;
        const yNudgePdf = (yNudgeTemplatePx / project.template.height) * cardHeight;

        clipped.forEach((line, lineIndex) => {
          const drawStart = performance.now();
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

          const ascent = activeFont.heightAtSize(scaledFontSize, { descender: false });
          const lineTopY = textTopY - lineHeight * lineIndex;
          const baselineY = lineTopY - ascent - yNudgePdf;

          page.drawText(line, {
            x,
            y: baselineY,
            size: scaledFontSize,
            font: activeFont,
            color: rgb(textColor.r, textColor.g, textColor.b)
          });
          perf.textDrawMs += performance.now() - drawStart;

          if (pdfTextDebug.enabled && lineIndex === 0) {
            const baselineByLineHeight = textTopY - lineHeight;
            const ascentShift = baselineY - baselineByLineHeight;
            console.log('[pdf-text-debug]', {
              rowId: row.id,
              side,
              textId: textElement.id,
              fontFamily: textElement.fontFamily,
              fontSize: textElement.fontSize,
              lineHeight: textElement.lineHeight,
              baselineNudgeRatio: BASELINE_NUDGE_LINE_HEIGHT_RATIO,
              proportionalNudgeTemplatePx: Number(proportionalNudgeTemplatePx.toFixed(3)),
              manualNudgeTemplatePx: pdfTextDebug.yNudgePx,
              totalNudgeTemplatePx: Number(yNudgeTemplatePx.toFixed(3)),
              boxTopTemplateY: textElement.y,
              boxHeightTemplate: textElement.height,
              textTopPdfY: Number(textTopY.toFixed(3)),
              baselinePdfY: Number(baselineY.toFixed(3)),
              ascentPdf: Number(ascent.toFixed(3)),
              lineHeightPdf: Number(lineHeight.toFixed(3)),
              ascentShiftPdf: Number(ascentShift.toFixed(3)),
              ascentShiftTemplatePx: Number(((ascentShift / cardHeight) * project.template.height).toFixed(3))
            });
          }
        });
      }
    } finally {
      page.pushOperators(popGraphicsState());
      perf.pagesMs += performance.now() - sideStart;
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
  const saveStart = performance.now();
  const bytes = await doc.save();
  perf.saveMs = performance.now() - saveStart;

  if (perfConfig.enabled) {
    const totalMs = performance.now() - perfStart;
    console.log(
      '[pdf-perf]',
      JSON.stringify({
      rows: totalRows,
      doubleSided: project.doubleSided,
      totalMs: Number(totalMs.toFixed(1)),
      imagePrefetchMs: Number(perf.imagePrefetchMs.toFixed(1)),
      imageCacheHits: perf.imageCacheHits,
      imageSources: perf.imageSources,
      imageRows: perf.imageRows,
      imageFetchMs: Number(perf.imageFetchMs.toFixed(1)),
      imageEmbedMs: Number(perf.imageEmbedMs.toFixed(1)),
      textDrawMs: Number(perf.textDrawMs.toFixed(1)),
      pagesMs: Number(perf.pagesMs.toFixed(1)),
      saveMs: Number(perf.saveMs.toFixed(1))
      })
    );
  }

  return {
    bytes: new Uint8Array(bytes),
    imageIssues: nextIssues
  };
}
