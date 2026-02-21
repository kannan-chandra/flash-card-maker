import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import tamilFontUrl from '@fontsource/noto-sans-tamil/files/noto-sans-tamil-tamil-400-normal.woff?url';
import siteLogoUrl from './assets/logo.png';
import '@fontsource/inter/300.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/noto-sans-tamil/400.css';
import type { FlashcardRow, RowValidation } from './types';
import { CanvasEditor } from './components/CanvasEditor';
import { SelectedCardDetails } from './components/SelectedCardDetails';
import { ExportLayoutPreview } from './components/ExportLayoutPreview';
import { SetsDrawer } from './components/SetsDrawer';
import { Modal } from './components/ui/Modal';
import { OverlayBackdrop } from './components/ui/OverlayBackdrop';
import { WordListPanel } from './components/WordListPanel';
import { DEFAULT_TEMPLATE } from './constants/project';
import { useImage } from './hooks/useImage';
import { useWorkspace } from './hooks/useWorkspace';
import { generatePdfBytes } from './services/pdfExport';
import { trackEvent } from './services/analytics';
import { parseCsvInputWithMeta } from './utils/csv';
import { createEmojiImageDataUrl, findTopEmojiMatches } from './utils/emoji';
import { validateRows } from './utils/layout';
import { clearRowImage, hasRowImage, setImageFromDataUrl, setImageFromUrl } from './utils/rowImage';

function makeRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const ONBOARDING_DISMISSED_KEY = 'flashcard-maker/onboarding-dismissed/v1';
const DRAFT_ROW_ID = '__draft__';
const CANVAS_EDIT_IDLE_MS = 10000;

type CanvasElementType = 'image' | 'text1' | 'text2';
type CanvasChangeType = 'move' | 'resize' | 'font' | 'align' | 'role';

function getExportPageCount(rowCount: number, preset: 6 | 8 | 15, doubleSided: boolean): number {
  const perPage = preset;
  const singleSidePageCount = Math.ceil(rowCount / perPage);
  return doubleSided ? singleSidePageCount * 2 : singleSidePageCount;
}

