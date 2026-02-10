import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { FONT_FAMILIES } from '../constants/project';
import type { CardTemplate, FlashcardRow, FlashcardSet, FontFamily, RowValidation, TextElement } from '../types';

interface CanvasEditorProps {
  project: FlashcardSet;
  selection: {
    selectedRow?: FlashcardRow;
    selectedRowIndex: number;
    currentValidation?: RowValidation;
    selectedElement: 'image' | 'text1' | 'text2' | null;
    previewImage?: HTMLImageElement;
    imageIsEmpty: boolean;
  };
  canvas: {
    cardHeight: number;
    stageHeight: number;
    toCanvasY: (y: number, side: 1 | 2) => number;
    fromCanvasY: (canvasY: number, elementHeight: number) => { side: 1 | 2; y: number };
  };
  actions: {
    onSelectElement: (element: 'image' | 'text1' | 'text2' | null) => void;
    onPatchTemplate: (patch: Partial<CardTemplate>) => void;
    onPatchTextElement: (id: 'text1' | 'text2', patch: Partial<TextElement>) => void;
    onUpdateRow: (rowId: string, patch: Partial<FlashcardRow>) => void;
    onToggleDoubleSided: (value: boolean) => void;
    onSelectPreviousRow: () => void;
    onSelectNextRow: () => void;
    canSelectPreviousRow: boolean;
    canSelectNextRow: boolean;
  };
  children?: ReactNode;
}

function fitTextValue(row: FlashcardRow, role: TextElement['role']): string {
  return role === 'word' ? row.word : row.subtitle;
}

function estimateWrappedLineCount(text: string, textElement: TextElement): number {
  const value = text || '';
  const paragraphs = value.split('\n');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return Math.max(1, paragraphs.length);
  }

  context.font = `${textElement.fontSize}px ${textElement.fontFamily}`;
  let lineCount = 0;

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lineCount += 1;
      continue;
    }

    let current = words[0];
    for (let i = 1; i < words.length; i += 1) {
      const candidate = `${current} ${words[i]}`;
      if (context.measureText(candidate).width <= textElement.width - 8) {
        current = candidate;
      } else {
        lineCount += 1;
        current = words[i];
      }
    }
    lineCount += 1;
  }

  return Math.max(1, lineCount);
}

