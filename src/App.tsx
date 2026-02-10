import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import tamilFontUrl from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff?url';
import '@fontsource/noto-sans-tamil/400.css';
import type Konva from 'konva';
import type { CardPreset, CardTemplate, FlashcardRow, FlashcardSet, FontFamily, RowValidation, TextElement } from './types';
import { PdfOutputPanel } from './components/PdfOutputPanel';
import { SelectedCardDetails } from './components/SelectedCardDetails';
import { SetsDrawer } from './components/SetsDrawer';
import { WordListPanel } from './components/WordListPanel';
import { makeNewSet, normalizeSet, DEFAULT_TEMPLATE, FONT_FAMILIES } from './constants/project';
import { useImage } from './hooks/useImage';
import { generatePdfBytes } from './services/pdfExport';
import { loadWorkspace, saveWorkspace } from './storage';
import { fromCanvasY as mapFromCanvasY, getStageHeight, toCanvasY as mapToCanvasY } from './utils/canvasLayout';
import { parseCsvInput } from './utils/csv';
import { createEmojiImageDataUrl, findTopEmojiMatches } from './utils/emoji';
import { validateRows } from './utils/layout';
import { clearRowImage, hasRowImage, setImageFromDataUrl, setImageFromUrl } from './utils/rowImage';

function fitTextValue(row: FlashcardRow, role: TextElement['role']): string {
  return role === 'word' ? row.word : row.subtitle;
}

