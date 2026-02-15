import type { CardPreset, PdfSpacingMode } from '../types';

interface ExportLayoutPreviewProps {
  preset: CardPreset;
  spacingMode: PdfSpacingMode;
}

function getGrid(preset: CardPreset): { cols: number; rows: number } {
  if (preset === 6) return { cols: 2, rows: 3 };
  if (preset === 8) return { cols: 2, rows: 4 };
  return { cols: 3, rows: 5 };
}

export function ExportLayoutPreview(props: ExportLayoutPreviewProps) {
  const { preset, spacingMode } = props;
  const { cols, rows } = getGrid(preset);
  const pageWidth = 220;
  const pageHeight = 286;
  const pagePadding = 14;
  const baseGap = 6;
  const gap = spacingMode === 'with-margin' ? baseGap : 0;
  const cardAspectRatio = 3.5 / 2.5;
  const innerWidth = pageWidth - pagePadding * 2;
  const innerHeight = pageHeight - pagePadding * 2;
  const maxCardWidth = (innerWidth - baseGap * (cols - 1)) / cols;
  const maxCardHeight = (innerHeight - baseGap * (rows - 1)) / rows;
  const cardWidth = Math.min(maxCardWidth, maxCardHeight * cardAspectRatio);
  const cardHeight = cardWidth / cardAspectRatio;
  const gridWidth = cols * cardWidth + (cols - 1) * gap;
  const gridHeight = rows * cardHeight + (rows - 1) * gap;
  const startX = (pageWidth - gridWidth) / 2;
  const startY = (pageHeight - gridHeight) / 2;

  return (
    <div className="export-modal-preview" aria-hidden>
      <svg viewBox={`0 0 ${pageWidth} ${pageHeight}`} role="img" aria-label="PDF layout preview">
        <rect x="1" y="1" width={pageWidth - 2} height={pageHeight - 2} rx="10" className="export-page-outline" />
        {Array.from({ length: rows }).map((_, row) =>
          Array.from({ length: cols }).map((__, col) => (
            <rect
              key={`${row}-${col}`}
              x={startX + col * (cardWidth + gap)}
              y={startY + row * (cardHeight + gap)}
              width={cardWidth}
              height={cardHeight}
              className="export-card-outline"
            />
          ))
        )}
      </svg>
    </div>
  );
}
