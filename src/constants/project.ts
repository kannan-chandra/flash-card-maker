import type { CardTemplate, FlashcardSet, FontFamily, TextElement } from '../types';

export const FONT_FAMILIES: FontFamily[] = [
  'Arial',
  'Verdana',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Noto Sans Tamil'
];

export const SINGLE_SIDED_DEFAULT_TEMPLATE: CardTemplate = {
  width: 700,
  height: 500,
  backgroundColor: '#ffffff',
  image: {
    side: 1,
    x: 175,
    y: 100,
    width: 350,
    height: 260
  },
  textElements: [
    {
      id: 'text1',
      role: 'word',
      side: 1,
      x: 70,
      y: 20,
      width: 560,
      height: 70,
      fontFamily: 'Arial',
      fontSize: 56,
      color: '#1f2937',
      align: 'center',
      lineHeight: 1.2
    },
    {
      id: 'text2',
      role: 'subtitle',
      side: 1,
      x: 70,
      y: 375,
      width: 560,
      height: 85,
      fontFamily: 'Verdana',
      fontSize: 30,
      color: '#374151',
      align: 'center',
      lineHeight: 1.2
    }
  ]
};

export const DOUBLE_SIDED_DEFAULT_TEMPLATE: CardTemplate = {
  width: 700,
  height: 500,
  backgroundColor: '#ffffff',
  image: {
    side: 2,
    x: 175,
    y: 80,
    width: 350,
    height: 280
  },
  textElements: [
    {
      id: 'text1',
      role: 'word',
      side: 1,
      x: 70,
      y: 160,
      width: 560,
      height: 180,
      fontFamily: 'Arial',
      fontSize: 80,
      color: '#1f2937',
      align: 'center',
      lineHeight: 1.2
    },
    {
      id: 'text2',
      role: 'subtitle',
      side: 2,
      x: 70,
      y: 380,
      width: 560,
      height: 70,
      fontFamily: 'Verdana',
      fontSize: 28,
      color: '#374151',
      align: 'center',
      lineHeight: 1.2
    }
  ]
};

export const DEFAULT_TEMPLATE = SINGLE_SIDED_DEFAULT_TEMPLATE;

function cloneTemplate(template: CardTemplate): CardTemplate {
  return {
    ...template,
    image: { ...template.image },
    textElements: template.textElements.map((item) => ({ ...item })) as CardTemplate['textElements']
  };
}

export const EMPTY_SET_BASE: Omit<FlashcardSet, 'id' | 'name' | 'createdAt'> = {
  template: cloneTemplate(SINGLE_SIDED_DEFAULT_TEMPLATE),
  singleSidedTemplate: cloneTemplate(SINGLE_SIDED_DEFAULT_TEMPLATE),
  doubleSidedTemplate: cloneTemplate(DOUBLE_SIDED_DEFAULT_TEMPLATE),
  doubleSided: false,
  rows: [],
  preset: 6,
  pdfSpacingMode: 'with-margin',
  showCutGuides: true,
  updatedAt: Date.now()
};

export function makeNewSet(name: string, index: number): FlashcardSet {
  const now = Date.now();
  return {
    ...EMPTY_SET_BASE,
    template: cloneTemplate(SINGLE_SIDED_DEFAULT_TEMPLATE),
    singleSidedTemplate: cloneTemplate(SINGLE_SIDED_DEFAULT_TEMPLATE),
    doubleSidedTemplate: cloneTemplate(DOUBLE_SIDED_DEFAULT_TEMPLATE),
    id: `set-${now}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim() || `Set ${index}`,
    createdAt: now,
    updatedAt: now
  };
}

export function normalizeTemplate(template: CardTemplate): CardTemplate {
  const fallback = SINGLE_SIDED_DEFAULT_TEMPLATE;
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
  const singleSidedTemplate = normalizeTemplate(
    setItem.singleSidedTemplate ?? (setItem.doubleSided ? SINGLE_SIDED_DEFAULT_TEMPLATE : setItem.template)
  );
  const doubleSidedTemplate = normalizeTemplate(
    setItem.doubleSidedTemplate ?? (setItem.doubleSided ? setItem.template : DOUBLE_SIDED_DEFAULT_TEMPLATE)
  );
  const doubleSided = setItem.doubleSided ?? false;
  const normalizedPreset = setItem.preset === 6 || setItem.preset === 8 ? setItem.preset : 15;
  return {
    ...setItem,
    doubleSided,
    preset: normalizedPreset,
    pdfSpacingMode: setItem.pdfSpacingMode === 'easy-cut' ? 'easy-cut' : 'with-margin',
    singleSidedTemplate,
    doubleSidedTemplate,
    template: doubleSided ? doubleSidedTemplate : singleSidedTemplate
  };
}