export default function App() {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [newSetName, setNewSetName] = useState('');
  const [setsMenuOpen, setSetsMenuOpen] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [selectedElement, setSelectedElement] = useState<'image' | 'text1' | 'text2' | null>(null);
  const [loading, setLoading] = useState(true);
  const [pdfStatus, setPdfStatus] = useState<string>('');
  const [pdfProgress, setPdfProgress] = useState<{ active: boolean; percent: number; stage: string }>({
    active: false,
    percent: 0,
    stage: ''
  });
  const [imageIssues, setImageIssues] = useState<Record<string, string>>({});
  const imageRef = useRef<Konva.Image>(null);
  const imagePlaceholderRef = useRef<Konva.Rect>(null);
  const text1Ref = useRef<Konva.Text>(null);
  const text2Ref = useRef<Konva.Text>(null);
  const text1PlaceholderRef = useRef<Konva.Rect>(null);
  const text2PlaceholderRef = useRef<Konva.Rect>(null);
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
  const selectedRowHasImage = hasRowImage(selectedRow);
  const selectedRowEmojiMatches = useMemo(() => {
    if (!selectedRow) {
      return [];
    }

    const wordMatches = findTopEmojiMatches(selectedRow.word ?? '', 10);
    if (wordMatches.length >= 5) {
      return wordMatches.slice(0, 5);
    }

    const subtitleMatches = findTopEmojiMatches(selectedRow.subtitle ?? '', 10);
    const merged = [...wordMatches];
    for (const match of subtitleMatches) {
      if (!merged.some((item) => item.emoji === match.emoji)) {
        merged.push(match);
      }
    }
    return merged.slice(0, 5);
  }, [selectedRow]);
  const selectedRowIndex = useMemo(
    () => (project ? project.rows.findIndex((row) => row.id === selectedRow?.id) : -1),
    [project, selectedRow?.id]
  );

  const previewImageSrc = selectedRow?.localImageDataUrl || selectedRow?.imageUrl;
  const previewImage = useImage(previewImageSrc);
  const imageIsEmpty = !previewImageSrc;
  const cardHeight = project?.template.height ?? DEFAULT_TEMPLATE.height;
  const canvasContext = { cardHeight, doubleSided: Boolean(project?.doubleSided) };
  const stageHeight = getStageHeight(canvasContext);
  const toCanvasY = (y: number, side: 1 | 2) => mapToCanvasY(y, side, canvasContext);
  const fromCanvasY = (canvasY: number, elementHeight: number) => mapFromCanvasY(canvasY, elementHeight, canvasContext);

  const validations: RowValidation[] = useMemo(() => {
    if (!project) {
      return [];
    }
    return validateRows(project.template, project.rows);
  }, [project]);

  useEffect(() => {
    loadWorkspace().then((saved) => {
      if (saved?.sets.length) {
        const normalizedSets = saved.sets.map(normalizeSet);
        setSets(normalizedSets);
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
    if (selectedElement === 'image' && imageIsEmpty && imagePlaceholderRef.current) nodes.push(imagePlaceholderRef.current);
    if (selectedElement === 'image' && !imageIsEmpty && imageRef.current) nodes.push(imageRef.current);
    if (selectedElement === 'text1') {
      const wordValue = selectedRow ? fitTextValue(selectedRow, project.template.textElements[0].role) : '';
      if (!wordValue.trim() && text1PlaceholderRef.current) {
        nodes.push(text1PlaceholderRef.current);
      } else if (text1Ref.current) {
        nodes.push(text1Ref.current);
      }
    }
    if (selectedElement === 'text2') {
      const subtitleValue = selectedRow ? fitTextValue(selectedRow, project.template.textElements[1].role) : '';
      if (!subtitleValue.trim() && text2PlaceholderRef.current) {
        nodes.push(text2PlaceholderRef.current);
      } else if (text2Ref.current) {
        nodes.push(text2Ref.current);
      }
    }
    transformerRef.current.nodes(nodes);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selectedElement, project, imageIsEmpty, selectedRow]);

  function onStagePointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const target = event.target;
    if (target === target.getStage() || target.name() === 'canvas-bg') {
      setSelectedElement(null);
    }
  }

  useEffect(() => {
    setImageUrlDraft(selectedRow?.imageUrl ?? '');
  }, [selectedRow?.id, selectedRow?.imageUrl]);

  function updateActiveSet(updater: (current: FlashcardSet) => FlashcardSet) {
    setSets((currentSets) =>
      currentSets.map((item) => {
        if (item.id !== activeSetId) {
          return item;
        }
        return normalizeSet({ ...updater(item), updatedAt: Date.now() });
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
      rows: current.rows.map((row) => (row.id === rowId ? { ...row, ...setImageFromDataUrl(dataUrl) } : row))
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

  function applyEmojiToRow(rowId: string, emoji: string) {
    const dataUrl = createEmojiImageDataUrl(emoji);
    updateRow(rowId, setImageFromDataUrl(dataUrl));
  }

  function onApplySelectedImageUrl() {
    if (!selectedRow) {
      return;
    }
    const trimmed = imageUrlDraft.trim();
    if (!trimmed) {
      return;
    }
    updateRow(selectedRow.id, setImageFromUrl(trimmed));
  }

  function onRemoveSelectedRowImage() {
    if (!selectedRow) {
      return;
    }
    updateRow(selectedRow.id, clearRowImage());
    setImageUrlDraft('');
  }

  function getSelectionInfo() {
    if (selectedElement === 'image') {
      return {
        x: project.template.image.x,
        y: toCanvasY(project.template.image.y, project.template.image.side),
        width: project.template.image.width,
        label: 'Image'
      };
    }
    const textElement = project.template.textElements.find((item) => item.id === selectedElement);
    if (!textElement) {
      return null;
    }
    return {
      x: textElement.x,
      y: toCanvasY(textElement.y, textElement.side),
      width: textElement.width,
      label: textElement.role === 'word' ? 'Word' : 'Subtitle'
    };
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
    let generated: Awaited<ReturnType<typeof generatePdfBytes>>;
    try {
      generated = await generatePdfBytes({
        project,
        tamilFontUrl,
        onProgress: setProgress
      });
    } catch {
      setPdfStatus('Failed to load Tamil font for PDF export.');
      setPdfProgress({ active: false, percent: 0, stage: '' });
      return;
    }

    setProgress(98, 'Starting download...');
    const pdfBuffer = new ArrayBuffer(generated.bytes.byteLength);
    new Uint8Array(pdfBuffer).set(generated.bytes);
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'flashcards.pdf';
    anchor.click();
    URL.revokeObjectURL(url);
    setPdfProgress({ active: false, percent: 100, stage: '' });

    setImageIssues(generated.imageIssues);
    if (Object.keys(generated.imageIssues).length) {
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
      <SetsDrawer
        setsMenuOpen={setsMenuOpen}
        newSetName={newSetName}
        sets={sets}
        activeSetId={project.id}
        onNewSetNameChange={setNewSetName}
        onCreateSet={createSet}
        onSelectSet={setActiveSetId}
        onDeleteSet={deleteSet}
        onClose={() => setSetsMenuOpen(false)}
      />

      <main>
        <section className="panel editor-panel">
          <h2>Master Card Layout</h2>
          <p>Drag and resize elements. Changes affect all generated cards.</p>

          <div className="editor-layout">
            <div>
              <div className="editor-controls">
                <label>
                  Card Background
                  <input
                    type="color"
                    value={project.template.backgroundColor}
                    onChange={(event) => patchTemplate({ backgroundColor: event.target.value })}
                  />
                </label>
                {(() => {
                  const selectedText =
                    selectedElement === 'text1'
                      ? project.template.textElements[0]
                      : selectedElement === 'text2'
                        ? project.template.textElements[1]
                        : project.template.textElements[0];
                  const textControlsDisabled = selectedElement !== 'text1' && selectedElement !== 'text2';
                  return (
                    <>
                      <label>
                        Font
                        <select
                          disabled={textControlsDisabled}
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
                          disabled={textControlsDisabled}
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
                          disabled={textControlsDisabled}
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
                      <label>
                        Text Color
                        <input
                          disabled={textControlsDisabled}
                          type="color"
                          value={selectedText.color}
                          onChange={(event) => patchTextElement(selectedText.id, { color: event.target.value })}
                        />
                      </label>
                      <label className="checkbox-row control-checkbox">
                        <input
                          type="checkbox"
                          checked={project.doubleSided}
                          onChange={(event) =>
                            updateActiveSet((current) => ({
                              ...current,
                              doubleSided: event.target.checked
                            }))
                          }
                        />
                        Double-sided cards
                      </label>
                    </>
                  );
                })()}
              </div>

              <Stage
                width={project.template.width}
                height={stageHeight}
                className="stage"
                onMouseDown={onStagePointerDown}
                onTouchStart={onStagePointerDown}
              >
                <Layer>
                  <Rect
                    name="canvas-bg"
                    x={0}
                    y={0}
                    width={project.template.width}
                    height={stageHeight}
                    fill="#f8fafc"
                    stroke="#d1d5db"
                    strokeWidth={1}
                  />
                  <Rect
                    x={0}
                    y={0}
                    width={project.template.width}
                    height={cardHeight}
                    fill={project.template.backgroundColor}
                    stroke="#94a3b8"
                    strokeWidth={1}
                    listening={false}
                  />
                  {project.doubleSided && (
                    <Rect
                      x={0}
                      y={cardHeight}
                      width={project.template.width}
                      height={cardHeight}
                      fill={project.template.backgroundColor}
                      stroke="#94a3b8"
                      strokeWidth={1}
                      listening={false}
                    />
                  )}

                  <KonvaImage
                    ref={imageRef}
                    image={previewImage}
                    x={project.template.image.x}
                    y={toCanvasY(project.template.image.y, project.template.image.side)}
                    width={project.template.image.width}
                    height={project.template.image.height}
                    draggable
                    onClick={() => setSelectedElement('image')}
                    onTap={() => setSelectedElement('image')}
                    onDragEnd={(event) =>
                      (() => {
                        const sideResult = fromCanvasY(event.target.y(), project.template.image.height);
                        patchTemplate({
                          image: {
                            ...project.template.image,
                            x: event.target.x(),
                            y: sideResult.y,
                            side: sideResult.side
                          }
                        });
                      })()
                    }
                    onTransformEnd={(event) => {
                      const node = event.target;
                      const scaleX = node.scaleX();
                      const scaleY = node.scaleY();
                      const nextWidth = Math.max(20, node.width() * scaleX);
                      const nextHeight = Math.max(20, node.height() * scaleY);
                      const sideResult = fromCanvasY(node.y(), nextHeight);
                      patchTemplate({
                        image: {
                          x: node.x(),
                          y: sideResult.y,
                          side: sideResult.side,
                          width: nextWidth,
                          height: nextHeight
                        }
                      });
                      node.scaleX(1);
                      node.scaleY(1);
                    }}
                    stroke={selectedElement === 'image' ? '#2563eb' : undefined}
                    strokeWidth={selectedElement === 'image' ? 2 : 0}
                  />
                  {imageIsEmpty && (
                    <Rect
                      ref={imagePlaceholderRef}
                      x={project.template.image.x}
                      y={toCanvasY(project.template.image.y, project.template.image.side)}
                      width={project.template.image.width}
                      height={project.template.image.height}
                      stroke={selectedElement === 'image' ? '#2563eb' : '#94a3b8'}
                      strokeWidth={1}
                      dash={[4, 4]}
                      fill="rgba(0,0,0,0)"
                      draggable
                      onClick={() => setSelectedElement('image')}
                      onTap={() => setSelectedElement('image')}
                      onDragEnd={(event) =>
                        (() => {
                          const sideResult = fromCanvasY(event.target.y(), project.template.image.height);
                          patchTemplate({
                            image: {
                              ...project.template.image,
                              x: event.target.x(),
                              y: sideResult.y,
                              side: sideResult.side
                            }
                          });
                        })()
                      }
                      onTransformEnd={(event) => {
                        const node = event.target;
                        const scaleX = node.scaleX();
                        const scaleY = node.scaleY();
                        const nextWidth = Math.max(20, node.width() * scaleX);
                        const nextHeight = Math.max(20, node.height() * scaleY);
                        const sideResult = fromCanvasY(node.y(), nextHeight);
                        patchTemplate({
                          image: {
                            x: node.x(),
                            y: sideResult.y,
                            side: sideResult.side,
                            width: nextWidth,
                            height: nextHeight
                          }
                        });
                        node.scaleX(1);
                        node.scaleY(1);
                      }}
                    />
                  )}

                  {project.template.textElements.map((textElement, index) => {
                    const textValue = selectedRow ? fitTextValue(selectedRow, textElement.role) : '';
                    const textIsEmpty = !textValue.trim();
                    return (
                      [
                        <Text
                          key={`${textElement.id}-text`}
                          ref={index === 0 ? text1Ref : text2Ref}
                          text={textValue}
                          x={textElement.x}
                          y={toCanvasY(textElement.y, textElement.side)}
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
                            (() => {
                              const sideResult = fromCanvasY(event.target.y(), textElement.height);
                              patchTextElement(textElement.id, {
                                x: event.target.x(),
                                y: sideResult.y,
                                side: sideResult.side
                              });
                            })()
                          }
                          onTransformEnd={(event) => {
                            const node = event.target;
                            const scaleX = node.scaleX();
                            const scaleY = node.scaleY();
                            const nextWidth = Math.max(40, node.width() * scaleX);
                            const nextHeight = Math.max(30, node.height() * scaleY);
                            const sideResult = fromCanvasY(node.y(), nextHeight);
                            patchTextElement(textElement.id, {
                              x: node.x(),
                              y: sideResult.y,
                              side: sideResult.side,
                              width: nextWidth,
                              height: nextHeight
                            });
                            node.scaleX(1);
                            node.scaleY(1);
                          }}
                          stroke={selectedElement === textElement.id ? '#2563eb' : '#9ca3af'}
                          strokeWidth={1}
                        />
                        ,
                        textIsEmpty && (
                          <Rect
                            ref={textElement.id === 'text1' ? text1PlaceholderRef : text2PlaceholderRef}
                            key={`${textElement.id}-empty`}
                            x={textElement.x}
                            y={toCanvasY(textElement.y, textElement.side)}
                            width={textElement.width}
                            height={textElement.height}
                            stroke={selectedElement === textElement.id ? '#2563eb' : '#94a3b8'}
                            strokeWidth={1}
                            dash={[4, 4]}
                            fill="rgba(0,0,0,0)"
                            draggable
                            onClick={() => setSelectedElement(textElement.id)}
                            onTap={() => setSelectedElement(textElement.id)}
                            onDragEnd={(event) => {
                              const sideResult = fromCanvasY(event.target.y(), textElement.height);
                              patchTextElement(textElement.id, {
                                x: event.target.x(),
                                y: sideResult.y,
                                side: sideResult.side
                              });
                            }}
                            onTransformEnd={(event) => {
                              const node = event.target;
                              const scaleX = node.scaleX();
                              const scaleY = node.scaleY();
                              const nextWidth = Math.max(40, node.width() * scaleX);
                              const nextHeight = Math.max(30, node.height() * scaleY);
                              const sideResult = fromCanvasY(node.y(), nextHeight);
                              patchTextElement(textElement.id, {
                                x: node.x(),
                                y: sideResult.y,
                                side: sideResult.side,
                                width: nextWidth,
                                height: nextHeight
                              });
                              node.scaleX(1);
                              node.scaleY(1);
                            }}
                          />
                        )
                      ]
                    );
                  })}

                  {(() => {
                    const selection = getSelectionInfo();
                    if (!selection) {
                      return null;
                    }
                    const labelWidth = Math.max(70, selection.label.length * 9 + 18);
                    return (
                      <>
                        <Rect
                          x={selection.x}
                          y={Math.max(4, selection.y - 24)}
                          width={labelWidth}
                          height={20}
                          fill="#2563eb"
                          cornerRadius={4}
                          listening={false}
                        />
                        <Text
                          x={selection.x + 8}
                          y={Math.max(7, selection.y - 21)}
                          text={selection.label}
                          fill="#ffffff"
                          fontSize={12}
                          fontStyle="bold"
                          listening={false}
                        />
                      </>
                    );
                  })()}

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

            <SelectedCardDetails
              selectedRow={selectedRow}
              selectedRowHasImage={selectedRowHasImage}
              imageUrlDraft={imageUrlDraft}
              selectedRowEmojiMatches={selectedRowEmojiMatches}
              onUpdateRow={updateRow}
              onImageUrlDraftChange={setImageUrlDraft}
              onApplySelectedImageUrl={onApplySelectedImageUrl}
              onSelectedRowImageDrop={(event) => void onSelectedRowImageDrop(event)}
              onSelectedRowImageUpload={(file) => void onSelectedRowImageUpload(file)}
              onApplyEmoji={applyEmojiToRow}
              onRemoveSelectedRowImage={onRemoveSelectedRowImage}
            />
          </div>

        </section>

        <WordListPanel
          csvInput={csvInput}
          rows={project.rows}
          validations={validations}
          imageIssues={imageIssues}
          selectedRowId={selectedRow?.id}
          onCsvInputChange={setCsvInput}
          onCsvImport={onCsvImport}
          onClearRows={() => replaceRows([])}
          onSelectRow={(rowId) => updateActiveSet((current) => ({ ...current, selectedRowId: rowId }))}
          onUpdateRow={updateRow}
        />

        <PdfOutputPanel
          preset={project.preset}
          showCutGuides={project.showCutGuides}
          pdfProgress={pdfProgress}
          pdfStatus={pdfStatus}
          onPresetChange={(preset) => updateActiveSet((current) => ({ ...current, preset }))}
          onShowCutGuidesChange={(showCutGuides) => updateActiveSet((current) => ({ ...current, showCutGuides }))}
          onGeneratePdf={() => void generatePdf()}
        />
      </main>
    </div>
  );
}
