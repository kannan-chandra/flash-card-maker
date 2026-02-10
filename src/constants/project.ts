import type { CardTemplate, FlashcardSet, FontFamily, TextElement } from '../types';

export const FONT_FAMILIES: FontFamily[] = [
  'Arial',
  'Verdana',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Noto Sans Tamil'
];

export const DEFAULT_TEMPLATE: CardTemplate = {
  width: 700,
  height: 500,
  backgroundColor: '#ffffff',
  image: {
    side: 1,
    x: 35,
    y: 35,
    width: 260,
    height: 250
  },
  textElements: [
    {
      id: 'text1',
      role: 'word',
      side: 1,
      x: 320,
      y: 80,
      width: 340,
      height: 160,
      fontFamily: 'Arial',
      fontSize: 44,
      color: '#1f2937',
      align: 'center',
      lineHeight: 1.2
    },
    {
      id: 'text2',
      role: 'subtitle',
      side: 1,
      x: 320,
      y: 260,
      width: 340,
      height: 140,
      fontFamily: 'Verdana',
      fontSize: 28,
      color: '#374151',
      align: 'center',
      lineHeight: 1.2
    }
  ]
};

export const EMPTY_SET_BASE: Omit<FlashcardSet, 'id' | 'name' | 'createdAt'> = {
  template: DEFAULT_TEMPLATE,
  doubleSided: false,
  rows: [],
  preset: 6,
  showCutGuides: true,
  updatedAt: Date.now()
};

export function makeNewSet(name: string, index: number): FlashcardSet {
  const now = Date.now();
  return {
    ...EMPTY_SET_BASE,
    template: {
      ...DEFAULT_TEMPLATE,
      image: { ...DEFAULT_TEMPLATE.image },
      textElements: DEFAULT_TEMPLATE.textElements.map((item) => ({ ...item })) as CardTemplate['textElements']
    },
    id: `set-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || `Set ${index}`,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeTemplate(template: CardTemplate): CardTemplate {
  const fallback = DEFAULT_TEMPLATE;
  const safeNumber = (value: unknown, defaultValue: number) =>
    typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
  const safeSide = (value: unknown, defaultSide: 1 | 2): 1 | 2 => (value === 2 ? 2 : defaultSide);
  const safeAlign = (value: unknown, defaultAlign: TextElement['align']): TextElement['align'] =>
    value === 'left' || value === 'center' || value === 'right' ? value : defaultAlign;

  const fallbackTextById: Record<'text1' | 'text2', TextElement> = {
    text1: fallback.textElements[0],
    text2: fallback.textElements[1]
  };

  return {
    ...template,
    width: safeNumber(template.width, fallback.width),
    height: safeNumber(template.height, fallback.height),
    backgroundColor: template.backgroundColor || fallback.backgroundColor,
    image: {
      ...template.image,
      side: safeSide(template.image?.side, 1),
      x: safeNumber(template.image?.x, fallback.image.x),
      y: safeNumber(template.image?.y, fallback.image.y),
      width: safeNumber(template.image?.width, fallback.image.width),
      height: safeNumber(template.image?.height, fallback.image.height)
    },
    textElements: template.textElements.map((item) => {
      const fb = fallbackTextById[item.id];
      return {
        ...item,
        side: safeSide(item.side, 1),
        x: safeNumber(item.x, fb.x),
        y: safeNumber(item.y, fb.y),
        width: safeNumber(item.width, fb.width),
        height: safeNumber(item.height, fb.height),
        fontSize: safeNumber(item.fontSize, fb.fontSize),
        lineHeight: safeNumber(item.lineHeight, fb.lineHeight),
        align: safeAlign(item.align, fb.align),
        color: item.color || fb.color,
        fontFamily: item.fontFamily || fb.fontFamily,
        role: item.role === 'subtitle' ? 'subtitle' : 'word'
      };
    }) as CardTemplate['textElements']
  };
}

export function normalizeSet(setItem: FlashcardSet): FlashcardSet {
  return {
    ...setItem,
    doubleSided: setItem.doubleSided ?? false,
    template: normalizeTemplate(setItem.template)
  };
}
