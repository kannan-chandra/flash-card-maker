import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { FONT_FAMILIES } from '../constants/project';
import { FloatingInspectorPanel } from './FloatingInspectorPanel';
import type { CardTemplate, FlashcardRow, FlashcardSet, FontFamily, TextElement } from '../types';

interface CanvasEditorProps {
  project: FlashcardSet;
  selection: {
    selectedRow?: FlashcardRow;
    selectedElement: 'image' | 'text1' | 'text2' | null;
    previewImage?: HTMLImageElement;
    imageIsEmpty: boolean;
    imageIsLoading: boolean;
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
    onCanvasImageDrop: (file: File) => void;
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

function getContainSize(containerWidth: number, containerHeight: number, sourceWidth: number, sourceHeight: number) {
  if (containerWidth <= 0 || containerHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    return {
      width: containerWidth,
      height: containerHeight,
      offsetX: 0,
      offsetY: 0
    };
  }
  const scale = Math.min(containerWidth / sourceWidth, containerHeight / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  return {
    width,
    height,
    offsetX: (containerWidth - width) / 2,
    offsetY: (containerHeight - height) / 2
  };
}

export function CanvasEditor(props: CanvasEditorProps) {
  const singleColumnBreakpoint = 1180;
  const { project, selection, canvas, actions, children } = props;
  const { selectedRow, selectedElement, previewImage, imageIsEmpty, imageIsLoading } = selection;
  const { cardHeight } = canvas;
  const { onSelectElement, onPatchTemplate, onPatchTextElement, onUpdateRow, onToggleDoubleSided, onCanvasImageDrop } = actions;

  const imageRef = useRef<Konva.Image>(null);
  const imageControlRef = useRef<Konva.Rect>(null);
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
  const [stageViewportHeight, setStageViewportHeight] = useState<number>(0);
  const [isNarrowLayout, setIsNarrowLayout] = useState<boolean>(false);
  const [stageShellLeft, setStageShellLeft] = useState<number>(0);
  const [stageShellTop, setStageShellTop] = useState<number>(0);
  const [imagePanelHeight, setImagePanelHeight] = useState<number>(220);
  const [textPanelHeight, setTextPanelHeight] = useState<number>(170);
  const [isImageDropTargetActive, setIsImageDropTargetActive] = useState(false);
  const dragEnterDepthRef = useRef(0);
  const selectionBadgeRectRef = useRef<Konva.Rect>(null);
  const selectionBadgeTextRef = useRef<Konva.Text>(null);

  const isHorizontalSplit = project.doubleSided && isNarrowLayout;
  const sideWidth = project.template.width;
  const sideHeight = cardHeight;
  const stageContentWidth = project.doubleSided && isHorizontalSplit ? sideWidth * 2 : sideWidth;
  const stageContentHeight = project.doubleSided ? (isHorizontalSplit ? sideHeight : sideHeight * 2) : sideHeight;
  const referenceWidth = isNarrowLayout ? sideWidth * 2 : sideWidth;
  const referenceHeight = isNarrowLayout ? sideHeight : sideHeight * 2;

  function getSideOffset(side: 1 | 2) {
    if (!project.doubleSided) {
      return { x: 0, y: 0 };
    }
    if (isHorizontalSplit) {
      return { x: side === 2 ? sideWidth : 0, y: 0 };
    }
    return { x: 0, y: side === 2 ? sideHeight : 0 };
  }

  function toCanvasPosition(x: number, y: number, side: 1 | 2) {
    const offset = getSideOffset(side);
    return {
      x: x + offset.x,
      y: y + offset.y
    };
  }

  function fromCanvasPosition(canvasX: number, canvasY: number, elementWidth: number, elementHeight: number) {
    if (!project.doubleSided) {
      return { side: 1 as const, x: canvasX, y: canvasY };
    }

    if (isHorizontalSplit) {
      const midpointX = canvasX + elementWidth / 2;
      const side: 1 | 2 = midpointX >= sideWidth ? 2 : 1;
      const offsetX = side === 2 ? sideWidth : 0;
      return {
        side,
        x: canvasX - offsetX,
        y: canvasY
      };
    }

    const midpointY = canvasY + elementHeight / 2;
    const side: 1 | 2 = midpointY >= sideHeight ? 2 : 1;
    const offsetY = side === 2 ? sideHeight : 0;
    return {
      side,
      x: canvasX,
      y: canvasY - offsetY
    };
  }

  const stageScale = useMemo(() => {
    // Keep apparent card size consistent across single/double mode by always
    // scaling against a double-sided reference footprint for the current layout.
    const widthScale = stageViewportWidth > 0 ? stageViewportWidth / referenceWidth : 1;
    const heightScale = stageViewportHeight > 0 ? stageViewportHeight / referenceHeight : 1;
    return Math.max(0.01, Math.min(widthScale, heightScale));
  }, [referenceHeight, referenceWidth, stageViewportHeight, stageViewportWidth]);
  const scaledStageWidth = stageContentWidth * stageScale;
  const scaledStageHeight = stageContentHeight * stageScale;

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
  const imageContainSize = useMemo(
    () =>
      getContainSize(
        project.template.image.width,
        project.template.image.height,
        previewImage?.width ?? project.template.image.width,
        previewImage?.height ?? project.template.image.height
      ),
    [project.template.image.width, project.template.image.height, previewImage]
  );

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
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      setIsNarrowLayout(viewportWidth <= singleColumnBreakpoint);
      const rect = shell.getBoundingClientRect();
      setStageShellLeft(rect.left);
      setStageShellTop(rect.top);
      const rootStyle = window.getComputedStyle(document.documentElement);
      const gutterPx = Number.parseFloat(rootStyle.getPropertyValue('--app-gutter')) || 20;
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const availableHeight = Math.max(0, viewportHeight - rect.top - gutterPx);
      setStageViewportHeight(availableHeight);
    };

    syncWidth();
    window.addEventListener('resize', syncWidth);

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', syncWidth);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => syncWidth());
      observer.observe(shell);
    }

    return () => {
      window.removeEventListener('resize', syncWidth);
      viewport?.removeEventListener('resize', syncWidth);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!transformerRef.current) {
      return;
    }

    const nodes: Konva.Node[] = [];
    if (selectedElement === 'image' && imageControlRef.current) nodes.push(imageControlRef.current);
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

  useEffect(() => {
    const selection = getSelectionInfo();
    if (!selection) {
      selectionBadgeRectRef.current?.hide();
      selectionBadgeTextRef.current?.hide();
      selectionBadgeRectRef.current?.getLayer()?.batchDraw();
      return;
    }
    updateSelectionBadge(selection.x, selection.y, selection.label);
  }, [selectedElement, project.template.image, project.template.textElements]);

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

  function onCanvasDragOver(event: ReactDragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes('Files')) {
      event.preventDefault();
    }
  }

