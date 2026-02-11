import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { FlashcardRow, RowValidation } from '../types';

interface WordListPanelProps {
  csvInput: string;
  rows: FlashcardRow[];
  validations: RowValidation[];
  imageIssues: Record<string, string>;
  selectedRowId?: string;
  onCsvInputChange: (value: string) => void;
  onCsvImport: () => boolean;
  onClearRows: () => void;
  onSelectRow: (rowId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<FlashcardRow>) => void;
  onAppendRow: (row: Pick<FlashcardRow, 'word' | 'subtitle'>) => void;
  onInsertRowAfter: (rowId: string) => string | undefined;
  onDeleteRow: (rowId: string) => void;
}

export function WordListPanel(props: WordListPanelProps) {
  const {
    csvInput,
    rows,
    validations,
    imageIssues,
    selectedRowId,
    onCsvInputChange,
    onCsvImport,
    onClearRows,
    onSelectRow,
    onUpdateRow,
    onAppendRow,
    onInsertRowAfter,
    onDeleteRow
  } = props;
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [draftRow, setDraftRow] = useState({ word: '', subtitle: '' });
  const listTableRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subtitleRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const draftWordRef = useRef<HTMLInputElement | null>(null);
  const draftSubtitleRef = useRef<HTMLInputElement | null>(null);
  const selectDebounceTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const pendingTabNavigationRef = useRef<{ rowId: string; column: 'word' | 'subtitle'; shiftKey: boolean } | null>(null);
  const validationById = useMemo(
    () => Object.fromEntries(validations.map((item) => [item.rowId, item])),
    [validations]
  );

  useEffect(
    () => () => {
      if (selectDebounceTimerRef.current) {
        window.clearTimeout(selectDebounceTimerRef.current);
      }
    },
    []
  );

  function scheduleSelectionCommit(rowId: string | undefined) {
    if (selectDebounceTimerRef.current) {
      window.clearTimeout(selectDebounceTimerRef.current);
      selectDebounceTimerRef.current = null;
    }
    if (!rowId) {
      return;
    }
    selectDebounceTimerRef.current = window.setTimeout(() => {
      onSelectRow(rowId);
      selectDebounceTimerRef.current = null;
    }, 90);
  }

  function commitSelectionNow(rowId: string | undefined) {
    if (!rowId) {
      return;
    }
    if (selectDebounceTimerRef.current) {
      window.clearTimeout(selectDebounceTimerRef.current);
      selectDebounceTimerRef.current = null;
    }
    onSelectRow(rowId);
  }

  function getIssueText(rowId: string): string {
    const rowValidation = validationById[rowId];
    const messages: string[] = [];
    if (rowValidation?.wordOverflow) {
      messages.push('Word overflow');
    }
    if (rowValidation?.subtitleOverflow) {
      messages.push('Subtitle overflow');
    }
    if (imageIssues[rowId]) {
      messages.push('Image fetch blocked');
    }
    return messages.join('. ');
  }

  function scrollByOneRowIfNeeded(input: HTMLInputElement, direction: 'up' | 'down') {
    const container = listTableRef.current;
    const row = input.closest('tr');
    if (!container || !row) {
      return;
    }

    const rowRect = row.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const header = container.querySelector('thead');
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    const visibleTop = containerRect.top + headerHeight;
    const visibleBottom = containerRect.bottom;
    const rowHeight = rowRect.height || 40;

    if (direction === 'down' && rowRect.bottom > visibleBottom) {
      container.scrollTop += rowHeight;
      return;
    }

    if (direction === 'up' && rowRect.top < visibleTop) {
      container.scrollTop -= rowHeight;
    }
  }

  function focusInput(
    rowId: string,
    column: 'word' | 'subtitle',
    options?: { arrowDirection?: 'up' | 'down' }
  ) {
    let input: HTMLInputElement | null = null;
    if (rowId === '__draft__') {
      input = column === 'word' ? draftWordRef.current : draftSubtitleRef.current;
    } else {
      input = column === 'word' ? wordRefs.current[rowId] : subtitleRefs.current[rowId];
    }
    if (!input) {
      return;
    }
    input.focus({ preventScroll: true });
    const length = input.value.length;
    if (document.activeElement === input) {
      input.setSelectionRange(length, length);
    }
    if (options?.arrowDirection) {
      scrollByOneRowIfNeeded(input, options.arrowDirection);
    }
  }

  function isRowEmpty(row: Pick<FlashcardRow, 'word' | 'subtitle'>): boolean {
    return !row.word.trim() && !row.subtitle.trim();
  }

  function onRowBlur(rowId: string, event: FocusEvent<HTMLInputElement>) {
    const nextTarget = event.relatedTarget as HTMLElement | null;
    const nextRowId = nextTarget?.getAttribute('data-row-id');
    if (nextRowId === rowId) {
      return;
    }
    const row = rows.find((item) => item.id === rowId);
    if (!row) {
      return;
    }
    if (isRowEmpty(row)) {
      onDeleteRow(rowId);
    }
    if (!isRowEmpty(row) && !nextRowId) {
      commitSelectionNow(rowId);
    }
  }

  function onExistingRowEnter(event: ReactKeyboardEvent<HTMLInputElement>, rowId: string) {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const rowIndex = rows.findIndex((item) => item.id === rowId);
    if (rowIndex < 0 || isRowEmpty(rows[rowIndex])) {
      return;
    }
    const insertedRowId = onInsertRowAfter(rowId);
    if (!insertedRowId) {
      return;
    }
    scheduleSelectionCommit(insertedRowId);
    requestAnimationFrame(() => {
      focusInput(insertedRowId, 'word', { arrowDirection: 'down' });
    });
  }

  function atStart(input: HTMLInputElement): boolean {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start === null || end === null) {
      return false;
    }
    return start === 0 && end === 0;
  }

  function atEnd(input: HTMLInputElement): boolean {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start === null || end === null) {
      return false;
    }
    const length = input.value.length;
    return start === length && end === length;
  }

  function onArrowNavigation(event: ReactKeyboardEvent<HTMLInputElement>, rowId: string, column: 'word' | 'subtitle') {
    const rowsWithDraft = [...rows.map((row) => row.id), '__draft__'];
    const currentIndex = rowsWithDraft.indexOf(rowId);
    if (currentIndex < 0) {
      return;
    }

    if (event.key === 'ArrowUp') {
      if (currentIndex === 0) {
        return;
      }
      event.preventDefault();
      const previousRowId = rowsWithDraft[currentIndex - 1];
      if (previousRowId !== '__draft__') {
        scheduleSelectionCommit(previousRowId);
      } else {
        scheduleSelectionCommit(undefined);
      }
      focusInput(previousRowId, column, { arrowDirection: 'up' });
      return;
    }

    if (event.key === 'ArrowDown') {
      if (currentIndex === rowsWithDraft.length - 1) {
        return;
      }
      event.preventDefault();
      const nextRowId = rowsWithDraft[currentIndex + 1];
      if (nextRowId !== '__draft__') {
        scheduleSelectionCommit(nextRowId);
      } else {
        scheduleSelectionCommit(undefined);
      }
      focusInput(nextRowId, column, { arrowDirection: 'down' });
      return;
    }

    const target = event.currentTarget;
    if (event.key === 'ArrowLeft' && column === 'subtitle' && atStart(target)) {
      event.preventDefault();
      if (rowId !== '__draft__') {
        scheduleSelectionCommit(rowId);
      }
      focusInput(rowId, 'word');
      return;
    }

    if (event.key === 'ArrowRight' && column === 'word' && atEnd(target)) {
      event.preventDefault();
      if (rowId !== '__draft__') {
        scheduleSelectionCommit(rowId);
      }
      focusInput(rowId, 'subtitle');
    }
  }

  function runTabNavigation(rowId: string, column: 'word' | 'subtitle', shiftKey: boolean): boolean {
    const rowsWithDraft = [...rows.map((row) => row.id), '__draft__'];
    const currentIndex = rowsWithDraft.indexOf(rowId);
    if (currentIndex < 0) {
      return false;
    }

    if (shiftKey) {
      if (column === 'subtitle') {
        if (rowId !== '__draft__') {
          scheduleSelectionCommit(rowId);
        }
        focusInput(rowId, 'word');
        return true;
      }

      if (column === 'word' && currentIndex > 0) {
        const previousRowId = rowsWithDraft[currentIndex - 1];
        if (previousRowId !== '__draft__') {
          scheduleSelectionCommit(previousRowId);
        } else {
          scheduleSelectionCommit(undefined);
        }
        focusInput(previousRowId, 'subtitle', { arrowDirection: 'up' });
        return true;
      }
      return false;
    }

    if (column === 'word') {
      if (rowId !== '__draft__') {
        scheduleSelectionCommit(rowId);
      }
      focusInput(rowId, 'subtitle');
      return true;
    }

    if (column === 'subtitle' && currentIndex < rowsWithDraft.length - 1) {
      const nextRowId = rowsWithDraft[currentIndex + 1];
      if (nextRowId !== '__draft__') {
        scheduleSelectionCommit(nextRowId);
      } else {
        scheduleSelectionCommit(undefined);
      }
      focusInput(nextRowId, 'word', { arrowDirection: 'down' });
      return true;
    }
    return false;
  }

  function onCompositionStart() {
    isComposingRef.current = true;
  }

  function onCompositionEnd() {
    isComposingRef.current = false;
    const pending = pendingTabNavigationRef.current;
    if (!pending) {
      return;
    }
    pendingTabNavigationRef.current = null;
    requestAnimationFrame(() => {
      runTabNavigation(pending.rowId, pending.column, pending.shiftKey);
    });
  }

  function onTabNavigation(event: ReactKeyboardEvent<HTMLInputElement>, rowId: string, column: 'word' | 'subtitle') {
    if (event.key !== 'Tab') {
      return;
    }

    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent;
    const composing = isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229;
    if (composing) {
      event.preventDefault();
      pendingTabNavigationRef.current = { rowId, column, shiftKey: event.shiftKey };
      return;
    }

    if (runTabNavigation(rowId, column, event.shiftKey)) {
      event.preventDefault();
    }
  }

  function onDraftEnter(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    if (isRowEmpty(draftRow)) {
      return;
    }
    onAppendRow({
      word: draftRow.word,
      subtitle: draftRow.subtitle
    });
    setDraftRow({ word: '', subtitle: '' });
    focusInput('__draft__', 'word', { arrowDirection: 'down' });
  }

  return (
    <section className="panel data-panel">
      <div className="row-buttons">
        <button type="button" onClick={() => setCsvModalOpen(true)}>
          Import CSV
        </button>
        <button type="button" onClick={onClearRows} className="danger">
          Clear Rows
        </button>
      </div>

      {csvModalOpen && (
        <>
          <button
            type="button"
            className="menu-backdrop csv-backdrop"
            onClick={() => setCsvModalOpen(false)}
            aria-label="Close CSV import"
          />
          <div className="csv-modal" role="dialog" aria-modal="true" aria-label="CSV import">
            <h3>Import CSV</h3>
            <p>Columns: `word`, `subtitle`, `imageUrl`. Header row is optional.</p>
            <textarea
              value={csvInput}
              onChange={(event) => onCsvInputChange(event.target.value)}
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
                    setCsvModalOpen(false);
                  }
                }}
              >
                Import
              </button>
              <button type="button" onClick={() => setCsvModalOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <div className="list-table" role="region" aria-label="Rows list" ref={listTableRef}>
        <table>
          <thead>
            <tr>
              <th>Word</th>
              <th>Subtitle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const issueText = getIssueText(row.id);
              const hasIssue = Boolean(issueText);
              return (
                <tr
                  key={row.id}
                  className={row.id === selectedRowId ? 'selected' : undefined}
                  onClick={() => {
                    commitSelectionNow(row.id);
                  }}
                >
                  <td>
                    <input
                      ref={(node) => {
                        wordRefs.current[row.id] = node;
                      }}
                      data-row-id={row.id}
                      value={row.word}
                      onChange={(event) => onUpdateRow(row.id, { word: event.target.value })}
                      onFocus={() => scheduleSelectionCommit(row.id)}
                      onBlur={(event) => onRowBlur(row.id, event)}
                      onCompositionStart={onCompositionStart}
                      onCompositionEnd={onCompositionEnd}
                      onKeyDown={(event) => {
                        onTabNavigation(event, row.id, 'word');
                        onArrowNavigation(event, row.id, 'word');
                        onExistingRowEnter(event, row.id);
                      }}
                      aria-label="Word"
                    />
                  </td>
                  <td>
                    <div className="subtitle-cell">
                      <input
                        ref={(node) => {
                          subtitleRefs.current[row.id] = node;
                        }}
                        data-row-id={row.id}
                        value={row.subtitle}
                        onChange={(event) => onUpdateRow(row.id, { subtitle: event.target.value })}
                        onFocus={() => scheduleSelectionCommit(row.id)}
                        onBlur={(event) => onRowBlur(row.id, event)}
                        onCompositionStart={onCompositionStart}
                        onCompositionEnd={onCompositionEnd}
                        onKeyDown={(event) => {
                          onTabNavigation(event, row.id, 'subtitle');
                          onArrowNavigation(event, row.id, 'subtitle');
                          onExistingRowEnter(event, row.id);
                        }}
                        aria-label="Subtitle"
                      />
                      {hasIssue ? (
                        <span className="row-warning" role="img" title={issueText} aria-label={`Row issues: ${issueText}`}>
                          !
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr className="draft-row">
              <td>
                <input
                  ref={draftWordRef}
                  data-row-id="__draft__"
                  value={draftRow.word}
                  onChange={(event) => setDraftRow((current) => ({ ...current, word: event.target.value }))}
                  onCompositionStart={onCompositionStart}
                  onCompositionEnd={onCompositionEnd}
                  onKeyDown={(event) => {
                    onTabNavigation(event, '__draft__', 'word');
                    onArrowNavigation(event, '__draft__', 'word');
                    onDraftEnter(event);
                  }}
                  aria-label="New word"
                  placeholder={!rows.length && !draftRow.word ? 'Click to add first word' : ''}
                />
              </td>
              <td>
                <div className="subtitle-cell">
                  <input
                    ref={draftSubtitleRef}
                    data-row-id="__draft__"
                    value={draftRow.subtitle}
                    onChange={(event) => setDraftRow((current) => ({ ...current, subtitle: event.target.value }))}
                    onCompositionStart={onCompositionStart}
                    onCompositionEnd={onCompositionEnd}
                    onKeyDown={(event) => {
                      onTabNavigation(event, '__draft__', 'subtitle');
                      onArrowNavigation(event, '__draft__', 'subtitle');
                      onDraftEnter(event);
                    }}
                    aria-label="New subtitle"
                    placeholder={!rows.length && !draftRow.word && !draftRow.subtitle ? 'Subtitle (optional)' : ''}
                  />
                </div>
              </td>
            </tr>
            {!rows.length ? (
            <tr className="sheet-hint-row">
              <td colSpan={2}>
              </td>
            </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
