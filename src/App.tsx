import { useEffect, useMemo, useState } from 'react';
import tamilFontUrl from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff?url';
import '@fontsource/noto-sans-tamil/400.css';
import type { RowValidation } from './types';
import { CanvasEditor } from './components/CanvasEditor';
import { PdfOutputPanel } from './components/PdfOutputPanel';
import { SelectedCardDetails } from './components/SelectedCardDetails';
import { SetsDrawer } from './components/SetsDrawer';
import { WordListPanel } from './components/WordListPanel';
import { DEFAULT_TEMPLATE } from './constants/project';
import { useImage } from './hooks/useImage';
import { useWorkspace } from './hooks/useWorkspace';
import { generatePdfBytes } from './services/pdfExport';
import { fromCanvasY as mapFromCanvasY, getStageHeight, toCanvasY as mapToCanvasY } from './utils/canvasLayout';
import { parseCsvInput } from './utils/csv';
import { createEmojiImageDataUrl, findTopEmojiMatches } from './utils/emoji';
import { validateRows } from './utils/layout';
import { clearRowImage, hasRowImage, setImageFromDataUrl, setImageFromUrl } from './utils/rowImage';

function makeRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App() {
  const { sets, project, loading, setActiveSetId, createSet, deleteSet, updateActiveSet, patchTemplate, patchTextElement, replaceRows, appendRows, updateRow } =
    useWorkspace();
  const [newSetName, setNewSetName] = useState('');
  const [setsMenuOpen, setSetsMenuOpen] = useState(false);
  const [csvInput, setCsvInput] = useState('');
  const [imageUrlDraft, setImageUrlDraft] = useState('');
  const [selectedElement, setSelectedElement] = useState<'image' | 'text1' | 'text2' | null>(null);
  const [pdfStatus, setPdfStatus] = useState<string>('');
  const [pdfProgress, setPdfProgress] = useState<{ active: boolean; percent: number; stage: string }>({
    active: false,
    percent: 0,
    stage: ''
  });
  const [imageIssues, setImageIssues] = useState<Record<string, string>>({});

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
    setImageUrlDraft(selectedRow?.imageUrl ?? '');
  }, [selectedRow?.id, selectedRow?.imageUrl]);

  function onCreateSet() {
    createSet(newSetName);
    setNewSetName('');
    setSetsMenuOpen(false);
  }

  function onDeleteSet(setId: string) {
    if (!window.confirm('Delete this set? This only removes it from local browser storage.')) {
      return;
    }
    deleteSet(setId);
  }

  function onCsvImport(): boolean {
    const rows = parseCsvInput(csvInput);
    if (!rows.length) {
      setPdfStatus('No CSV rows found.');
      return false;
    }
    appendRows(rows);
    setCsvInput('');
    setPdfStatus(`Imported ${rows.length} rows from CSV.`);
    return true;
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

  async function onSelectedRowImageUpload(file: File) {
    if (!selectedRow) {
      return;
    }
    await onRowImageUpload(selectedRow.id, file);
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

  function onAppendRow(row: { word: string; subtitle: string }) {
    const nextRow = {
      id: makeRowId(),
      word: row.word,
      subtitle: row.subtitle,
      imageUrl: ''
    };
    appendRows([nextRow]);
  }

  function onDeleteRow(rowId: string) {
    updateActiveSet((current) => {
      const rowIndex = current.rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) {
        return current;
      }
      const nextRows = current.rows.filter((row) => row.id !== rowId);
      const nextSelectedRowId =
        current.selectedRowId === rowId ? nextRows[Math.min(rowIndex, Math.max(nextRows.length - 1, 0))]?.id : current.selectedRowId;
      return {
        ...current,
        rows: nextRows,
        selectedRowId: nextSelectedRowId
      };
    });
    setImageIssues((current) => {
      if (!current[rowId]) {
        return current;
      }
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }

  function onInsertRowAfter(rowId: string): string | undefined {
    let insertedId: string | undefined;
    updateActiveSet((current) => {
      const rowIndex = current.rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) {
        return current;
      }
      insertedId = makeRowId();
      const nextRow = {
        id: insertedId,
        word: '',
        subtitle: '',
        imageUrl: ''
      };
      const nextRows = [...current.rows];
      nextRows.splice(rowIndex + 1, 0, nextRow);
      return {
        ...current,
        rows: nextRows,
        selectedRowId: current.selectedRowId
      };
    });
    return insertedId;
  }

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
        onCreateSet={onCreateSet}
        onSelectSet={setActiveSetId}
        onDeleteSet={onDeleteSet}
        onClose={() => setSetsMenuOpen(false)}
      />

      <main>
        <CanvasEditor
          project={project}
          selection={{
            selectedRow,
            selectedRowIndex,
            currentValidation,
            selectedElement,
            previewImage,
            imageIsEmpty
          }}
          canvas={{ cardHeight, stageHeight, toCanvasY, fromCanvasY }}
          actions={{
            onSelectElement: setSelectedElement,
            onPatchTemplate: patchTemplate,
            onPatchTextElement: patchTextElement,
            onUpdateRow: updateRow,
            onCanvasImageDrop: (file) => void onSelectedRowImageUpload(file),
            onToggleDoubleSided: (doubleSided) =>
              updateActiveSet((current) => {
                const currentTemplate = current.template;
                const nextSingleSidedTemplate = current.doubleSided ? current.singleSidedTemplate : currentTemplate;
                const nextDoubleSidedTemplate = current.doubleSided ? currentTemplate : current.doubleSidedTemplate;
                const fallbackSingle = nextSingleSidedTemplate ?? currentTemplate;
                const fallbackDouble = nextDoubleSidedTemplate ?? currentTemplate;
                return {
                  ...current,
                  doubleSided,
                  singleSidedTemplate: fallbackSingle,
                  doubleSidedTemplate: fallbackDouble,
                  template: doubleSided ? fallbackDouble : fallbackSingle
                };
              }),
            onSelectPreviousRow: () =>
              updateActiveSet((current) => ({
                ...current,
                selectedRowId: current.rows[Math.max((selectedRowIndex || 0) - 1, 0)]?.id
              })),
            onSelectNextRow: () =>
              updateActiveSet((current) => ({
                ...current,
                selectedRowId: current.rows[Math.min((selectedRowIndex || 0) + 1, Math.max(current.rows.length - 1, 0))]?.id
              })),
            canSelectPreviousRow: selectedRowIndex > 0,
            canSelectNextRow: selectedRowIndex >= 0 && selectedRowIndex < project.rows.length - 1
          }}
        >
          <SelectedCardDetails
            data={{
              selectedRow,
              selectedRowHasImage,
              imageUrlDraft,
              selectedRowEmojiMatches
            }}
            actions={{
              onImageUrlDraftChange: setImageUrlDraft,
              onApplySelectedImageUrl,
              onSelectedRowImageUpload: (file) => void onSelectedRowImageUpload(file),
              onApplyEmoji: applyEmojiToRow,
              onRemoveSelectedRowImage
            }}
          />
        </CanvasEditor>

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
          onAppendRow={onAppendRow}
          onInsertRowAfter={onInsertRowAfter}
          onDeleteRow={onDeleteRow}
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
