import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type FocusEvent } from 'react';
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
    onDeleteRow
  } = props;
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [draftRow, setDraftRow] = useState({ word: '', subtitle: '' });
  const wordRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subtitleRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const draftWordRef = useRef<HTMLInputElement | null>(null);
  const draftSubtitleRef = useRef<HTMLInputElement | null>(null);
  const selectDebounceTimerRef = useRef<number | null>(null);
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

  function focusWordInput(rowId: string) {
    const input = rowId === '__draft__' ? draftWordRef.current : wordRefs.current[rowId];
    if (!input) {
      return;
    }
    input.focus();
    input.select();
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function focusInput(rowId: string, column: 'word' | 'subtitle') {
    let input: HTMLInputElement | null = null;
    if (rowId === '__draft__') {
      input = column === 'word' ? draftWordRef.current : draftSubtitleRef.current;
    } else {
      input = column === 'word' ? wordRefs.current[rowId] : subtitleRefs.current[rowId];
    }
    if (!input) {
      return;
    }
    input.focus();
    const length = input.value.length;
    if (document.activeElement === input) {
      input.setSelectionRange(length, length);
    }
    input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

  function onExistingRowEnter(event: KeyboardEvent<HTMLInputElement>, rowId: string) {
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    const rowIndex = rows.findIndex((item) => item.id === rowId);
    if (rowIndex < 0 || isRowEmpty(rows[rowIndex])) {
      return;
    }
    const nextRow = rows[rowIndex + 1];
    if (!nextRow) {
      scheduleSelectionCommit(undefined);
      focusWordInput('__draft__');
      return;
    }
    scheduleSelectionCommit(nextRow.id);
    focusWordInput(nextRow.id);
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

  function onArrowNavigation(event: KeyboardEvent<HTMLInputElement>, rowId: string, column: 'word' | 'subtitle') {
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
      focusInput(previousRowId, column);
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
      focusInput(nextRowId, column);
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

  function onDraftEnter(event: KeyboardEvent<HTMLInputElement>) {
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
    focusWordInput('__draft__');
  }

  return (
    <section className="panel data-panel">
      <h2>Word List</h2>
      <p>Type directly like a spreadsheet. Press Enter to move down. Image is edited in Selected Card Details.</p>
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

      <div className="list-table" role="region" aria-label="Rows list">
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
                      onKeyDown={(event) => {
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
                        onKeyDown={(event) => {
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
                  onKeyDown={(event) => {
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
                    onKeyDown={(event) => {
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
                  Press Enter to add a row. Empty rows are discarded when you leave them.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
