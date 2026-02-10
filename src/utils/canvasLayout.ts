export interface CanvasSideContext {
  cardHeight: number;
  doubleSided: boolean;
}

export function getStageHeight(context: CanvasSideContext): number {
  return context.doubleSided ? context.cardHeight * 2 : context.cardHeight;
}

export function sideOffset(side: 1 | 2, context: CanvasSideContext): number {
  return context.doubleSided ? (side - 1) * context.cardHeight : 0;
}

export function toCanvasY(y: number, side: 1 | 2, context: CanvasSideContext): number {
  return y + sideOffset(side, context);
}

export function fromCanvasY(canvasY: number, elementHeight: number, context: CanvasSideContext): { side: 1 | 2; y: number } {
  if (!context.doubleSided) {
    return { side: 1, y: Math.max(0, Math.min(canvasY, context.cardHeight - elementHeight)) };
  }

  const side: 1 | 2 = canvasY >= context.cardHeight ? 2 : 1;
  const offset = side === 2 ? context.cardHeight : 0;
  const localY = canvasY - offset;
  return { side, y: Math.max(0, Math.min(localY, context.cardHeight - elementHeight)) };
}
