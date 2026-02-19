import { useEffect, useMemo, useRef, useState, type DragEvent as ReactDragEvent, type ReactNode } from 'react';
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import type Konva from 'konva';
import { FONT_FAMILIES } from '../constants/project';
import { useCanvasLayout } from '../hooks/useCanvasLayout';
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
  cardHeight: number;
  actions: {
    onSelectElement: (element: 'image' | 'text1' | 'text2' | null) => void;
    onPatchTemplate: (patch: Partial<CardTemplate>) => void;
    onPatchTextElement: (id: 'text1' | 'text2', patch: Partial<TextElement>) => void;
    onUpdateRow: (rowId: string, patch: Partial<FlashcardRow>) => void;
    onToggleDoubleSided: (value: boolean) => void;
    onCanvasImageDrop: (file: File) => void;
    onMoveSelectedRowUp: () => void;
    onMoveSelectedRowDown: () => void;
    canMoveSelectedRowUp: boolean;
    canMoveSelectedRowDown: boolean;
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
  const { project, selection, cardHeight, actions, children } = props;
  const { selectedRow, selectedElement, previewImage, imageIsEmpty, imageIsLoading } = selection;
  const {
    onSelectElement,
    onPatchTemplate,
    onPatchTextElement,
    onUpdateRow,
    onToggleDoubleSided,
    onCanvasImageDrop,
    onMoveSelectedRowUp,
    onMoveSelectedRowDown,
    canMoveSelectedRowUp,
    canMoveSelectedRowDown
  } = actions;

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
  const editorPanelRef = useRef<HTMLElement>(null);
  const stageToolbarRef = useRef<HTMLDivElement>(null);
  const stageShellRef = useRef<HTMLDivElement>(null);
  const [imagePanelHeight, setImagePanelHeight] = useState<number>(220);
  const [textPanelHeight, setTextPanelHeight] = useState<number>(170);
  const [isImageDropTargetActive, setIsImageDropTargetActive] = useState(false);
  const dragEnterDepthRef = useRef(0);
  const selectionBadgeRectRef = useRef<Konva.Rect>(null);
  const selectionBadgeTextRef = useRef<Konva.Text>(null);

  const sideWidth = project.template.width;
  const sideHeight = cardHeight;
  const canvasLayout = useCanvasLayout({
    sideWidth,
    sideHeight,
    doubleSided: project.doubleSided,
    canShowMobileNav: canMoveSelectedRowUp || canMoveSelectedRowDown,
    stageShellRef,
    editorPanelRef
  });
  const { isCompactLayout, doubleSidedUsesHorizontalSplit, isHorizontalSplit, useCompactToggleLabels } = canvasLayout.layout;
  const { stageContentWidth, stageContentHeight, referenceWidth, referenceHeight } = canvasLayout.footprint;
  const { stageScale, scaledStageWidth, scaledStageHeight, widthScale, heightScale, renderedHeightScale } = canvasLayout.scale;
  const { isNarrowLayout } = canvasLayout.layout;
  const { stageViewportWidth, stageViewportHeight, shellClientHeight, allocatedShellHeight, viewportLimitedHeight, stageShellRectTop } =
    canvasLayout.measured;
  const { width: viewportWidth, height: browserViewportHeight } = canvasLayout.viewport;
  const { stageWrapShiftX, stageWrapLeft, stageWrapTop, showMobileNav } = canvasLayout.placement;

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

  function clampCanvasPosition(canvasX: number, canvasY: number, elementWidth: number, elementHeight: number) {
    const minX = -elementWidth / 2;
    const maxX = stageContentWidth - elementWidth / 2;
    const minY = -elementHeight / 2;
    const maxY = stageContentHeight - elementHeight / 2;
    return {
      x: Math.min(Math.max(canvasX, minX), maxX),
      y: Math.min(Math.max(canvasY, minY), maxY)
    };
  }

  function getClampedSidePosition(side: 1 | 2, x: number, y: number, width: number, height: number) {
    const canvasPos = toCanvasPosition(x, y, side);
    const clampedCanvasPos = clampCanvasPosition(canvasPos.x, canvasPos.y, width, height);
    return fromCanvasPosition(clampedCanvasPos.x, clampedCanvasPos.y, width, height);
  }
  const canvasDebugEnabled =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).get('debugCanvas') === '1' || window.localStorage.getItem('debugCanvas') === '1');

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
    if (!selectedElement) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest('.floating-inspector-panel')) {
        return;
      }
      onSelectElement(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onSelectElement, selectedElement]);

  useEffect(() => {
    if (!canvasDebugEnabled) {
      return;
    }
    if (stageViewportWidth <= 0 || stageViewportHeight <= 0) {
      return;
    }
    const snapshot = {
      timestamp: new Date().toISOString(),
      breakpoint: {
        singleColumnBreakpoint: canvasLayout.breakpoints.singleColumn,
        compactSplitBreakpoint: canvasLayout.breakpoints.compactSplit
      },
      viewport: {
        width: viewportWidth,
        height: browserViewportHeight
      },
      layout: {
        isNarrowLayout,
        isCompactLayout,
        doubleSided: project.doubleSided,
        doubleSidedUsesHorizontalSplit,
        isHorizontalSplit
      },
      measured: {
        stageViewportWidth,
        stageViewportHeight,
        shellClientHeight,
        allocatedShellHeight,
        viewportLimitedHeight,
        stageShellRectTop
      },
      footprint: {
        sideWidth,
        sideHeight,
        stageContentWidth,
        stageContentHeight,
        referenceWidth,
        referenceHeight
      },
      scale: {
        widthScale,
        heightScale,
        renderedHeightScale,
        chosen: stageScale,
        scaledStageWidth,
        scaledStageHeight
      }
    };
    const debugWindow = window as Window & {
      __canvasDebugLog?: unknown[];
      __getCanvasDebugLogText?: () => string;
      __clearCanvasDebugLog?: () => void;
      __copyCanvasDebugLog?: () => Promise<void>;
    };
    const current = debugWindow.__canvasDebugLog ?? [];
    const next = [...current, snapshot];
    debugWindow.__canvasDebugLog = next.slice(-400);
    debugWindow.__getCanvasDebugLogText = () => JSON.stringify(debugWindow.__canvasDebugLog ?? [], null, 2);
    debugWindow.__clearCanvasDebugLog = () => {
      debugWindow.__canvasDebugLog = [];
    };
    debugWindow.__copyCanvasDebugLog = async () => {
      const text = JSON.stringify(debugWindow.__canvasDebugLog ?? [], null, 2);
      await navigator.clipboard.writeText(text);
    };
    console.log('CANVAS_DEBUG', snapshot);
  }, [
    canvasLayout.breakpoints.compactSplit,
    canvasLayout.breakpoints.singleColumn,
    browserViewportHeight,
    canvasDebugEnabled,
    doubleSidedUsesHorizontalSplit,
    heightScale,
    isCompactLayout,
    isHorizontalSplit,
    isNarrowLayout,
    project.doubleSided,
    referenceHeight,
    referenceWidth,
    renderedHeightScale,
    scaledStageHeight,
    scaledStageWidth,
    allocatedShellHeight,
    shellClientHeight,
    sideHeight,
    sideWidth,
    stageContentHeight,
    stageContentWidth,
    stageScale,
    stageShellRectTop,
    stageViewportHeight,
    stageViewportWidth,
    viewportLimitedHeight,
    viewportWidth,
    widthScale
  ]);

  useEffect(() => {
    const clampedImage = getClampedSidePosition(
      project.template.image.side,
      project.template.image.x,
      project.template.image.y,
      project.template.image.width,
      project.template.image.height
    );
    if (
      clampedImage.side !== project.template.image.side ||
      clampedImage.x !== project.template.image.x ||
      clampedImage.y !== project.template.image.y
    ) {
      onPatchTemplate({
        image: {
          ...project.template.image,
          x: clampedImage.x,
          y: clampedImage.y,
          side: clampedImage.side
        }
      });
    }

    for (const textElement of project.template.textElements) {
      const clampedText = getClampedSidePosition(textElement.side, textElement.x, textElement.y, textElement.width, textElement.height);
      if (clampedText.side === textElement.side && clampedText.x === textElement.x && clampedText.y === textElement.y) {
        continue;
      }
      onPatchTextElement(textElement.id, {
        x: clampedText.x,
        y: clampedText.y,
        side: clampedText.side
      });
    }
  }, [
    getClampedSidePosition,
    onPatchTemplate,
    onPatchTextElement,
    project.template.image,
    project.template.textElements
  ]);

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
  const imageCanvasPos = toCanvasPosition(project.template.image.x, project.template.image.y, project.template.image.side);
  const imageAnchorTop = imageCanvasPos.y * stageScale;
  const imageAnchorBottom = imageAnchorTop + project.template.image.height * stageScale;
  const imagePanelPos = canvasLayout.getPanelPosition({
    anchorX: imageCanvasPos.x * stageScale,
    anchorTop: imageAnchorTop,
    anchorBottom: imageAnchorBottom,
    panelWidth: imagePanelWidth,
    panelHeight: imagePanelHeight
  });
  const selectedTextPos = selectedText ? toCanvasPosition(selectedText.x, selectedText.y, selectedText.side) : null;
  const textAnchorTop = selectedTextPos ? selectedTextPos.y * stageScale : 0;
  const textAnchorBottom = selectedText ? textAnchorTop + selectedText.height * stageScale : 0;
  const textPanelPos = canvasLayout.getPanelPosition({
    anchorX: selectedTextPos ? selectedTextPos.x * stageScale : 0,
    anchorTop: textAnchorTop,
    anchorBottom: textAnchorBottom,
    panelWidth: textPanelWidth,
    panelHeight: textPanelHeight
  });

  return (
    <section ref={editorPanelRef} className="panel editor-panel">
      <div className="editor-layout">
        <div>
          <div ref={stageToolbarRef} className="stage-toolbar" style={{ width: scaledStageWidth }}>
            <div className="editor-controls">
              <div className="double-sided-switch" role="group" aria-label="Card layout mode">
                <button
                  type="button"
                  className={`double-sided-option ${project.doubleSided ? '' : 'is-active'}`}
                  aria-pressed={!project.doubleSided}
                  aria-label="Single-sided"
                  onClick={() => onToggleDoubleSided(false)}
                >
                  {useCompactToggleLabels ? 'Single' : 'Single-sided'}
                </button>
                <button
                  type="button"
                  className={`double-sided-option ${project.doubleSided ? 'is-active' : ''}`}
                  aria-pressed={project.doubleSided}
                  aria-label="Double-sided"
                  onClick={() => onToggleDoubleSided(true)}
                >
                  {useCompactToggleLabels ? 'Double' : 'Double-sided'}
                </button>
              </div>
            </div>
          </div>

          <div className="stage-shell" ref={stageShellRef}>
            <div className="stage-wrap" style={{ width: scaledStageWidth, height: scaledStageHeight, transform: `translateX(${-stageWrapShiftX}px)` }}>
              {showMobileNav ? (
                <div className="mobile-card-nav" role="group" aria-label="Move selected card">
                  <button type="button" className="mobile-card-nav-button" onClick={onMoveSelectedRowUp} disabled={!canMoveSelectedRowUp}>
                    ↑
                  </button>
                  <button
                    type="button"
                    className="mobile-card-nav-button"
                    onClick={onMoveSelectedRowDown}
                    disabled={!canMoveSelectedRowDown}
                  >
                    ↓
                  </button>
                </div>
              ) : null}
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
                      const clamped = clampCanvasPosition(
                        event.target.x(),
                        event.target.y(),
                        project.template.image.width,
                        project.template.image.height
                      );
                      event.target.position(clamped);
                      syncDraggedImagePreview(clamped.x, clamped.y);
                      updateSelectionBadge(clamped.x, clamped.y, 'Image');
                      const sideResult = fromCanvasPosition(
                        clamped.x,
                        clamped.y,
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
                      const clamped = clampCanvasPosition(
                        event.target.x(),
                        event.target.y(),
                        project.template.image.width,
                        project.template.image.height
                      );
                      event.target.position(clamped);
                      syncDraggedImagePreview(clamped.x, clamped.y);
                      const sideResult = fromCanvasPosition(
                        clamped.x,
                        clamped.y,
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
                      const clamped = clampCanvasPosition(node.x(), node.y(), nextWidth, nextHeight);
                      node.position(clamped);
                      const sideResult = fromCanvasPosition(clamped.x, clamped.y, nextWidth, nextHeight);
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
                        const clamped = clampCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                        event.target.position(clamped);
                        updateSelectionBadge(clamped.x, clamped.y, textElement.role === 'word' ? 'Word' : 'Subtitle');
                        const sideResult = fromCanvasPosition(clamped.x, clamped.y, textElement.width, textElement.height);
                        if (sideResult.side !== textElement.side) {
                          onPatchTextElement(textElement.id, {
                            x: sideResult.x,
                            y: sideResult.y,
                            side: sideResult.side
                          });
                        }
                      }}
                      onDragEnd={(event) => {
                        const clamped = clampCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                        event.target.position(clamped);
                        const sideResult = fromCanvasPosition(clamped.x, clamped.y, textElement.width, textElement.height);
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
                        const clamped = clampCanvasPosition(node.x(), node.y(), nextWidth, nextHeight);
                        node.position(clamped);
                        const sideResult = fromCanvasPosition(clamped.x, clamped.y, nextWidth, nextHeight);
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
                          const clamped = clampCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                          event.target.position(clamped);
                          updateSelectionBadge(clamped.x, clamped.y, textElement.role === 'word' ? 'Word' : 'Subtitle');
                          const sideResult = fromCanvasPosition(clamped.x, clamped.y, textElement.width, textElement.height);
                          if (sideResult.side !== textElement.side) {
                            onPatchTextElement(textElement.id, {
                              x: sideResult.x,
                              y: sideResult.y,
                              side: sideResult.side
                            });
                          }
                        }}
                        onDragEnd={(event) => {
                          const clamped = clampCanvasPosition(event.target.x(), event.target.y(), textElement.width, textElement.height);
                          event.target.position(clamped);
                          const sideResult = fromCanvasPosition(clamped.x, clamped.y, textElement.width, textElement.height);
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
                          const clamped = clampCanvasPosition(node.x(), node.y(), nextWidth, nextHeight);
                          node.position(clamped);
                          const sideResult = fromCanvasPosition(clamped.x, clamped.y, nextWidth, nextHeight);
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
                  width={imagePanelPos.width}
                  maxHeight={imagePanelPos.maxHeight}
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
                  width={textPanelPos.width}
                  maxHeight={textPanelPos.maxHeight}
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