export function CanvasEditor(props: CanvasEditorProps) {
  const { project, selection, canvas, actions, children } = props;
  const { selectedRow, selectedRowIndex, currentValidation, selectedElement, previewImage, imageIsEmpty } = selection;
  const { cardHeight, stageHeight, toCanvasY, fromCanvasY } = canvas;
  const {
    onSelectElement,
    onPatchTemplate,
    onPatchTextElement,
    onUpdateRow,
    onToggleDoubleSided,
    onSelectPreviousRow,
    onSelectNextRow,
    canSelectPreviousRow,
    canSelectNextRow
  } = actions;

  const imageRef = useRef<Konva.Image>(null);
  const imagePlaceholderRef = useRef<Konva.Rect>(null);
  const text1Ref = useRef<Konva.Text>(null);
  const text2Ref = useRef<Konva.Text>(null);
  const text1PlaceholderRef = useRef<Konva.Rect>(null);
  const text2PlaceholderRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const [editingTextId, setEditingTextId] = useState<'text1' | 'text2' | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const textEditorRef = useRef<HTMLTextAreaElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const [stageViewportWidth, setStageViewportWidth] = useState<number>(0);

  const stageScale = stageViewportWidth > 0 ? Math.min(1, stageViewportWidth / project.template.width) : 1;
  const scaledStageWidth = project.template.width * stageScale;
  const scaledStageHeight = stageHeight * stageScale;

  const editingTextElement = useMemo(
    () => project.template.textElements.find((item) => item.id === editingTextId),
    [editingTextId, project.template.textElements]
  );
  const editingTextareaPadding = useMemo(() => {
    if (!editingTextElement) {
      return { top: 4, bottom: 4 };
    }
    const lineHeightPx = editingTextElement.fontSize * editingTextElement.lineHeight;
    const lineCount = estimateWrappedLineCount(editingValue, editingTextElement);
    const contentHeight = lineHeightPx * lineCount;
    const verticalPad = Math.max(4, (editingTextElement.height - contentHeight) / 2);
    return {
      top: verticalPad,
      bottom: verticalPad
    };
  }, [editingTextElement, editingValue]);

  useEffect(() => {
    if (!selectedRow && editingTextId) {
      setEditingTextId(null);
      setEditingValue('');
    }
  }, [editingTextId, selectedRow]);

  useEffect(() => {
    if (!editingTextId || !textEditorRef.current) {
      return;
    }
    textEditorRef.current.focus();
    textEditorRef.current.select();
  }, [editingTextId]);

  useEffect(() => {
    const shell = stageShellRef.current;
    if (!shell) {
      return;
    }

    const syncWidth = () => {
      setStageViewportWidth(shell.clientWidth);
    };

    syncWidth();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', syncWidth);
      return () => window.removeEventListener('resize', syncWidth);
    }

    const observer = new ResizeObserver(() => syncWidth());
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!transformerRef.current) {
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
  }, [selectedElement, project, imageIsEmpty, selectedRow, editingTextId]);

  function getRowTextValue(role: TextElement['role']): string {
    if (!selectedRow) {
      return '';
    }
    return role === 'word' ? selectedRow.word : selectedRow.subtitle;
  }

  function startEditingText(textId: 'text1' | 'text2') {
    if (!selectedRow) {
      return;
    }
    const textElement = project.template.textElements.find((item) => item.id === textId);
    if (!textElement) {
      return;
    }
    setEditingTextId(textId);
    setEditingValue(getRowTextValue(textElement.role));
    onSelectElement(textId);
  }

  function commitEditingText() {
    if (!editingTextId || !selectedRow) {
      return;
    }
    const textElement = project.template.textElements.find((item) => item.id === editingTextId);
    if (!textElement) {
      setEditingTextId(null);
      setEditingValue('');
      return;
    }
    if (textElement.role === 'word') {
      onUpdateRow(selectedRow.id, { word: editingValue });
    } else {
      onUpdateRow(selectedRow.id, { subtitle: editingValue });
    }
    setEditingTextId(null);
    setEditingValue('');
  }

  function cancelEditingText() {
    setEditingTextId(null);
    setEditingValue('');
  }

  function onStagePointerDown(event: Konva.KonvaEventObject<MouseEvent | TouchEvent>) {
    const target = event.target;
    if (target === target.getStage() || target.name() === 'canvas-bg') {
      onSelectElement(null);
    }
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

  const selectedText =
    selectedElement === 'text1'
      ? project.template.textElements[0]
      : selectedElement === 'text2'
        ? project.template.textElements[1]
        : project.template.textElements[0];
  const textControlsDisabled = selectedElement !== 'text1' && selectedElement !== 'text2';

  return (
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
                onChange={(event) => onPatchTemplate({ backgroundColor: event.target.value })}
              />
            </label>
            <label>
              Font
              <select
                disabled={textControlsDisabled}
                value={selectedText.fontFamily}
                onChange={(event) => onPatchTextElement(selectedText.id, { fontFamily: event.target.value as FontFamily })}
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
                onChange={(event) => onPatchTextElement(selectedText.id, { fontSize: Number(event.target.value) || 10 })}
              />
            </label>
            <label>
              Align
              <select
                disabled={textControlsDisabled}
                value={selectedText.align}
                onChange={(event) => onPatchTextElement(selectedText.id, { align: event.target.value as TextElement['align'] })}
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
                onChange={(event) => onPatchTextElement(selectedText.id, { color: event.target.value })}
              />
            </label>
            <label className="checkbox-row control-checkbox">
              <input
                type="checkbox"
                checked={project.doubleSided}
                onChange={(event) => onToggleDoubleSided(event.target.checked)}
              />
              Double-sided cards
            </label>
          </div>

          <div className="stage-shell" ref={stageShellRef}>
            <div className="stage-wrap" style={{ width: scaledStageWidth, height: scaledStageHeight }}>
              <div className="stage-canvas" style={{ width: scaledStageWidth, height: scaledStageHeight }}>
              <Stage
                width={scaledStageWidth}
                height={scaledStageHeight}
                scaleX={stageScale}
                scaleY={stageScale}
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
                onClick={() => onSelectElement('image')}
                onTap={() => onSelectElement('image')}
                onDragEnd={(event) => {
                  const sideResult = fromCanvasY(event.target.y(), project.template.image.height);
                  onPatchTemplate({
                    image: {
                      ...project.template.image,
                      x: event.target.x(),
                      y: sideResult.y,
                      side: sideResult.side
                    }
                  });
                }}
                onTransformEnd={(event) => {
                  const node = event.target;
                  const scaleX = node.scaleX();
                  const scaleY = node.scaleY();
                  const nextWidth = Math.max(20, node.width() * scaleX);
                  const nextHeight = Math.max(20, node.height() * scaleY);
                  const sideResult = fromCanvasY(node.y(), nextHeight);
                  onPatchTemplate({
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
                  onClick={() => onSelectElement('image')}
                  onTap={() => onSelectElement('image')}
                  onDragEnd={(event) => {
                    const sideResult = fromCanvasY(event.target.y(), project.template.image.height);
                    onPatchTemplate({
                      image: {
                        ...project.template.image,
                        x: event.target.x(),
                        y: sideResult.y,
                        side: sideResult.side
                      }
                    });
                  }}
                  onTransformEnd={(event) => {
                    const node = event.target;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    const nextWidth = Math.max(20, node.width() * scaleX);
                    const nextHeight = Math.max(20, node.height() * scaleY);
                    const sideResult = fromCanvasY(node.y(), nextHeight);
                    onPatchTemplate({
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
                const isEditing = editingTextId === textElement.id;
                return [
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
                    visible={!isEditing}
                    draggable={!isEditing}
                    onClick={() => onSelectElement(textElement.id)}
                    onTap={() => onSelectElement(textElement.id)}
                    onDblClick={() => startEditingText(textElement.id)}
                    onDblTap={() => startEditingText(textElement.id)}
                    onDragEnd={(event) => {
                      const sideResult = fromCanvasY(event.target.y(), textElement.height);
                      onPatchTextElement(textElement.id, {
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
                      onPatchTextElement(textElement.id, {
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
                  />,
                  textIsEmpty && !isEditing && (
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
                      onClick={() => onSelectElement(textElement.id)}
                      onTap={() => onSelectElement(textElement.id)}
                      onDblClick={() => startEditingText(textElement.id)}
                      onDblTap={() => startEditingText(textElement.id)}
                      onDragEnd={(event) => {
                        const sideResult = fromCanvasY(event.target.y(), textElement.height);
                        onPatchTextElement(textElement.id, {
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
                        onPatchTextElement(textElement.id, {
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
                ];
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
              {editingTextElement && (
                <textarea
                  ref={textEditorRef}
                  className="canvas-text-editor"
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  onBlur={commitEditingText}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelEditingText();
                      return;
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      commitEditingText();
                    }
                  }}
                  style={{
                    left: editingTextElement.x * stageScale,
                    top: toCanvasY(editingTextElement.y, editingTextElement.side) * stageScale,
                    width: editingTextElement.width * stageScale,
                    height: editingTextElement.height * stageScale,
                    paddingTop: editingTextareaPadding.top * stageScale,
                    paddingBottom: editingTextareaPadding.bottom * stageScale,
                    fontSize: editingTextElement.fontSize * stageScale,
                    fontFamily: editingTextElement.fontFamily,
                    color: editingTextElement.color,
                    textAlign: editingTextElement.align,
                    lineHeight: String(editingTextElement.lineHeight)
                  }}
                />
              )}
              </div>
            </div>
          </div>
          {children}

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
              <button onClick={onSelectPreviousRow} disabled={!canSelectPreviousRow}>
                Previous
              </button>
              <button onClick={onSelectNextRow} disabled={!canSelectNextRow}>
                Next
              </button>
            </div>
            {currentValidation && (currentValidation.wordOverflow || currentValidation.subtitleOverflow) && (
              <p className="warn">This row has text overflow in one or more text boxes.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
