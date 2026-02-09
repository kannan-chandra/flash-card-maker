import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import { PDFDocument, StandardFonts, type PDFFont, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import tamilFontUrl from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff?url';
import '@fontsource/noto-sans-tamil/400.css';
import type Konva from 'konva';
import type {
  CardPreset,
  CardTemplate,
  FlashcardRow,
  FlashcardSet,
  FontFamily,
  ProjectData,
  RowValidation,
  TextElement
} from './types';
import { loadWorkspace, saveWorkspace } from './storage';
import { parseCsvInput } from './utils/csv';
import { createEmojiImageDataUrl, findEmojiForWord } from './utils/emoji';
import { splitTextForPdf, validateRows } from './utils/layout';

const FONT_FAMILIES: FontFamily[] = ['Arial', 'Verdana', 'Times New Roman', 'Georgia', 'Courier New', 'Noto Sans Tamil'];

const DEFAULT_TEMPLATE: CardTemplate = {
  width: 700,
  height: 500,
  backgroundColor: '#ffffff',
  image: {
    x: 35,
    y: 35,
    width: 260,
    height: 250
  },
  textElements: [
    {
      id: 'text1',
      role: 'word',
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

const EMPTY_PROJECT: ProjectData = {
  template: DEFAULT_TEMPLATE,
  rows: [],
  preset: 6,
  showCutGuides: true,
  updatedAt: Date.now()
};

function makeNewSet(name: string, index: number): FlashcardSet {
  const now = Date.now();
  return {
    ...EMPTY_PROJECT,
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

function useImage(src?: string): HTMLImageElement | undefined {
  const [img, setImg] = useState<HTMLImageElement>();

  useEffect(() => {
    if (!src) {
      setImg(undefined);
      return;
    }
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => setImg(image);
    image.onerror = () => setImg(undefined);
    image.src = src;
  }, [src]);

  return img;
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

export default function App() {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [newSetName, setNewSetName] = useState('');
  const [setsMenuOpen, setSetsMenuOpen] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [selectedElement, setSelectedElement] = useState<string>('image');
  const [loading, setLoading] = useState(true);
  const [pdfStatus, setPdfStatus] = useState<string>('');
  const [emojiBulkPrompt, setEmojiBulkPrompt] = useState<{ emoji: string; count: number } | null>(null);
  const [pdfProgress, setPdfProgress] = useState<{ active: boolean; percent: number; stage: string }>({
    active: false,
    percent: 0,
    stage: ''
  });
  const [imageIssues, setImageIssues] = useState<Record<string, string>>({});
  const imageRef = useRef<Konva.Image>(null);
  const text1Ref = useRef<Konva.Text>(null);
  const text2Ref = useRef<Konva.Text>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const project = useMemo(() => {
    return sets.find((setItem) => setItem.id === activeSetId) ?? sets[0] ?? null;
  }, [sets, activeSetId]);

  const selectedRow = useMemo(() => {
    if (!project) {
      return undefined;
    }
    if (!project.rows.length) {
      return undefined;
    }
    if (!project.selectedRowId) {
      return project.rows[0];
    }
    return project.rows.find((row) => row.id === project.selectedRowId) ?? project.rows[0];
  }, [project]);
  const selectedRowEmoji = useMemo(() => findEmojiForWord(selectedRow?.word ?? ''), [selectedRow?.word]);
  const canUseEmojiForSelectedRow = useMemo(() => {
    if (!selectedRow || !selectedRowEmoji) {
      return false;
    }
    return !selectedRow.imageUrl && !selectedRow.localImageDataUrl;
  }, [selectedRow, selectedRowEmoji]);
  const selectedRowIndex = useMemo(
    () => (project ? project.rows.findIndex((row) => row.id === selectedRow?.id) : -1),
    [project, selectedRow?.id]
  );

  const previewImageSrc = selectedRow?.localImageDataUrl || selectedRow?.imageUrl;
  const previewImage = useImage(previewImageSrc);

  const validations: RowValidation[] = useMemo(() => {
    if (!project) {
      return [];
    }
    return validateRows(project.template, project.rows);
  }, [project]);

  useEffect(() => {
    loadWorkspace().then((saved) => {
      if (saved?.sets.length) {
        setSets(saved.sets);
        setActiveSetId(saved.activeSetId);
      } else {
        const firstSet = makeNewSet('Set 1', 1);
        setSets([firstSet]);
        setActiveSetId(firstSet.id);
      }
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (loading || !sets.length || !activeSetId) {
      return;
    }
    const nextSets = sets.map((item) => (item.id === activeSetId ? { ...item, updatedAt: Date.now() } : item));
    saveWorkspace({
      sets: nextSets,
      activeSetId,
      updatedAt: Date.now()
    });
  }, [sets, activeSetId, loading]);

  useEffect(() => {
    if (!transformerRef.current || !project) {
      return;
    }

    const nodes: Konva.Node[] = [];
    if (selectedElement === 'image' && imageRef.current) nodes.push(imageRef.current);
    if (selectedElement === 'text1' && text1Ref.current) nodes.push(text1Ref.current);
    if (selectedElement === 'text2' && text2Ref.current) nodes.push(text2Ref.current);
    transformerRef.current.nodes(nodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedElement, project]);

  function updateActiveSet(updater: (current: FlashcardSet) => FlashcardSet) {
    setSets((currentSets) =>
      currentSets.map((item) => {
        if (item.id !== activeSetId) {
          return item;
        }
        return { ...updater(item), updatedAt: Date.now() };
      })
    );
  }

  function createSet() {
    setSets((currentSets) => {
      const nextSet = makeNewSet(newSetName, currentSets.length + 1);
      setActiveSetId(nextSet.id);
      setNewSetName('');
      setSetsMenuOpen(false);
      return [...currentSets, nextSet];
    });
  }

  function deleteSet(setId: string) {
    if (!window.confirm('Delete this set? This only removes it from local browser storage.')) {
      return;
    }
    setSets((currentSets) => {
      const remaining = currentSets.filter((item) => item.id !== setId);
      if (!remaining.length) {
        const fallback = makeNewSet('Set 1', 1);
        setActiveSetId(fallback.id);
        return [fallback];
      }
      if (setId === activeSetId) {
        setActiveSetId(remaining[0].id);
      }
      return remaining;
    });
  }

  function patchTemplate(patch: Partial<CardTemplate>) {
    updateActiveSet((current) => ({
      ...current,
      template: {
        ...current.template,
        ...patch
      }
    }));
  }

  function patchTextElement(id: 'text1' | 'text2', patch: Partial<TextElement>) {
    updateActiveSet((current) => ({
      ...current,
      template: {
        ...current.template,
        textElements: current.template.textElements.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        ) as [TextElement, TextElement]
      }
    }));
  }

  function replaceRows(rows: FlashcardRow[]) {
    updateActiveSet((current) => ({
      ...current,
      rows,
      selectedRowId: rows[0]?.id
    }));
  }

  function appendRows(rows: FlashcardRow[]) {
    updateActiveSet((current) => ({
      ...current,
      rows: [...current.rows, ...rows],
      selectedRowId: current.selectedRowId ?? rows[0]?.id
    }));
  }

  function onCsvImport() {
    const rows = parseCsvInput(csvInput);
    if (!rows.length) {
      setPdfStatus('No CSV rows found.');
      return;
    }
    appendRows(rows);
    setCsvInput('');
    setPdfStatus(`Imported ${rows.length} rows from CSV.`);
  }

  async function onRowImageUpload(rowId: string, file: File) {
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

    updateActiveSet((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, localImageDataUrl: dataUrl } : row))
    }));
  }

  async function onRowImageDrop(event: DragEvent<HTMLElement>, rowId: string) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) {
      return;
    }
    await onRowImageUpload(rowId, file);
  }

  async function onSelectedRowImageUpload(file: File) {
    if (!selectedRow) {
      return;
    }
    await onRowImageUpload(selectedRow.id, file);
  }

  async function onSelectedRowImageDrop(event: DragEvent<HTMLDivElement>) {
    if (!selectedRow) {
      return;
    }
    await onRowImageDrop(event, selectedRow.id);
  }

  function updateRow(rowId: string, patch: Partial<FlashcardRow>) {
    updateActiveSet((current) => ({
      ...current,
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
    }));
  }

  function countRowsEligibleForEmoji() {
    if (!project) {
      return 0;
    }
    return project.rows.filter((row) => !row.imageUrl && !row.localImageDataUrl && Boolean(findEmojiForWord(row.word))).length;
  }

  function applyEmojiToRow(rowId: string, emoji: string) {
    const dataUrl = createEmojiImageDataUrl(emoji);
    updateRow(rowId, { localImageDataUrl: dataUrl, imageUrl: '' });
  }

  function onUseEmojiForSelectedRow() {
    if (!selectedRow || !selectedRowEmoji) {
      return;
    }

    applyEmojiToRow(selectedRow.id, selectedRowEmoji);
    const eligibleCount = countRowsEligibleForEmoji();
    const others = Math.max(eligibleCount - 1, 0);
    if (others > 0) {
      setEmojiBulkPrompt({ emoji: selectedRowEmoji, count: others });
    } else {
      setEmojiBulkPrompt(null);
    }
  }

  function onApplyEmojiToAllMissingImages() {
    updateActiveSet((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        if (row.imageUrl || row.localImageDataUrl) {
          return row;
        }
        const emoji = findEmojiForWord(row.word);
        if (!emoji) {
          return row;
        }
        return { ...row, localImageDataUrl: createEmojiImageDataUrl(emoji), imageUrl: '' };
      })
    }));
    setEmojiBulkPrompt(null);
    setPdfStatus('Applied emoji images to rows with matching words and no image.');
  }

  async function generatePdf() {
    if (pdfProgress.active) {
      return;
    }

    if (!project) {
      setPdfStatus('No active set selected.');
      return;
    }

    if (!project.rows.length) {
      setPdfStatus('Add at least one row before generating PDF.');
      return;
    }

    const setProgress = (percent: number, stage: string) => {
      setPdfProgress({
        active: true,
        percent: Math.max(0, Math.min(100, Math.round(percent))),
        stage
      });
      setPdfStatus(stage);
    };

    setProgress(0, 'Preparing PDF...');
    setImageIssues({});

    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    let tamilFont: PDFFont | null = null;
    try {
      const tamilFontBytes = await fetch(tamilFontUrl).then((response) => response.arrayBuffer());
      tamilFont = await doc.embedFont(tamilFontBytes, { subset: true });
    } catch {
      setPdfStatus('Failed to load Tamil font for PDF export.');
      setPdfProgress({ active: false, percent: 0, stage: '' });
      return;
    }
    setProgress(5, 'Preparing layout...');
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

    for (let i = 0; i < project.rows.length; i += 1) {
      const renderPercent = 10 + ((i + 1) / totalRows) * 80;
      setProgress(renderPercent, `Rendering card ${i + 1} of ${totalRows}...`);
      if (i % 4 === 0) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }

      if (i % perPage === 0) {
        doc.addPage([pageWidth, pageHeight]);
      }

      const page = doc.getPages()[Math.floor(i / perPage)];
      const row = project.rows[i];
      const slotIndex = i % perPage;
      const rowInPage = Math.floor(slotIndex / cols);
      const colInPage = slotIndex % cols;
      const slotX = margin + colInPage * (slotWidth + gutter);
      const slotYTop = margin + rowInPage * (slotHeight + gutter);

      const cardX = slotX + (slotWidth - cardWidth) / 2;
      const cardY = pageHeight - slotYTop - cardHeight - (slotHeight - cardHeight) / 2;

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
      const imageX = cardX + (imageElement.x / project.template.width) * cardWidth;
      const imageY = cardY + cardHeight - ((imageElement.y + imageElement.height) / project.template.height) * cardHeight;
      const imageW = (imageElement.width / project.template.width) * cardWidth;
      const imageH = (imageElement.height / project.template.height) * cardHeight;

      try {
        const imageBytes = await fetchImageBytes(row);
        const embeddedImage = detectImageType(imageBytes) === 'png' ? await doc.embedPng(imageBytes) : await doc.embedJpg(imageBytes);
        page.drawImage(embeddedImage, {
          x: imageX,
          y: imageY,
          width: imageW,
          height: imageH
        });
      } catch {
        nextIssues[row.id] = 'Unable to load image. Workaround: save the image and upload it from your computer.';
      }

      for (const textElement of project.template.textElements) {
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
          const activeFont = shouldUseTamilFont ? tamilFont! : font;

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

    setProgress(92, 'Finalizing PDF file...');
    const bytes = await doc.save();
    setProgress(98, 'Starting download...');
    const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'flashcards.pdf';
    anchor.click();
    URL.revokeObjectURL(url);
    setPdfProgress({ active: false, percent: 100, stage: '' });

    setImageIssues(nextIssues);
    if (Object.keys(nextIssues).length) {
      setPdfStatus('PDF generated with some image errors. Use local image upload for blocked web images.');
      return;
    }
    setPdfStatus('PDF generated successfully.');
  }

  const currentValidation = validations.find((item) => item.rowId === selectedRow?.id);

  if (loading) {
    return <div className="loading">Loading project...</div>;
  }
  if (!project) {
    return <div className="loading">No sets available.</div>;
  }

  return (
    <div className="app">
      <header>
        <button
          type="button"
          className="hamburger-btn"
          onClick={() => setSetsMenuOpen((current) => !current)}
          aria-label="Toggle flash card sets menu"
          aria-expanded={setsMenuOpen}
        >
          <span />
          <span />
          <span />
        </button>
        <h1>Flash Card Maker</h1>
        <p>Design one master card layout. Every row in your list uses the same layout.</p>
        <p className="local-only">
          Stored locally in this browser only (IndexedDB). If browser data is cleared, your project is lost.
        </p>
      </header>

      {setsMenuOpen && <button type="button" className="menu-backdrop" onClick={() => setSetsMenuOpen(false)} aria-label="Close sets menu" />}
      <aside className={`panel sets-drawer ${setsMenuOpen ? 'open' : ''}`} aria-hidden={!setsMenuOpen}>
        <div className="sets-drawer-header">
          <h2>Flash Card Sets</h2>
          <button type="button" onClick={() => setSetsMenuOpen(false)}>
            Close
          </button>
        </div>
        <p>Browse and switch between locally stored sets.</p>
        <div className="set-create">
          <input
            value={newSetName}
            onChange={(event) => setNewSetName(event.target.value)}
            placeholder="New set name"
            aria-label="New set name"
          />
          <button onClick={createSet}>Create Set</button>
        </div>
        <div className="set-list">
          {sets.map((setItem) => (
            <div key={setItem.id} className={`set-item ${setItem.id === project.id ? 'active' : ''}`}>
              <button
                className="set-select"
                onClick={() => {
                  setActiveSetId(setItem.id);
                  setSetsMenuOpen(false);
                }}
              >
                <strong>{setItem.name}</strong>
                <span>{setItem.rows.length} rows</span>
              </button>
              <button className="danger" onClick={() => deleteSet(setItem.id)}>
                Delete
              </button>
            </div>
          ))}
        </div>
      </aside>

      <main>
        <section className="panel editor-panel">
          <h2>Master Card Layout</h2>
          <p>Drag and resize elements. Changes affect all generated cards.</p>

          <div className="editor-layout">
            <div>
              <div className="editor-controls">
                <label>
                  Background
                  <input
                    type="color"
                    value={project.template.backgroundColor}
                    onChange={(event) => patchTemplate({ backgroundColor: event.target.value })}
                  />
                </label>

                <label>
                  Selected element
                  <select value={selectedElement} onChange={(event) => setSelectedElement(event.target.value)}>
                    <option value="image">Image</option>
                    <option value="text1">Text 1 ({project.template.textElements[0].role})</option>
                    <option value="text2">Text 2 ({project.template.textElements[1].role})</option>
                  </select>
                </label>
              </div>

              {selectedElement !== 'image' && (
                <div className="text-controls">
                  {(() => {
                    const selectedText =
                      selectedElement === 'text1' ? project.template.textElements[0] : project.template.textElements[1];
                    return (
                      <>
                        <label>
                          Text role
                          <select
                            value={selectedText.role}
                            onChange={(event) =>
                              patchTextElement(selectedText.id, { role: event.target.value as TextElement['role'] })
                            }
                          >
                            <option value="word">Word</option>
                            <option value="subtitle">Subtitle</option>
                          </select>
                        </label>
                        <label>
                          Font
                          <select
                            value={selectedText.fontFamily}
                            onChange={(event) =>
                              patchTextElement(selectedText.id, { fontFamily: event.target.value as FontFamily })
                            }
                          >
                            {FONT_FAMILIES.map((font) => (
                              <option key={font} value={font}>
                                {font}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Size
                          <input
                            type="number"
                            min={10}
                            max={120}
                            value={selectedText.fontSize}
                            onChange={(event) =>
                              patchTextElement(selectedText.id, { fontSize: Number(event.target.value) || 10 })
                            }
                          />
                        </label>
                        <label>
                          Align
                          <select
                            value={selectedText.align}
                            onChange={(event) =>
                              patchTextElement(selectedText.id, { align: event.target.value as TextElement['align'] })
                            }
                          >
                            <option value="left">Left</option>
                            <option value="center">Center</option>
                            <option value="right">Right</option>
                          </select>
                        </label>
                      </>
                    );
                  })()}
                </div>
              )}

              <Stage width={project.template.width} height={project.template.height} className="stage">
                <Layer>
                  <Rect
                    x={0}
                    y={0}
                    width={project.template.width}
                    height={project.template.height}
                    fill={project.template.backgroundColor}
                    stroke="#d1d5db"
                    strokeWidth={1}
                  />

                  <KonvaImage
                    ref={imageRef}
                    image={previewImage}
                    x={project.template.image.x}
                    y={project.template.image.y}
                    width={project.template.image.width}
                    height={project.template.image.height}
                    draggable
                    onClick={() => setSelectedElement('image')}
                    onTap={() => setSelectedElement('image')}
                    onDragEnd={(event) =>
                      patchTemplate({
                        image: {
                          ...project.template.image,
                          x: event.target.x(),
                          y: event.target.y()
                        }
                      })
                    }
                    onTransformEnd={(event) => {
                      const node = event.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      patchTemplate({
                        image: {
                          x: node.x(),
                          y: node.y(),
                          width: Math.max(20, node.width() * scaleX),
                          height: Math.max(20, node.height() * scaleY)
                        }
                      });
                      node.scaleX(1);
                      node.scaleY(1);
                    }}
                    stroke={selectedElement === 'image' ? '#2563eb' : undefined}
                    strokeWidth={selectedElement === 'image' ? 2 : 0}
                  />

                  {project.template.textElements.map((textElement, index) => {
                    const textValue = selectedRow ? fitTextValue(selectedRow, textElement.role) : `[${textElement.role}]`;
                    return (
                      <Text
                        key={textElement.id}
                        ref={index === 0 ? text1Ref : text2Ref}
                        text={textValue}
                        x={textElement.x}
                        y={textElement.y}
                        width={textElement.width}
                        height={textElement.height}
                        fontSize={textElement.fontSize}
                        fontFamily={textElement.fontFamily}
                        fill={textElement.color}
                        align={textElement.align}
                        lineHeight={textElement.lineHeight}
                        verticalAlign="middle"
                        padding={4}
                        ellipsis
                        wrap="word"
                        draggable
                        onClick={() => setSelectedElement(textElement.id)}
                        onTap={() => setSelectedElement(textElement.id)}
                        onDragEnd={(event) =>
                          patchTextElement(textElement.id, {
                            x: event.target.x(),
                            y: event.target.y()
                          })
                        }
                        onTransformEnd={(event) => {
                          const node = event.target;
                          const scaleX = node.scaleX();
                          const scaleY = node.scaleY();
                          patchTextElement(textElement.id, {
                            x: node.x(),
                            y: node.y(),
                            width: Math.max(40, node.width() * scaleX),
                            height: Math.max(30, node.height() * scaleY)
                          });
                          node.scaleX(1);
                          node.scaleY(1);
                        }}
                        stroke={selectedElement === textElement.id ? '#2563eb' : '#9ca3af'}
                        strokeWidth={1}
                      />
                    );
                  })}

                  <Transformer ref={transformerRef} rotateEnabled={false} flipEnabled={false} keepRatio={false} />
                </Layer>
              </Stage>

              <div className="preview-meta">
                <h3>Row preview</h3>
                {selectedRow ? (
                  <p>
                    Previewing: <strong>{selectedRow.word || '(empty word)'}</strong>
                  </p>
                ) : (
                  <p>No rows yet.</p>
                )}
                <div className="row-buttons">
                  <button
                    onClick={() =>
                      updateActiveSet((current) => ({
                        ...current,
                        selectedRowId: current.rows[Math.max((selectedRowIndex || 0) - 1, 0)]?.id
                      }))
                    }
                    disabled={selectedRowIndex <= 0}
                  >
                    Previous
                  </button>
                  <button
                    onClick={() =>
                      updateActiveSet((current) => ({
                        ...current,
                        selectedRowId:
                          current.rows[Math.min((selectedRowIndex || 0) + 1, Math.max(current.rows.length - 1, 0))]?.id
                      }))
                    }
                    disabled={selectedRowIndex < 0 || selectedRowIndex >= project.rows.length - 1}
                  >
                    Next
                  </button>
                </div>
                {currentValidation && (currentValidation.wordOverflow || currentValidation.subtitleOverflow) && (
                  <p className="warn">This row has text overflow in one or more text boxes.</p>
                )}
              </div>
            </div>

            <aside className="card-detail-panel">
              <h3>Selected Card Details</h3>
              <p>Edit fields for the currently highlighted row.</p>
              {selectedRow ? (
                <>
                  <label>
                    Word
                    <input
                      value={selectedRow.word}
                      onChange={(event) => {
                        setEmojiBulkPrompt(null);
                        updateRow(selectedRow.id, { word: event.target.value });
                      }}
                      aria-label="Selected row word"
                    />
                  </label>
                  <label>
                    Subtitle
                    <input
                      value={selectedRow.subtitle}
                      onChange={(event) => updateRow(selectedRow.id, { subtitle: event.target.value })}
                      aria-label="Selected row subtitle"
                    />
                  </label>
                  <label>
                    Image URL
                    <input
                      value={selectedRow.imageUrl}
                      onChange={(event) => updateRow(selectedRow.id, { imageUrl: event.target.value })}
                      aria-label="Selected row image URL"
                      placeholder="https://..."
                    />
                  </label>
                  {canUseEmojiForSelectedRow && (
                    <button type="button" onClick={onUseEmojiForSelectedRow}>
                      Use emoji for image ({selectedRowEmoji})
                    </button>
                  )}
                  {emojiBulkPrompt && (
                    <div className="emoji-prompt">
                      <p>
                        Apply emoji images for {emojiBulkPrompt.count} other rows with missing images and available matches?
                      </p>
                      <div className="row-buttons">
                        <button type="button" onClick={onApplyEmojiToAllMissingImages}>
                          Yes, apply to all
                        </button>
                        <button type="button" onClick={() => setEmojiBulkPrompt(null)}>
                          Not now
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="drop-zone large" onDragOver={(event) => event.preventDefault()} onDrop={(event) => void onSelectedRowImageDrop(event)}>
                    Drop image here
                  </div>
                  <label>
                    Upload local image
                    <input
                      type="file"
                      accept="image/*"
                      aria-label="Selected row image upload"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          onSelectedRowImageUpload(file);
                        }
                      }}
                    />
                  </label>
                </>
              ) : (
                <p>Select a row from the list to edit details.</p>
              )}
            </aside>
          </div>

        </section>

        <section className="panel data-panel">
          <h2>Word & Image List</h2>
          <p>Columns: `word`, `subtitle`, `imageUrl`. Header row is optional. Select a row to edit details at left.</p>
          <textarea
            value={csvInput}
            onChange={(event) => setCsvInput(event.target.value)}
            placeholder={'word,subtitle,imageUrl\nDog,Animal,https://example.com/dog.jpg'}
            rows={5}
          />
          <div className="row-buttons">
            <button onClick={onCsvImport}>Import CSV</button>
            <button onClick={() => replaceRows([])} className="danger">
              Clear Rows
            </button>
          </div>

          <div className="list-table" role="region" aria-label="Rows list">
            <table>
              <thead>
                <tr>
                  <th>Word</th>
                  <th>Subtitle</th>
                  <th>Image URL</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {project.rows.map((row) => {
                  const rowValidation = validations.find((item) => item.rowId === row.id);
                  const hasIssue = Boolean(
                    rowValidation?.wordOverflow || rowValidation?.subtitleOverflow || rowValidation?.imageIssue || imageIssues[row.id]
                  );
                  return (
                    <tr
                      key={row.id}
                      className={row.id === selectedRow?.id ? 'selected' : undefined}
                      onClick={() => updateActiveSet((current) => ({ ...current, selectedRowId: row.id }))}
                    >
                      <td>
                        <input
                          value={row.word}
                          onChange={(event) => updateRow(row.id, { word: event.target.value })}
                          aria-label="Word"
                        />
                      </td>
                      <td>
                        <input
                          value={row.subtitle}
                          onChange={(event) => updateRow(row.id, { subtitle: event.target.value })}
                          aria-label="Subtitle"
                        />
                      </td>
                      <td>
                        <input
                          value={row.imageUrl}
                          onChange={(event) => updateRow(row.id, { imageUrl: event.target.value })}
                          aria-label="Image URL"
                          placeholder="https://..."
                        />
                      </td>
                      <td>
                        {hasIssue ? (
                          <span className="warn">
                            {rowValidation?.wordOverflow ? 'Word overflow. ' : ''}
                            {rowValidation?.subtitleOverflow ? 'Subtitle overflow. ' : ''}
                            {rowValidation?.imageIssue ? 'Missing image. ' : ''}
                            {imageIssues[row.id] ? 'Image fetch blocked.' : ''}
                          </span>
                        ) : (
                          <span className="ok">Fits</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel output-panel">
          <h2>PDF Output</h2>

          <label>
            Cards per page
            <select
              value={project.preset}
              onChange={(event) => updateActiveSet((current) => ({ ...current, preset: Number(event.target.value) as CardPreset }))}
            >
              <option value={6}>6 per page</option>
              <option value={8}>8 per page</option>
              <option value={12}>12 per page</option>
            </select>
          </label>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={project.showCutGuides}
              onChange={(event) => updateActiveSet((current) => ({ ...current, showCutGuides: event.target.checked }))}
            />
            Include cut guide borders
          </label>

          <button className="primary" onClick={generatePdf} disabled={pdfProgress.active}>
            {pdfProgress.active ? 'Generating...' : 'Generate PDF'}
          </button>

          {pdfProgress.active && (
            <div className="progress-wrap" aria-live="polite">
              <div className="progress-label">
                <span>{pdfProgress.stage}</span>
                <span>{pdfProgress.percent}%</span>
              </div>
              <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pdfProgress.percent}>
                <div className="progress-fill" style={{ width: `${pdfProgress.percent}%` }} />
              </div>
            </div>
          )}

          {pdfStatus && <p className="status">{pdfStatus}</p>}

          <p className="hint">
            If a web image fails due to CORS/restrictions, save it to your computer and upload it in the row’s “Upload
            Image” field.
          </p>
        </section>
      </main>
    </div>
  );
}