export default function App() {
  const { sets, project, loading, setActiveSetId, createSet, renameSet, deleteSet, updateActiveSet, patchTemplate, patchTextElement, appendRows, updateRow } =
    useWorkspace();
  const [setsMenuOpen, setSetsMenuOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
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
  const [emojiBulkPromptRowId, setEmojiBulkPromptRowId] = useState<string | null>(null);
  const [draftRow, setDraftRow] = useState<Pick<FlashcardRow, 'word' | 'subtitle'>>({ word: '', subtitle: '' });
  const [activeRowId, setActiveRowId] = useState<string | undefined>(undefined);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const emojiBulkPromptTimerRef = useRef<number | null>(null);
  const appOpenTrackedRef = useRef(false);
  const lastTrackedSetIdRef = useRef<string | null>(null);
  const canvasDirtyRef = useRef<Map<CanvasElementType, Set<CanvasChangeType>>>(new Map());
  const canvasSessionStartedAtRef = useRef<number | null>(null);
  const canvasIdleTimerRef = useRef<number | null>(null);

  const selectedPersistedRow = useMemo(() => {
    if (!project) {
      return undefined;
    }
    if (!project.rows.length) {
      return undefined;
    }
    if (activeRowId && activeRowId !== DRAFT_ROW_ID) {
      const activeRow = project.rows.find((row) => row.id === activeRowId);
      if (activeRow) {
        return activeRow;
      }
    }
    if (project.selectedRowId) {
      return project.rows.find((row) => row.id === project.selectedRowId) ?? project.rows[0];
    }
    return project.rows[0];
  }, [activeRowId, project]);
  const selectedRow = useMemo(() => {
    if (activeRowId === DRAFT_ROW_ID) {
      return {
        id: DRAFT_ROW_ID,
        word: draftRow.word,
        subtitle: draftRow.subtitle,
        imageUrl: ''
      };
    }
    return selectedPersistedRow;
  }, [activeRowId, draftRow.subtitle, draftRow.word, selectedPersistedRow]);
  const selectedRowIsDraft = activeRowId === DRAFT_ROW_ID;
  const rowCount = project?.rows.length ?? 0;
  const totalCardsAllSets = useMemo(() => sets.reduce((sum, setItem) => sum + setItem.rows.length, 0), [sets]);
  const selectedListIndex = useMemo(() => {
    if (!project || rowCount === 0) {
      return selectedRowIsDraft ? 0 : -1;
    }
    if (selectedRowIsDraft) {
      return rowCount;
    }
    if (!selectedPersistedRow) {
      return -1;
    }
    const persistedIndex = project.rows.findIndex((row) => row.id === selectedPersistedRow.id);
    if (persistedIndex >= 0) {
      return persistedIndex;
    }
    return 0;
  }, [project, rowCount, selectedPersistedRow, selectedRowIsDraft]);
  const canMoveSelectedRowUp = selectedListIndex > 0;
  const canMoveSelectedRowDown = selectedListIndex >= 0 && selectedListIndex < rowCount;
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
  const previewImageSrc = selectedRow?.localImageDataUrl || selectedRow?.imageUrl;
  const { image: previewImage, isLoading: previewImageLoading } = useImage(previewImageSrc);
  const imageIsEmpty = !previewImageSrc;
  const cardHeight = project?.template.height ?? DEFAULT_TEMPLATE.height;

  const validations: RowValidation[] = useMemo(() => {
    if (!project) {
      return [];
    }
    return validateRows(project.template, project.rows);
  }, [project]);
  const overflowCount = useMemo(
    () => validations.filter((item) => item.wordOverflow || item.subtitleOverflow).length,
    [validations]
  );

  const flushCanvasEditSession = useCallback(() => {
    const changedItems = Array.from(canvasDirtyRef.current.entries()).map(([elementType, changeTypes]) => ({
      element_type: elementType,
      change_types: Array.from(changeTypes).sort()
    }));
    if (!changedItems.length) {
      return;
    }

    const distinctChangeTypes = Array.from(new Set(changedItems.flatMap((item) => item.change_types))).sort().join(',');
    trackEvent('layout_edit_session_completed', {
      double_sided: project?.doubleSided ?? false,
      changed_item_count: changedItems.length,
      changed_item_types: changedItems.map((item) => item.element_type).join(','),
      changed_change_types: distinctChangeTypes,
      changed_items_json: JSON.stringify(changedItems),
      session_duration_ms: canvasSessionStartedAtRef.current ? Date.now() - canvasSessionStartedAtRef.current : 0
    });

    canvasDirtyRef.current.clear();
    canvasSessionStartedAtRef.current = null;
    if (canvasIdleTimerRef.current !== null) {
      window.clearTimeout(canvasIdleTimerRef.current);
      canvasIdleTimerRef.current = null;
    }
  }, [project?.doubleSided]);

  const markCanvasElementEdited = useCallback(
    (elementType: CanvasElementType, changeType: CanvasChangeType) => {
      if (!canvasSessionStartedAtRef.current) {
        canvasSessionStartedAtRef.current = Date.now();
      }
      const currentChanges = canvasDirtyRef.current.get(elementType) ?? new Set<CanvasChangeType>();
      currentChanges.add(changeType);
      canvasDirtyRef.current.set(elementType, currentChanges);
      if (canvasIdleTimerRef.current !== null) {
        window.clearTimeout(canvasIdleTimerRef.current);
      }
      canvasIdleTimerRef.current = window.setTimeout(() => {
        flushCanvasEditSession();
      }, CANVAS_EDIT_IDLE_MS);
    },
    [flushCanvasEditSession]
  );

  useEffect(() => {
    setImageUrlDraft(selectedPersistedRow?.imageUrl ?? '');
  }, [selectedPersistedRow?.id, selectedPersistedRow?.imageUrl]);

  useEffect(() => {
    setDraftRow({ word: '', subtitle: '' });
  }, [project?.id]);

  useEffect(() => {
    if (!project) {
      return;
    }
    setActiveRowId((current) => {
      if (current === DRAFT_ROW_ID) {
        return current;
      }
      if (current && project.rows.some((row) => row.id === current)) {
        return current;
      }
      if (project.selectedRowId && project.rows.some((row) => row.id === project.selectedRowId)) {
        return project.selectedRowId;
      }
      return project.rows[0]?.id ?? DRAFT_ROW_ID;
    });
  }, [project]);

  useEffect(
    () => () => {
      if (emojiBulkPromptTimerRef.current !== null) {
        window.clearTimeout(emojiBulkPromptTimerRef.current);
      }
    },
    []
  );

  useEffect(
    () => () => {
      flushCanvasEditSession();
    },
    [flushCanvasEditSession]
  );

  useEffect(() => {
    if (!loading && project?.id) {
      flushCanvasEditSession();
    }
  }, [loading, project?.id, flushCanvasEditSession]);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) === '1';
    setShowOnboarding(!dismissed);
  }, []);

  useEffect(() => {
    if (loading || !project || appOpenTrackedRef.current) {
      return;
    }
    trackEvent('app_open', {
      source: document.referrer ? 'referral' : 'direct',
      has_saved_sets: sets.length > 0,
      set_count: sets.length,
      total_cards_all_sets: totalCardsAllSets,
      active_set_cards: project.rows.length
    });
    appOpenTrackedRef.current = true;
  }, [loading, project, sets.length, totalCardsAllSets]);

  useEffect(() => {
    if (loading || !project) {
      return;
    }
    if (lastTrackedSetIdRef.current === project.id) {
      return;
    }
    trackEvent('set_selected', {
      set_age_days: Math.max(0, Math.floor((Date.now() - project.createdAt) / 86400000)),
      row_count: project.rows.length,
      double_sided: project.doubleSided
    });
    lastTrackedSetIdRef.current = project.id;
  }, [loading, project]);

  function showEmojiBulkPrompt(rowId: string) {
    if (emojiBulkPromptTimerRef.current !== null) {
      window.clearTimeout(emojiBulkPromptTimerRef.current);
    }
    setEmojiBulkPromptRowId(rowId);
    emojiBulkPromptTimerRef.current = window.setTimeout(() => {
      setEmojiBulkPromptRowId(null);
      emojiBulkPromptTimerRef.current = null;
    }, 5000);
  }

  function clearEmojiBulkPrompt() {
    if (emojiBulkPromptTimerRef.current !== null) {
      window.clearTimeout(emojiBulkPromptTimerRef.current);
      emojiBulkPromptTimerRef.current = null;
    }
    setEmojiBulkPromptRowId(null);
  }

  function dismissOnboarding() {
    window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, '1');
    setShowOnboarding(false);
  }

  function onCreateSet(name: string) {
    trackEvent('set_created', {
      set_name_length: name.trim().length,
      set_index: sets.length + 1
    });
    createSet(name);
    setSetsMenuOpen(false);
  }

  function onDeleteSet(setId: string) {
    if (!window.confirm('Delete this set? This only removes it from local browser storage.')) {
      return;
    }
    const targetSet = sets.find((item) => item.id === setId);
    trackEvent('set_deleted', {
      deleted_set_cards: targetSet?.rows.length ?? 0,
      set_count_before: sets.length
    });
    deleteSet(setId);
  }

  function onRenameSet(setId: string, name: string) {
    renameSet(setId, name);
  }

  function onSelectSet(setId: string) {
    const selectedSet = sets.find((item) => item.id === setId);
    trackEvent('set_selected', {
      set_age_days: selectedSet ? Math.max(0, Math.floor((Date.now() - selectedSet.createdAt) / 86400000)) : undefined,
      row_count: selectedSet?.rows.length,
      double_sided: selectedSet?.doubleSided
    });
    lastTrackedSetIdRef.current = setId;
    setActiveSetId(setId);
  }

  function onCsvImport(): boolean {
    const parsed = parseCsvInputWithMeta(csvInput);
    const rows = parsed.rows;
    if (!rows.length) {
      setPdfStatus('No CSV rows found.');
      return false;
    }
    appendRows(rows);
    if (activeRowId === DRAFT_ROW_ID) {
      const firstImportedRowId = rows[0]?.id;
      if (firstImportedRowId) {
        setActiveRowId(firstImportedRowId);
        updateActiveSet((current) => ({
          ...current,
          selectedRowId: firstImportedRowId
        }));
      }
    }
    trackEvent('rows_imported_csv', {
      rows_added: rows.length,
      has_header: parsed.hasHeader,
      invalid_rows: parsed.invalidRows,
      images_with_url_count: parsed.imagesWithUrlCount
    });
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
    trackEvent('image_source_set', {
      source_type: 'upload',
      success: true
    });
    clearEmojiBulkPrompt();
  }

  async function onSelectedRowImageUpload(file: File) {
    if (!selectedPersistedRow || selectedRowIsDraft) {
      return;
    }
    await onRowImageUpload(selectedPersistedRow.id, file);
  }

  function applyEmojiToRow(rowId: string, emoji: string) {
    const dataUrl = createEmojiImageDataUrl(emoji);
    updateRow(rowId, setImageFromDataUrl(dataUrl));
    trackEvent('image_source_set', {
      source_type: 'emoji',
      success: true
    });
    showEmojiBulkPrompt(rowId);
  }

  function applyTopEmojiToAllRows() {
    updateActiveSet((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        const topWordEmoji = findTopEmojiMatches(row.word ?? '', 1)[0]?.emoji;
        const topSubtitleEmoji = findTopEmojiMatches(row.subtitle ?? '', 1)[0]?.emoji;
        const topEmoji = topWordEmoji ?? topSubtitleEmoji;
        if (!topEmoji) {
          return row;
        }
        return { ...row, ...setImageFromDataUrl(createEmojiImageDataUrl(topEmoji)) };
      })
    }));
    clearEmojiBulkPrompt();
  }

  function onApplySelectedImageUrl(value?: string) {
    if (!selectedPersistedRow || selectedRowIsDraft) {
      return;
    }
    const trimmed = (value ?? imageUrlDraft).trim();
    if (!trimmed) {
      return;
    }
    updateRow(selectedPersistedRow.id, setImageFromUrl(trimmed));
    trackEvent('image_source_set', {
      source_type: 'url',
      success: true
    });
    clearEmojiBulkPrompt();
  }

  function moveSelectedRowBy(offset: -1 | 1) {
    if (!project) {
      return;
    }
    const maxIndex = rowCount;
    const currentIndex = selectedListIndex >= 0 ? selectedListIndex : 0;
    const nextIndex = Math.min(Math.max(currentIndex + offset, 0), maxIndex);
    if (nextIndex === currentIndex) {
      return;
    }
    if (nextIndex === project.rows.length) {
      setActiveRowId(DRAFT_ROW_ID);
      return;
    }
    const nextRowId = project.rows[nextIndex]?.id;
    if (!nextRowId) {
      return;
    }
    setActiveRowId(nextRowId);
    if (nextRowId !== project.selectedRowId) {
      updateActiveSet((current) => ({ ...current, selectedRowId: nextRowId }));
    }
  }

  function onRemoveSelectedRowImage() {
    if (!selectedPersistedRow || selectedRowIsDraft) {
      return;
    }
    updateRow(selectedPersistedRow.id, clearRowImage());
    setImageUrlDraft('');
    clearEmojiBulkPrompt();
  }

  function onSelectListRow(rowId: string) {
    setActiveRowId(rowId);
    if (rowId === DRAFT_ROW_ID) {
      return;
    }
    if (project) {
      const rowIndex = project.rows.findIndex((row) => row.id === rowId);
      const row = rowIndex >= 0 ? project.rows[rowIndex] : undefined;
      const validation = validations.find((item) => item.rowId === rowId);
      trackEvent('preview_row_selected', {
        row_index: rowIndex,
        has_image: hasRowImage(row),
        overflow_flag: Boolean(validation?.wordOverflow || validation?.subtitleOverflow)
      });
    }
    updateActiveSet((current) => ({ ...current, selectedRowId: rowId }));
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

    flushCanvasEditSession();
    const exportStartedAt = performance.now();
    trackEvent('export_pdf_started', {
      cards_per_page: project.preset,
      double_sided: project.doubleSided,
      row_count: project.rows.length,
      show_cut_guides: project.showCutGuides
    });

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
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      const errorType = message.includes('font') ? 'font' : 'unknown';
      trackEvent('export_pdf_failed', {
        error_type: errorType,
        row_count: project.rows.length,
        double_sided: project.doubleSided
      });
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
    trackEvent('export_pdf_completed', {
      duration_ms: Math.round(performance.now() - exportStartedAt),
      page_count: getExportPageCount(project.rows.length, project.preset, project.doubleSided),
      image_issue_count: Object.keys(generated.imageIssues).length,
      overflow_count: overflowCount
    });
    if (Object.keys(generated.imageIssues).length) {
      setPdfStatus('PDF generated with some image errors. Use local image upload for blocked web images.');
      return;
    }
    setPdfStatus('PDF generated successfully.');
  }

  function onAppendRow(row: { word: string; subtitle: string }) {
    const nextRow = {
      id: makeRowId(),
      word: row.word,
      subtitle: row.subtitle,
      imageUrl: ''
    };
    appendRows([nextRow]);
    trackEvent('row_added_manual', {
      position: 'append',
      total_rows_after: rowCount + 1
    });
  }

  function onDeleteRow(rowId: string) {
    const row = project?.rows.find((item) => item.id === rowId);
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
    trackEvent('row_deleted', {
      row_had_image: hasRowImage(row),
      total_rows_after: Math.max((project?.rows.length ?? 1) - 1, 0)
    });
  }

  function onInsertRowAfter(rowId: string): string | undefined {
    if (!project || !project.rows.some((row) => row.id === rowId)) {
      return undefined;
    }
    const nextInsertedId = makeRowId();
    updateActiveSet((current) => {
      const rowIndex = current.rows.findIndex((row) => row.id === rowId);
      if (rowIndex < 0) {
        return current;
      }
      const nextRow = {
        id: nextInsertedId,
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
    trackEvent('row_added_manual', {
      position: 'insert_after',
      total_rows_after: (project?.rows.length ?? 0) + 1
    });
    return nextInsertedId;
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
        <div className="site-brand">
          <img src={siteLogoUrl} className="site-logo" alt="" aria-hidden="true" />
          <h1>Swift Flashcards</h1>
        </div>
        <div className="header-actions">
          <button type="button" className="header-action-link" onClick={() => setImportModalOpen(true)}>
            Import
          </button>
          <button type="button" className="header-action-cta" onClick={() => setExportModalOpen(true)}>
            Export
          </button>
        </div>
      </header>

      {setsMenuOpen && <OverlayBackdrop onClick={() => setSetsMenuOpen(false)} ariaLabel="Close sets menu" />}
      <SetsDrawer
        setsMenuOpen={setsMenuOpen}
        sets={sets}
        activeSetId={project.id}
        onCreateSet={onCreateSet}
        onSelectSet={onSelectSet}
        onRenameSet={onRenameSet}
        onDeleteSet={onDeleteSet}
        onClose={() => setSetsMenuOpen(false)}
      />
      {showOnboarding && (
        <>
          <OverlayBackdrop className="menu-backdrop csv-backdrop" onClick={dismissOnboarding} ariaLabel="Close first launch guide" />
          <Modal className="csv-modal onboarding-modal" ariaLabel="First launch guide">
            <h3>Swift Flashcards</h3>
            <ol>
              <li>Build your word list quickly.</li>
              <li>Edit your card layout, with single-sided or double-sided cards.</li>
              <li>Export to PDF in multiple sizes.</li>
            </ol>
            <p>
              Cards are stored only locally on this computer in your browser. If you clear browser data, you will lose your flash cards. Remember to export to PDF if you are on a
              public computer.
            </p>
            <div className="row-buttons onboarding-modal-actions">
              <button type="button" className="primary" onClick={dismissOnboarding}>
                Got it
              </button>
            </div>
          </Modal>
        </>
      )}
      {importModalOpen && (
        <>
          <OverlayBackdrop className="menu-backdrop csv-backdrop" onClick={() => setImportModalOpen(false)} ariaLabel="Close CSV import" />
          <Modal className="csv-modal" ariaLabel="CSV import">
            <h3>Import CSV</h3>
            <p>Columns: `word`, `subtitle`, `imageUrl`. Header row is optional.</p>
            <textarea
              value={csvInput}
              onChange={(event) => setCsvInput(event.target.value)}
              placeholder={'word,subtitle,imageUrl\nDog,Animal,https://example.com/dog.jpg'}
              rows={8}
              aria-label="CSV input"
            />
            <div className="row-buttons">
              <button
                type="button"
                onClick={() => {
                  const imported = onCsvImport();
                  if (imported) {
                    setImportModalOpen(false);
                  }
                }}
              >
                Import
              </button>
              <button type="button" onClick={() => setImportModalOpen(false)}>
                Cancel
              </button>
            </div>
          </Modal>
        </>
      )}
      {exportModalOpen && (
        <>
          <OverlayBackdrop className="menu-backdrop csv-backdrop" onClick={() => setExportModalOpen(false)} ariaLabel="Close export" />
          <Modal className="csv-modal export-modal" ariaLabel="Export PDF">
            <div className="export-modal-header">
              <h3>Export PDF</h3>
            </div>
            <ExportLayoutPreview preset={project.preset} spacingMode={project.pdfSpacingMode} />
            <div className="export-modal-controls">
              <div className="export-modal-spacing">
                <span>Cards per page</span>
                <div className="export-modal-segmented export-modal-segmented-three" role="group" aria-label="Cards per page">
                  <button
                    type="button"
                    className={project.preset === 6 ? 'active' : ''}
                    aria-pressed={project.preset === 6}
                    onClick={() => updateActiveSet((current) => ({ ...current, preset: 6 }))}
                  >
                    6
                  </button>
                  <button
                    type="button"
                    className={project.preset === 8 ? 'active' : ''}
                    aria-pressed={project.preset === 8}
                    onClick={() => updateActiveSet((current) => ({ ...current, preset: 8 }))}
                  >
                    8
                  </button>
                  <button
                    type="button"
                    className={project.preset === 15 ? 'active' : ''}
                    aria-pressed={project.preset === 15}
                    onClick={() => updateActiveSet((current) => ({ ...current, preset: 15 }))}
                  >
                    15
                  </button>
                </div>
                <div className="export-modal-note-row" aria-hidden>
                  <span />
                  <p className="export-modal-note">standard playing card size</p>
                  <span />
                </div>
              </div>
              <div className="export-modal-spacing">
                <span>Card spacing</span>
                <div className="export-modal-segmented" role="group" aria-label="PDF card spacing mode">
                  <button
                    type="button"
                    className={project.pdfSpacingMode === 'with-margin' ? 'active' : ''}
                    aria-pressed={project.pdfSpacingMode === 'with-margin'}
                    onClick={() => updateActiveSet((current) => ({ ...current, pdfSpacingMode: 'with-margin' }))}
                  >
                    With margin
                  </button>
                  <button
                    type="button"
                    className={project.pdfSpacingMode === 'easy-cut' ? 'active' : ''}
                    aria-pressed={project.pdfSpacingMode === 'easy-cut'}
                    onClick={() => updateActiveSet((current) => ({ ...current, pdfSpacingMode: 'easy-cut' }))}
                  >
                    Easy cut
                  </button>
                </div>
              </div>
              <label className="checkbox-row export-modal-checkbox">
                <input
                  type="checkbox"
                  checked={project.showCutGuides}
                  onChange={(event) => updateActiveSet((current) => ({ ...current, showCutGuides: event.target.checked }))}
                />
                Include cut guide borders
              </label>
            </div>
            <div className="row-buttons export-modal-actions">
              <button className="primary" type="button" onClick={() => void generatePdf()} disabled={pdfProgress.active}>
                {pdfProgress.active ? 'Generating...' : 'Generate PDF'}
              </button>
              <button type="button" onClick={() => setExportModalOpen(false)} disabled={pdfProgress.active}>
                Close
              </button>
            </div>
            {pdfProgress.active && (
              <div className="progress-wrap export-modal-progress" aria-live="polite">
                <div className="progress-label">
                  <span>{pdfProgress.stage}</span>
                  <span>{pdfProgress.percent}%</span>
                </div>
                <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pdfProgress.percent}>
                  <div className="progress-fill" style={{ width: `${pdfProgress.percent}%` }} />
                </div>
              </div>
            )}
            {pdfStatus && <p className="status export-modal-status">{pdfStatus}</p>}
          </Modal>
        </>
      )}

      <main>
        <CanvasEditor
          project={project}
          cardHeight={cardHeight}
          selection={{
            selectedRow,
            selectedElement,
            previewImage,
            imageIsEmpty,
            imageIsLoading: previewImageLoading
          }}
          actions={{
            onSelectElement: setSelectedElement,
            onPatchTemplate: patchTemplate,
            onPatchTextElement: patchTextElement,
            onUpdateRow: updateRow,
            onCanvasElementEdited: markCanvasElementEdited,
            onCanvasImageDrop: (file) => void onSelectedRowImageUpload(file),
            onMoveSelectedRowUp: () => moveSelectedRowBy(-1),
            onMoveSelectedRowDown: () => moveSelectedRowBy(1),
            canMoveSelectedRowUp,
            canMoveSelectedRowDown,
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
              })
          }}
        >
          <SelectedCardDetails
            data={{
              selectedRow: selectedRowIsDraft ? undefined : selectedRow,
              selectedRowHasImage: selectedRowIsDraft ? false : selectedRowHasImage,
              imageUrlDraft,
              selectedRowEmojiMatches: selectedRowIsDraft ? [] : selectedRowEmojiMatches,
              showUseEmojiForAll: !selectedRowIsDraft && selectedRow?.id === emojiBulkPromptRowId
            }}
            actions={{
              onImageUrlDraftChange: setImageUrlDraft,
              onApplySelectedImageUrl,
              onSelectedRowImageUpload: (file) => void onSelectedRowImageUpload(file),
              onApplyEmoji: applyEmojiToRow,
              onRemoveSelectedRowImage,
              onUseEmojiForAllWords: applyTopEmojiToAllRows
            }}
          />
        </CanvasEditor>

        <WordListPanel
          rows={project.rows}
          validations={validations}
          imageIssues={imageIssues}
          selectedRowId={activeRowId}
          onSelectRow={onSelectListRow}
          onUpdateRow={updateRow}
          onAppendRow={onAppendRow}
          onInsertRowAfter={onInsertRowAfter}
          onDeleteRow={onDeleteRow}
          onDraftRowChange={setDraftRow}
        />
      </main>
    </div>
  );
}
