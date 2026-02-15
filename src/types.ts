export type CardPreset = 6 | 8 | 12;
export type PdfSpacingMode = 'with-margin' | 'easy-cut';

export type FontFamily = 'Arial' | 'Verdana' | 'Times New Roman' | 'Georgia' | 'Courier New' | 'Noto Sans Tamil';

export type TextRole = 'word' | 'subtitle';

export interface ImageElement {
  side: 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextElement {
  id: 'text1' | 'text2';
  role: TextRole;
  side: 1 | 2;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: FontFamily;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface CardTemplate {
  width: number;
  height: number;
  backgroundColor: string;
  image: ImageElement;
  textElements: [TextElement, TextElement];
}

export interface FlashcardRow {
  id: string;
  word: string;
  subtitle: string;
  imageUrl: string;
  localImageDataUrl?: string;
}

export interface RowValidation {
  rowId: string;
  wordOverflow: boolean;
  subtitleOverflow: boolean;
  imageIssue?: string;
}

export interface ProjectData {
  template: CardTemplate;
  singleSidedTemplate?: CardTemplate;
  doubleSidedTemplate?: CardTemplate;
  doubleSided: boolean;
  rows: FlashcardRow[];
  preset: CardPreset;
  pdfSpacingMode: PdfSpacingMode;
  showCutGuides: boolean;
  selectedRowId?: string;
  updatedAt: number;
}

export interface FlashcardSet extends ProjectData {
  id: string;
  name: string;
  createdAt: number;
}

export interface WorkspaceData {
  sets: FlashcardSet[];
  activeSetId: string;
  updatedAt: number;
}
