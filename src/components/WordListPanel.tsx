import { useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { FlashcardRow, RowValidation } from '../types';

interface WordListPanelProps {
  rows: FlashcardRow[];
  validations: RowValidation[];
  imageIssues: Record<string, string>;
  selectedRowId?: string;
  onSelectRow: (rowId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<FlashcardRow>) => void;
  onAppendRow: (row: Pick<FlashcardRow, 'word' | 'subtitle'>) => void;
  onInsertRowAfter: (rowId: string) => string | undefined;
  onDeleteRow: (rowId: string) => void;
  onDraftRowChange: (row: Pick<FlashcardRow, 'word' | 'subtitle'>) => void;
}

export function WordListPanel(props: WordListPanelProps) {
  const {
    rows,
    validations,
    imageIssues,
    selectedRowId,
    onSelectRow,
    onUpdateRow,
    onAppendRow,
    onInsertRowAfter,
    onDeleteRow,
    onDraftRowChange
  } = props;
  const [draftRow, setDraftRow] = useState({ word: '', subtitle: '' });
  const listTableRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subtitleRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const draftRowRef = useRef<HTMLTableRowElement | null>(null);
  const draftWordRef = useRef<HTMLInputElement | null>(null);
  const draftSubtitleRef = useRef<HTMLInputElement | null>(null);
  const suppressNextEnterKeydownRef = useRef(false);
  const suppressNextEnterResetTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const pendingKeyboardActionRef = useRef<
    | { type: 'tab'; rowId: string; column: 'word' | 'subtitle'; shiftKey: boolean }
    | { type: 'existing-row-enter'; rowId: string }
    | { type: 'draft-enter' }
    | null
  >(null);
  const validationById = useMemo(
    () => Object.fromEntries(validations.map((item) => [item.rowId, item])),
    [validations]
  );

  useEffect(
    () => () => {
      if (suppressNextEnterResetTimerRef.current) {
        window.clearTimeout(suppressNextEnterResetTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedRowId) {
      return;
    }
    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement && listTableRef.current?.contains(activeElement) && activeElement.tagName === 'INPUT') {
      return;
    }
    const row = selectedRowId === '__draft__' ? draftRowRef.current : rowRefs.current[selectedRowId];
    if (!row) {
      return;
    }
    row.scrollIntoView({ block: 'nearest' });
    row.focus({ preventScroll: true });
  }, [selectedRowId, rows.length]);

  function updateDraftRow(updater: (current: { word: string; subtitle: string }) => { word: string; subtitle: string }) {
    setDraftRow((current) => {
      const next = updater(current);
      onDraftRowChange(next);
      return next;
    });
  }

  function commitSelectionNow(rowId: string | undefined) {
    if (!rowId) {
      return;
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
  ): boolean {
    let input: HTMLInputElement | null = null;
    if (rowId === '__draft__') {
      input = column === 'word' ? draftWordRef.current : draftSubtitleRef.current;
    } else {
      input = column === 'word' ? wordRefs.current[rowId] : subtitleRefs.current[rowId];
    }
    if (!input) {
      return false;
    }
    input.focus({ preventScroll: true });
    const length = input.value.length;
    if (document.activeElement === input) {
      input.setSelectionRange(length, length);
    }
    if (options?.arrowDirection) {
      scrollByOneRowIfNeeded(input, options.arrowDirection);
    }
    return true;
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

  function insertRowAfterAndFocus(rowId: string): boolean {
    const rowIndex = rows.findIndex((item) => item.id === rowId);
    if (rowIndex < 0 || isRowEmpty(rows[rowIndex])) {
      return false;
    }
    const insertedRowId = onInsertRowAfter(rowId);
    if (!insertedRowId) {
      return false;
    }
    commitSelectionNow(insertedRowId);
    const focusInsertedRow = (attempt: number) => {
      const focused = focusInput(insertedRowId, 'word', { arrowDirection: 'down' });
      if (!focused && attempt < 2) {
        requestAnimationFrame(() => {
          focusInsertedRow(attempt + 1);
        });
      }
    };
    requestAnimationFrame(() => {
      focusInsertedRow(0);
    });
    return true;
  }

  function submitDraftRowAndRefocus() {
    if (isRowEmpty(draftRow)) {
      return;
    }
    onAppendRow({
      word: draftRow.word,
      subtitle: draftRow.subtitle
    });
    const emptyDraft = { word: '', subtitle: '' };
    setDraftRow(emptyDraft);
    onDraftRowChange(emptyDraft);
    focusInput('__draft__', 'word', { arrowDirection: 'down' });
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
      commitSelectionNow(previousRowId);
      focusInput(previousRowId, column, { arrowDirection: 'up' });
      return;
    }

    if (event.key === 'ArrowDown') {
      if (currentIndex === rowsWithDraft.length - 1) {
        return;
      }
      event.preventDefault();
      const nextRowId = rowsWithDraft[currentIndex + 1];
      commitSelectionNow(nextRowId);
      focusInput(nextRowId, column, { arrowDirection: 'down' });
      return;
    }

    const target = event.currentTarget;
    if (event.key === 'ArrowLeft' && column === 'subtitle' && atStart(target)) {
      event.preventDefault();
      commitSelectionNow(rowId);
      focusInput(rowId, 'word');
      return;
    }

    if (event.key === 'ArrowRight' && column === 'word' && atEnd(target)) {
      event.preventDefault();
      commitSelectionNow(rowId);
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
        commitSelectionNow(rowId);
        focusInput(rowId, 'word');
        return true;
      }

      if (column === 'word' && currentIndex > 0) {
        const previousRowId = rowsWithDraft[currentIndex - 1];
        commitSelectionNow(previousRowId);
        focusInput(previousRowId, 'subtitle', { arrowDirection: 'up' });
        return true;
      }
      return false;
    }

    if (column === 'word') {
      commitSelectionNow(rowId);
      focusInput(rowId, 'subtitle');
      return true;
    }

    if (column === 'subtitle' && currentIndex < rowsWithDraft.length - 1) {
      const nextRowId = rowsWithDraft[currentIndex + 1];
      commitSelectionNow(nextRowId);
      focusInput(nextRowId, 'word', { arrowDirection: 'down' });
      return true;
    }
    return false;
  }

  function onCompositionStart() {
    isComposingRef.current = true;
  }

  function armSuppressNextEnterKeydown() {
    suppressNextEnterKeydownRef.current = true;
    if (suppressNextEnterResetTimerRef.current) {
      window.clearTimeout(suppressNextEnterResetTimerRef.current);
    }
    suppressNextEnterResetTimerRef.current = window.setTimeout(() => {
      suppressNextEnterKeydownRef.current = false;
      suppressNextEnterResetTimerRef.current = null;
    }, 200);
  }

  function consumeSuppressedEnterKeydown(): boolean {
    if (!suppressNextEnterKeydownRef.current) {
      return false;
    }
    suppressNextEnterKeydownRef.current = false;
    if (suppressNextEnterResetTimerRef.current) {
      window.clearTimeout(suppressNextEnterResetTimerRef.current);
      suppressNextEnterResetTimerRef.current = null;
    }
    return true;
  }

  function runKeyboardAction(action: NonNullable<typeof pendingKeyboardActionRef.current>) {
    if (action.type === 'tab') {
      runTabNavigation(action.rowId, action.column, action.shiftKey);
      return;
    }
    if (action.type === 'existing-row-enter') {
      insertRowAfterAndFocus(action.rowId);
      return;
    }
    submitDraftRowAndRefocus();
  }

  function isComposingEvent(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent;
    return isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229;
  }

  function onCompositionEnd() {
    isComposingRef.current = false;
    const pending = pendingKeyboardActionRef.current;
    if (!pending) {
      return;
    }
    pendingKeyboardActionRef.current = null;
    if (pending.type === 'existing-row-enter' || pending.type === 'draft-enter') {
      armSuppressNextEnterKeydown();
    }
    requestAnimationFrame(() => {
      runKeyboardAction(pending);
    });
  }

  function onTabNavigation(event: ReactKeyboardEvent<HTMLInputElement>, rowId: string, column: 'word' | 'subtitle') {
    if (event.key !== 'Tab') {
      return;
    }

    if (isComposingEvent(event)) {
      event.preventDefault();
      pendingKeyboardActionRef.current = { type: 'tab', rowId, column, shiftKey: event.shiftKey };
      return;
    }

    const isLastRowSubtitleTab = !event.shiftKey && column === 'subtitle' && rowId === rows[rows.length - 1]?.id;
    if (isLastRowSubtitleTab) {
      event.preventDefault();
      insertRowAfterAndFocus(rowId);
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
    const composing = isComposingEvent(event);
    if (!composing && consumeSuppressedEnterKeydown()) {
      event.preventDefault();
      return;
    }
    if (composing) {
      event.preventDefault();
      pendingKeyboardActionRef.current = { type: 'draft-enter' };
      return;
    }
    event.preventDefault();
    submitDraftRowAndRefocus();
  }

  function onExistingRowEnter(event: ReactKeyboardEvent<HTMLInputElement>, rowId: string) {
    if (event.key !== 'Enter') {
      return;
    }
    const composing = isComposingEvent(event);
    if (!composing && consumeSuppressedEnterKeydown()) {
      event.preventDefault();
      return;
    }
    if (composing) {
      event.preventDefault();
      pendingKeyboardActionRef.current = { type: 'existing-row-enter', rowId };
      return;
    }
    event.preventDefault();
    insertRowAfterAndFocus(rowId);
  }

  return (
    <section className="panel data-panel">
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
                  ref={(node) => {
                    rowRefs.current[row.id] = node;
                  }}
                  data-row-id={row.id}
                  tabIndex={-1}
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
                      onFocus={() => commitSelectionNow(row.id)}
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
                        onFocus={() => commitSelectionNow(row.id)}
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
            <tr
              ref={draftRowRef}
              data-row-id="__draft__"
              tabIndex={-1}
              className={`draft-row ${selectedRowId === '__draft__' ? 'selected' : ''}`.trim()}
              onClick={() => {
                commitSelectionNow('__draft__');
              }}
            >
              <td>
                <input
                  ref={draftWordRef}
                  data-row-id="__draft__"
                  value={draftRow.word}
                  onChange={(event) => updateDraftRow((current) => ({ ...current, word: event.target.value }))}
                  onFocus={() => commitSelectionNow('__draft__')}
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
                    onChange={(event) => updateDraftRow((current) => ({ ...current, subtitle: event.target.value }))}
                    onFocus={() => commitSelectionNow('__draft__')}
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
                <td colSpan={2}></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