  function onCanvasDragEnter(event: ReactDragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    dragEnterDepthRef.current += 1;
    setIsImageDropTargetActive(true);
  }

  function onCanvasDragLeave(event: ReactDragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    dragEnterDepthRef.current = Math.max(0, dragEnterDepthRef.current - 1);
    if (dragEnterDepthRef.current === 0) {
      setIsImageDropTargetActive(false);
    }
  }

  function onCanvasDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    dragEnterDepthRef.current = 0;
    setIsImageDropTargetActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onCanvasImageDrop(file);
    }
  }

  function syncDraggedImagePreview(dragX: number, dragY: number) {
    if (!imageRef.current) {
      return;
    }
    imageRef.current.position({
      x: dragX + imageContainSize.offsetX,
      y: dragY + imageContainSize.offsetY
    });
    imageRef.current.getLayer()?.batchDraw();
  }

  function updateSelectionBadge(x: number, y: number, label: string) {
    const rectNode = selectionBadgeRectRef.current;
    const textNode = selectionBadgeTextRef.current;
    if (!rectNode || !textNode) {
      return;
    }
    const labelWidth = Math.max(70, label.length * 9 + 18);
    rectNode.position({ x, y: Math.max(4, y - 24) });
    rectNode.size({ width: labelWidth, height: 20 });
    rectNode.show();

    textNode.position({ x: x + 8, y: Math.max(7, y - 21) });
    textNode.text(label);
    textNode.show();

    rectNode.getLayer()?.batchDraw();
  }

  function getSelectionInfo() {
    if (selectedElement === 'image') {
      const imagePos = toCanvasPosition(project.template.image.x, project.template.image.y, project.template.image.side);
      return {
        x: imagePos.x,
        y: imagePos.y,
        width: project.template.image.width,
        label: 'Image'
      };
    }
    const textElement = project.template.textElements.find((item) => item.id === selectedElement);
    if (!textElement) {
      return null;
    }
    const textPos = toCanvasPosition(textElement.x, textElement.y, textElement.side);
    return {
      x: textPos.x,
      y: textPos.y,
      width: textElement.width,
      label: textElement.role === 'word' ? 'Word' : 'Subtitle'
    };
  }

  function wrapWithSideClip(side: 1 | 2, key: string, node: ReactNode) {
    const offset = getSideOffset(side);
    return (
      <Group
        key={key}
        clipX={offset.x}
        clipY={offset.y}
        clipWidth={sideWidth}
        clipHeight={sideHeight}
      >
        {node}
      </Group>
    );
  }

  const selectedText =
    selectedElement === 'text1'
      ? project.template.textElements[0]
      : selectedElement === 'text2'
        ? project.template.textElements[1]
        : null;
  const showImagePanel = selectedElement === 'image' && Boolean(children);
  const showTextPanel = Boolean(selectedText);
  const imagePanelWidth = 340;
  const textPanelWidth = 340;
  const stageWrapLeft = stageShellLeft + Math.max((stageViewportWidth - scaledStageWidth) / 2, 0);
  const stageWrapTop = stageShellTop;
  function getPanelPosition(args: {
    anchorX: number;
    anchorTop: number;
    anchorBottom: number;
    panelWidth: number;
    panelHeight: number;
  }) {
    const gutter = 12;
    const anchorGap = 4;
    const desiredLeftAbs = stageWrapLeft + args.anchorX;
    const maxLeftAbs = Math.max(gutter, window.innerWidth - args.panelWidth - gutter);
    const clampedLeftAbs = Math.min(Math.max(desiredLeftAbs, gutter), maxLeftAbs);
    const belowTopAbs = stageWrapTop + args.anchorBottom + anchorGap;
    const aboveTopAbs = stageWrapTop + args.anchorTop - args.panelHeight - anchorGap;
    const fitsBelow = belowTopAbs + args.panelHeight <= window.innerHeight - gutter;
    const topAbs = fitsBelow ? belowTopAbs : Math.max(gutter, aboveTopAbs);
    return {
      left: clampedLeftAbs - stageWrapLeft,
      top: topAbs - stageWrapTop
    };
  }
  const imageCanvasPos = toCanvasPosition(project.template.image.x, project.template.image.y, project.template.image.side);
  const imageAnchorTop = imageCanvasPos.y * stageScale;
  const imageAnchorBottom = imageAnchorTop + project.template.image.height * stageScale;
  const imagePanelPos = getPanelPosition({
    anchorX: imageCanvasPos.x * stageScale,
    anchorTop: imageAnchorTop,
    anchorBottom: imageAnchorBottom,
    panelWidth: imagePanelWidth,
    panelHeight: imagePanelHeight
  });
  const selectedTextPos = selectedText ? toCanvasPosition(selectedText.x, selectedText.y, selectedText.side) : null;
  const textAnchorTop = selectedTextPos ? selectedTextPos.y * stageScale : 0;
  const textAnchorBottom = selectedText ? textAnchorTop + selectedText.height * stageScale : 0;
  const textPanelPos = getPanelPosition({
    anchorX: selectedTextPos ? selectedTextPos.x * stageScale : 0,
    anchorTop: textAnchorTop,
    anchorBottom: textAnchorBottom,
    panelWidth: textPanelWidth,
    panelHeight: textPanelHeight
  });

  return (
    <section className="panel editor-panel">
      <div className="editor-layout">
        <div>
          <div className="stage-toolbar" style={{ width: scaledStageWidth }}>
            <div className="editor-controls">
              <label>
                Card Background
                <input
                  type="color"
                  value={project.template.backgroundColor}
                  onChange={(event) => onPatchTemplate({ backgroundColor: event.target.value })}
                />
              </label>
              <div className="double-sided-switch" role="group" aria-label="Card layout mode">
                <button
                  type="button"
                  className={`double-sided-option ${project.doubleSided ? '' : 'is-active'}`}
                  aria-pressed={!project.doubleSided}
                  onClick={() => onToggleDoubleSided(false)}
                >
                  Single-sided
                </button>
                <button
                  type="button"
                  className={`double-sided-option ${project.doubleSided ? 'is-active' : ''}`}
                  aria-pressed={project.doubleSided}
                  onClick={() => onToggleDoubleSided(true)}
                >
                  Double-sided
                </button>
              </div>
            </div>
          </div>

          <div className="stage-shell" ref={stageShellRef}>
            <div className="stage-wrap" style={{ width: scaledStageWidth, height: scaledStageHeight }}>
              <div
                className="stage-canvas"
                style={{ width: scaledStageWidth, height: scaledStageHeight }}
                onDragEnter={onCanvasDragEnter}
                onDragOver={onCanvasDragOver}
                onDragLeave={onCanvasDragLeave}
                onDrop={onCanvasDrop}
              >
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
                x={0.5}
                y={0.5}
                width={Math.max(stageContentWidth - 1, 0)}
                height={Math.max(stageContentHeight - 1, 0)}
                fill="#f8fafc"
                stroke="#d1d5db"
                strokeWidth={1}
              />
              <Rect
                x={0.5}
                y={0.5}
                width={Math.max(sideWidth - 1, 0)}
                height={Math.max(sideHeight - 1, 0)}
                fill={project.template.backgroundColor}
                stroke="#94a3b8"
                strokeWidth={1}
                listening={false}
              />
              {project.doubleSided && (
                <Rect
                  x={isHorizontalSplit ? sideWidth + 0.5 : 0.5}
                  y={isHorizontalSplit ? 0.5 : sideHeight + 0.5}
                  width={Math.max(sideWidth - 1, 0)}
                  height={Math.max(sideHeight - 1, 0)}
                  fill={project.template.backgroundColor}
                  stroke="#94a3b8"
                  strokeWidth={1}
                  listening={false}
                />
              )}

              {wrapWithSideClip(
                project.template.image.side,
                'image-clip',
                <>
                  {!imageIsEmpty && (
                    <KonvaImage
                      ref={imageRef}
                      image={previewImage}
                      x={imageCanvasPos.x + imageContainSize.offsetX}
                      y={imageCanvasPos.y + imageContainSize.offsetY}
                      width={imageContainSize.width}
                      height={imageContainSize.height}
                      listening={false}
                    />
                  )}
                  <Rect
                    ref={imageControlRef}
                    x={imageCanvasPos.x}
                    y={imageCanvasPos.y}
                    width={project.template.image.width}
                    height={project.template.image.height}
                    stroke={selectedElement === 'image' ? '#2563eb' : imageIsEmpty ? '#94a3b8' : undefined}
                    strokeWidth={selectedElement === 'image' ? 2 : imageIsEmpty ? 1 : 0}
                    dash={imageIsEmpty ? [4, 4] : undefined}
                    fill="rgba(0,0,0,0)"
                    draggable
                    onClick={() => onSelectElement('image')}
                    onTap={() => onSelectElement('image')}
                    onDragMove={(event) => {
                      syncDraggedImagePreview(event.target.x(), event.target.y());
                      updateSelectionBadge(event.target.x(), event.target.y(), 'Image');
                      const sideResult = fromCanvasPosition(
                        event.target.x(),
                        event.target.y(),
                        project.template.image.width,
                        project.template.image.height
                      );
                      if (sideResult.side !== project.template.image.side) {
                        onPatchTemplate({
                          image: {
                            ...project.template.image,
                            x: sideResult.x,
                            y: sideResult.y,
                            side: sideResult.side
                          }
                        });
                      }
                    }}
                    onDragEnd={(event) => {
                      syncDraggedImagePreview(event.target.x(), event.target.y());
                      const sideResult = fromCanvasPosition(
                        event.target.x(),
                        event.target.y(),
                        project.template.image.width,
                        project.template.image.height
                      );
                      onPatchTemplate({
                        image: {
                          ...project.template.image,
                          x: sideResult.x,
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
                      const sideResult = fromCanvasPosition(node.x(), node.y(), nextWidth, nextHeight);
                      onPatchTemplate({
                        image: {
                          x: sideResult.x,
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
                </>
              )}

              {project.template.textElements.map((textElement, index) => {
                const textValue = selectedRow ? fitTextValue(selectedRow, textElement.role) : '';
                const textIsEmpty = !textValue.trim();
                const isEditing = editingTextId === textElement.id;
                const textCanvasPos = toCanvasPosition(textElement.x, textElement.y, textElement.side);
                return [
                  wrapWithSideClip(
                    textElement.side,
                    `${textElement.id}-text-clip`,
                    <Text
                      key={`${textElement.id}-text`}
                      ref={index === 0 ? text1Ref : text2Ref}
                      text={textValue}
                      x={textCanvasPos.x}
                      y={textCanvasPos.y}
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
                      onDragMove={(event) => {
                        updateSelectionBadge(event.target.x(), event.target.y(), textElement.role === 'word' ? 'Word' : 'Subtitle');
                        const sideResult = fromCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                        if (sideResult.side !== textElement.side) {
                          onPatchTextElement(textElement.id, {
                            x: sideResult.x,
                            y: sideResult.y,
                            side: sideResult.side
                          });
                        }
                      }}
                      onDragEnd={(event) => {
                        const sideResult = fromCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                        onPatchTextElement(textElement.id, {
                          x: sideResult.x,
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
                        const sideResult = fromCanvasPosition(node.x(), node.y(), nextWidth, nextHeight);
                        onPatchTextElement(textElement.id, {
                          x: sideResult.x,
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
                  ),
                  textIsEmpty && !isEditing && (
                    wrapWithSideClip(
                      textElement.side,
                      `${textElement.id}-empty-clip`,
                      <Rect
                        ref={textElement.id === 'text1' ? text1PlaceholderRef : text2PlaceholderRef}
                        key={`${textElement.id}-empty`}
                        x={textCanvasPos.x}
                        y={textCanvasPos.y}
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
                        onDragMove={(event) => {
                          updateSelectionBadge(event.target.x(), event.target.y(), textElement.role === 'word' ? 'Word' : 'Subtitle');
                          const sideResult = fromCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                          if (sideResult.side !== textElement.side) {
                            onPatchTextElement(textElement.id, {
                              x: sideResult.x,
                              y: sideResult.y,
                              side: sideResult.side
                            });
                          }
                        }}
                        onDragEnd={(event) => {
                          const sideResult = fromCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                          onPatchTextElement(textElement.id, {
                            x: sideResult.x,
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
                          const sideResult = fromCanvasPosition(node.x(), node.y(), nextWidth, nextHeight);
                          onPatchTextElement(textElement.id, {
                            x: sideResult.x,
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
                  )
                ];
              })}

              <Rect ref={selectionBadgeRectRef} fill="#2563eb" cornerRadius={4} listening={false} visible={false} />
              <Text ref={selectionBadgeTextRef} fill="#ffffff" fontSize={12} fontStyle="bold" listening={false} visible={false} />

              <Transformer ref={transformerRef} rotateEnabled={false} flipEnabled={false} keepRatio={false} />
                </Layer>
              </Stage>
              {editingTextElement && (
                (() => {
                  const editingPos = toCanvasPosition(editingTextElement.x, editingTextElement.y, editingTextElement.side);
                  const editOffset = getSideOffset(editingTextElement.side);
                  const clipTop = editOffset.y * stageScale;
                  const clipLeft = editOffset.x * stageScale;
                  const clipBottom = scaledStageHeight - (editOffset.y + sideHeight) * stageScale;
                  const clipRight = scaledStageWidth - (editOffset.x + sideWidth) * stageScale;
                  return (
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
                    clipPath: `inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px)`,
                    left: editingPos.x * stageScale,
                    top: editingPos.y * stageScale,
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
                  );
                })()
              )}
              {isImageDropTargetActive && (
                <div
                  className="canvas-drop-overlay"
                  style={{
                    left: imageCanvasPos.x * stageScale,
                    top: imageCanvasPos.y * stageScale,
                    width: project.template.image.width * stageScale,
                    height: project.template.image.height * stageScale
                  }}
                >
                  <div className="canvas-drop-overlay-icon" aria-hidden>
                    <span className="icon-frame" />
                    <span className="icon-plus-v" />
                    <span className="icon-plus-h" />
                  </div>
                  <p>Drag and drop image here</p>
                </div>
              )}
              {imageIsLoading && !imageIsEmpty && (
                <div
                  className="canvas-image-loading"
                  style={{
                    left: imageCanvasPos.x * stageScale,
                    top: imageCanvasPos.y * stageScale,
                    width: project.template.image.width * stageScale,
                    height: project.template.image.height * stageScale
                  }}
                >
                  <div className="spinner" aria-label="Loading image" />
                </div>
              )}
              </div>
              {showImagePanel && (
                <FloatingInspectorPanel
                  className="floating-image-panel"
                  left={imagePanelPos.left}
                  top={imagePanelPos.top}
                  width={imagePanelWidth}
                  onHeightChange={setImagePanelHeight}
                >
                  {children}
                </FloatingInspectorPanel>
              )}
              {showTextPanel && selectedText && (
                <FloatingInspectorPanel
                  className="floating-text-panel"
                  left={textPanelPos.left}
                  top={textPanelPos.top}
                  width={textPanelWidth}
                  onHeightChange={setTextPanelHeight}
                >
                  <div className="text-control-panel">
                    <label>
                      Font
                      <select
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
                        type="color"
                        value={selectedText.color}
                        onChange={(event) => onPatchTextElement(selectedText.id, { color: event.target.value })}
                      />
                    </label>
                  </div>
                </FloatingInspectorPanel>
              )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
