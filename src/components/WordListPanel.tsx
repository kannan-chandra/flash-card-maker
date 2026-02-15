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
    onDeleteRow
  } = props;
  const [draftRow, setDraftRow] = useState({ word: '', subtitle: '' });
  const listTableRef = useRef<HTMLDivElement | null>(null);
  const wordRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subtitleRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const draftWordRef = useRef<HTMLInputElement | null>(null);
  const draftSubtitleRef = useRef<HTMLInputElement | null>(null);
  const pendingFocusRef = useRef<{ rowId: string; column: 'word' | 'subtitle'; arrowDirection?: 'up' | 'down' } | null>(null);
  const navigationTxnRef = useRef<{
    kind: 'enter' | 'tab';
    sourceRowId: string;
    sourceColumn: 'word' | 'subtitle';
    targetRowId: string;
    targetColumn: 'word' | 'subtitle';
    startedAt: number;
    expiresAt: number;
  } | null>(null);
  const navigationTxnTimerRef = useRef<number | null>(null);
  const recentInsertedRowFocusRef = useRef<{ rowId: string; expiresAt: number } | null>(null);
  const lastHandledEnterRef = useRef<{ rowId: string; column: 'word' | 'subtitle'; at: number } | null>(null);
  const suppressTabAfterEnterRef = useRef<{ rowId: string; column: 'word' | 'subtitle'; expiresAt: number } | null>(null);
  const selectDebounceTimerRef = useRef<number | null>(null);
  const suppressNextEnterKeydownRef = useRef(false);
  const suppressNextEnterResetTimerRef = useRef<number | null>(null);
  const isComposingRef = useRef(false);
  const pendingKeyboardActionRef = useRef<
    | { type: 'tab'; rowId: string; column: 'word' | 'subtitle'; shiftKey: boolean }
    | { type: 'existing-row-enter'; rowId: string; column: 'word' | 'subtitle' }
    | { type: 'draft-enter'; column: 'word' | 'subtitle' }
    | null
  >(null);
  const validationById = useMemo(
    () => Object.fromEntries(validations.map((item) => [item.rowId, item])),
    [validations]
  );

  function debugLog(message: string, payload: Record<string, unknown>) {
    console.log(`[wordlist-debug] ${message}`, payload);
  }

  function getCursorInfo(input: HTMLInputElement | null) {
    if (!input) {
      return { selectionStart: null, selectionEnd: null, valueLength: null };
    }
    return {
      selectionStart: input.selectionStart,
      selectionEnd: input.selectionEnd,
      valueLength: input.value.length
    };
  }

  function describeElement(element: Element | null) {
    if (!(element instanceof HTMLInputElement)) {
      return { rowId: null, column: null };
    }
    return {
      rowId: element.getAttribute('data-row-id'),
      column: element.getAttribute('data-column')
    };
  }

  function readColumn(value: string | null): 'word' | 'subtitle' | null {
    return value === 'word' || value === 'subtitle' ? value : null;
  }

  function clearNavigationTxn(reason: string) {
    const txn = navigationTxnRef.current;
    if (!txn) {
      return;
    }
    debugLog('txn cleared', {
      reason,
      kind: txn.kind,
      source: { rowId: txn.sourceRowId, column: txn.sourceColumn },
      target: { rowId: txn.targetRowId, column: txn.targetColumn }
    });
    navigationTxnRef.current = null;
    if (navigationTxnTimerRef.current) {
      window.clearTimeout(navigationTxnTimerRef.current);
      navigationTxnTimerRef.current = null;
    }
  }

  function startNavigationTxn(
    kind: 'enter' | 'tab',
    source: { rowId: string; column: 'word' | 'subtitle' },
    target: { rowId: string; column: 'word' | 'subtitle' }
  ) {
    clearNavigationTxn('replaced');
    navigationTxnRef.current = {
      kind,
      sourceRowId: source.rowId,
      sourceColumn: source.column,
      targetRowId: target.rowId,
      targetColumn: target.column,
      startedAt: performance.now(),
      expiresAt: performance.now() + 450
    };
    debugLog('txn started', { kind, source, target });
    navigationTxnTimerRef.current = window.setTimeout(() => {
      clearNavigationTxn('timeout');
    }, 500);
  }

  function activeNavigationTxn() {
    const txn = navigationTxnRef.current;
    if (!txn) {
      return null;
    }
    if (performance.now() > txn.expiresAt) {
      clearNavigationTxn('expired');
      return null;
    }
    return txn;
  }

  function shouldBlockKeyForTxn(key: string, rowId: string, column: 'word' | 'subtitle'): boolean {
    if (key !== 'Enter' && key !== 'Tab') {
      return false;
    }
    const txn = activeNavigationTxn();
    if (!txn) {
      return false;
    }
    if (txn.sourceRowId !== rowId || txn.sourceColumn !== column) {
      return false;
    }
    debugLog('key blocked by txn', {
      key,
      rowId,
      column,
      txnKind: txn.kind,
      target: { rowId: txn.targetRowId, column: txn.targetColumn }
    });
    return true;
  }

  function completeNavigationTxnIfTarget(rowId: string, column: 'word' | 'subtitle') {
    const txn = activeNavigationTxn();
    if (!txn) {
      return;
    }
    if (txn.targetRowId === rowId && txn.targetColumn === column) {
      clearNavigationTxn('target-focused');
    }
  }

  useEffect(
    () => () => {
      if (selectDebounceTimerRef.current) {
        window.clearTimeout(selectDebounceTimerRef.current);
      }
      if (suppressNextEnterResetTimerRef.current) {
        window.clearTimeout(suppressNextEnterResetTimerRef.current);
      }
      if (navigationTxnTimerRef.current) {
        window.clearTimeout(navigationTxnTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) {
      return;
    }
    if (focusInput(pending.rowId, pending.column, { arrowDirection: pending.arrowDirection })) {
      pendingFocusRef.current = null;
    }
  }, [rows]);

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
  ): boolean {
    let input: HTMLInputElement | null = null;
    if (rowId === '__draft__') {
      input = column === 'word' ? draftWordRef.current : draftSubtitleRef.current;
    } else {
      input = column === 'word' ? wordRefs.current[rowId] : subtitleRefs.current[rowId];
    }
    if (!input) {
      debugLog('focusInput missing target', { rowId, column, arrowDirection: options?.arrowDirection ?? null });
      return false;
    }
    debugLog('focusInput before focus', {
      rowId,
      column,
      arrowDirection: options?.arrowDirection ?? null,
      ...getCursorInfo(input),
      activeElement: describeElement(document.activeElement)
    });
    input.focus({ preventScroll: true });
    const length = input.value.length;
    if (document.activeElement === input) {
      input.setSelectionRange(length, length);
    }
    if (options?.arrowDirection) {
      scrollByOneRowIfNeeded(input, options.arrowDirection);
    }
    debugLog('focusInput after focus', {
      rowId,
      column,
      arrowDirection: options?.arrowDirection ?? null,
      ...getCursorInfo(input),
      activeElement: describeElement(document.activeElement)
    });
    return true;
  }

  function isRowEmpty(row: Pick<FlashcardRow, 'word' | 'subtitle'>): boolean {
    return !row.word.trim() && !row.subtitle.trim();
  }

  function onRowBlur(rowId: string, event: FocusEvent<HTMLInputElement>) {
    const nextTarget = event.relatedTarget as HTMLElement | null;
    const nextRowId = nextTarget?.getAttribute('data-row-id');
    const blurredColumn = readColumn(event.currentTarget.getAttribute('data-column'));
    const txn = activeNavigationTxn();
    if (txn && txn.targetRowId === rowId && txn.targetColumn === blurredColumn && !nextRowId) {
      debugLog('txn target blurred without related target', {
        rowId,
        column: blurredColumn
      });
      requestAnimationFrame(() => {
        focusInput(txn.targetRowId, txn.targetColumn);
      });
      return;
    }
    const recentInserted = recentInsertedRowFocusRef.current;
    if (!nextRowId && recentInserted?.rowId === rowId && Date.now() < recentInserted.expiresAt) {
      debugLog('blur recovered inserted-row focus', {
        rowId,
        column: event.currentTarget.getAttribute('data-column'),
        relatedTarget: describeElement(nextTarget)
      });
      requestAnimationFrame(() => {
        focusInput(rowId, 'word');
      });
      return;
    }
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

  function insertRowAfterAndFocus(
    rowId: string,
    sourceColumn: 'word' | 'subtitle',
    kind: 'enter' | 'tab'
  ): boolean {
    const rowIndex = rows.findIndex((item) => item.id === rowId);
    if (rowIndex < 0 || isRowEmpty(rows[rowIndex])) {
      return false;
    }
    const insertedRowId = onInsertRowAfter(rowId);
    if (!insertedRowId) {
      return false;
    }
    startNavigationTxn(kind, { rowId, column: sourceColumn }, { rowId: insertedRowId, column: 'word' });
    scheduleSelectionCommit(insertedRowId);
    pendingFocusRef.current = { rowId: insertedRowId, column: 'word', arrowDirection: 'down' };
    recentInsertedRowFocusRef.current = {
      rowId: insertedRowId,
      expiresAt: Date.now() + 400
    };
    requestAnimationFrame(() => {
      const pending = pendingFocusRef.current;
      if (!pending) {
        return;
      }
      if (focusInput(pending.rowId, pending.column, { arrowDirection: pending.arrowDirection })) {
        pendingFocusRef.current = null;
      }
    });
    return true;
  }

  function submitDraftRowAndRefocus(sourceColumn: 'word' | 'subtitle') {
    if (isRowEmpty(draftRow)) {
      return;
    }
    startNavigationTxn('enter', { rowId: '__draft__', column: sourceColumn }, { rowId: '__draft__', column: 'word' });
    onAppendRow({
      word: draftRow.word,
      subtitle: draftRow.subtitle
    });
    setDraftRow({ word: '', subtitle: '' });
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

  function getTabNavigationTarget(
    rowId: string,
    column: 'word' | 'subtitle',
    shiftKey: boolean
  ): { rowId: string; column: 'word' | 'subtitle' } | null {
    const rowsWithDraft = [...rows.map((row) => row.id), '__draft__'];
    const currentIndex = rowsWithDraft.indexOf(rowId);
    if (currentIndex < 0) {
      return null;
    }

    if (shiftKey) {
      if (column === 'subtitle') {
        return { rowId, column: 'word' };
      }
      if (column === 'word' && currentIndex > 0) {
        return { rowId: rowsWithDraft[currentIndex - 1], column: 'subtitle' };
      }
      return null;
    }

    if (column === 'word') {
      return { rowId, column: 'subtitle' };
    }

    if (column === 'subtitle' && currentIndex < rowsWithDraft.length - 1) {
      return { rowId: rowsWithDraft[currentIndex + 1], column: 'word' };
    }
    return null;
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
    debugLog('compositionstart', { activeElement: describeElement(document.activeElement) });
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
      insertRowAfterAndFocus(action.rowId, action.column, 'enter');
      return;
    }
    submitDraftRowAndRefocus(action.column);
  }

  function isComposingEvent(event: ReactKeyboardEvent<HTMLInputElement>): boolean {
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent;
    return isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229;
  }

  function onCompositionEnd() {
    isComposingRef.current = false;
    debugLog('compositionend', {
      pendingAction: pendingKeyboardActionRef.current?.type ?? null,
      activeElement: describeElement(document.activeElement)
    });
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

  function shouldIgnoreDuplicateEnter(rowId: string, column: 'word' | 'subtitle'): boolean {
    const last = lastHandledEnterRef.current;
    const now = performance.now();
    if (last && last.rowId === rowId && last.column === column && now - last.at < 160) {
      return true;
    }
    lastHandledEnterRef.current = { rowId, column, at: now };
    return false;
  }

  function armTabSuppressionAfterEnter(rowId: string, column: 'word' | 'subtitle') {
    suppressTabAfterEnterRef.current = {
      rowId,
      column,
      expiresAt: Date.now() + 280
    };
  }

  function onTabNavigation(event: ReactKeyboardEvent<HTMLInputElement>, rowId: string, column: 'word' | 'subtitle') {
    if (event.key !== 'Tab') {
      return;
    }
    if (shouldBlockKeyForTxn('Tab', rowId, column)) {
      event.preventDefault();
      return;
    }
    const suppressedTab = suppressTabAfterEnterRef.current;
    if (suppressedTab && suppressedTab.rowId === rowId && suppressedTab.column === column && Date.now() < suppressedTab.expiresAt) {
      debugLog('tab suppressed after enter', { rowId, column });
      event.preventDefault();
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
      insertRowAfterAndFocus(rowId, column, 'tab');
      return;
    }

    const target = getTabNavigationTarget(rowId, column, event.shiftKey);
    if (target) {
      startNavigationTxn('tab', { rowId, column }, target);
    }
    if (target && runTabNavigation(rowId, column, event.shiftKey)) {
      event.preventDefault();
      return;
    }
    if (target) {
      clearNavigationTxn('tab-navigation-failed');
    }
  }

  function onDraftEnter(event: ReactKeyboardEvent<HTMLInputElement>, column: 'word' | 'subtitle') {
    if (event.key !== 'Enter') {
      return;
    }
    if (shouldBlockKeyForTxn('Enter', '__draft__', column)) {
      event.preventDefault();
      return;
    }
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    if (shouldIgnoreDuplicateEnter('__draft__', column)) {
      debugLog('enter deduped', { rowId: '__draft__', column });
      event.preventDefault();
      return;
    }
    const composing = isComposingEvent(event);
    if (!composing && consumeSuppressedEnterKeydown()) {
      event.preventDefault();
      return;
    }
    if (composing) {
      event.preventDefault();
      pendingKeyboardActionRef.current = { type: 'draft-enter', column };
      return;
    }
    event.preventDefault();
    armSuppressNextEnterKeydown();
    armTabSuppressionAfterEnter('__draft__', column);
    submitDraftRowAndRefocus(column);
  }

  function onExistingRowEnter(event: ReactKeyboardEvent<HTMLInputElement>, rowId: string, column: 'word' | 'subtitle') {
    if (event.key !== 'Enter') {
      return;
    }
    if (shouldBlockKeyForTxn('Enter', rowId, column)) {
      event.preventDefault();
      return;
    }
    if (event.repeat) {
      event.preventDefault();
      return;
    }
    if (shouldIgnoreDuplicateEnter(rowId, column)) {
      debugLog('enter deduped', { rowId, column });
      event.preventDefault();
      return;
    }
    const composing = isComposingEvent(event);
    if (!composing && consumeSuppressedEnterKeydown()) {
      event.preventDefault();
      return;
    }
    if (composing) {
      event.preventDefault();
      pendingKeyboardActionRef.current = { type: 'existing-row-enter', rowId, column };
      return;
    }
    event.preventDefault();
    armSuppressNextEnterKeydown();
    armTabSuppressionAfterEnter(rowId, column);
    insertRowAfterAndFocus(rowId, column, 'enter');
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
                      onFocus={(event) => {
                        completeNavigationTxnIfTarget(row.id, 'word');
                        debugLog('focus', {
                          rowId: row.id,
                          column: 'word',
                          ...getCursorInfo(event.currentTarget),
                          activeElement: describeElement(document.activeElement)
                        });
                        scheduleSelectionCommit(row.id);
                      }}
                      onBlur={(event) => {
                        debugLog('blur', {
                          rowId: row.id,
                          column: 'word',
                          ...getCursorInfo(event.currentTarget),
                          relatedTarget: describeElement(event.relatedTarget as Element | null)
                        });
                        onRowBlur(row.id, event);
                      }}
                      onCompositionStart={onCompositionStart}
                      onCompositionEnd={onCompositionEnd}
                      onKeyDown={(event) => {
                        debugLog('keydown', {
                          rowId: row.id,
                          column: 'word',
                          key: event.key,
                          code: event.code,
                          repeat: event.repeat,
                          shiftKey: event.shiftKey,
                          ctrlKey: event.ctrlKey,
                          altKey: event.altKey,
                          metaKey: event.metaKey,
                          nativeIsComposing: (event.nativeEvent as globalThis.KeyboardEvent).isComposing,
                          keyCode: (event.nativeEvent as globalThis.KeyboardEvent).keyCode,
                          internalComposing: isComposingRef.current,
                          ...getCursorInfo(event.currentTarget)
                        });
                        onTabNavigation(event, row.id, 'word');
                        onArrowNavigation(event, row.id, 'word');
                        onExistingRowEnter(event, row.id, 'word');
                      }}
                      data-column="word"
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
                        onFocus={(event) => {
                          completeNavigationTxnIfTarget(row.id, 'subtitle');
                          debugLog('focus', {
                            rowId: row.id,
                            column: 'subtitle',
                            ...getCursorInfo(event.currentTarget),
                            activeElement: describeElement(document.activeElement)
                          });
                          scheduleSelectionCommit(row.id);
                        }}
                        onBlur={(event) => {
                          debugLog('blur', {
                            rowId: row.id,
                            column: 'subtitle',
                            ...getCursorInfo(event.currentTarget),
                            relatedTarget: describeElement(event.relatedTarget as Element | null)
                          });
                          onRowBlur(row.id, event);
                        }}
                        onCompositionStart={onCompositionStart}
                        onCompositionEnd={onCompositionEnd}
                        onKeyDown={(event) => {
                          debugLog('keydown', {
                            rowId: row.id,
                            column: 'subtitle',
                            key: event.key,
                            code: event.code,
                            repeat: event.repeat,
                            shiftKey: event.shiftKey,
                            ctrlKey: event.ctrlKey,
                            altKey: event.altKey,
                            metaKey: event.metaKey,
                            nativeIsComposing: (event.nativeEvent as globalThis.KeyboardEvent).isComposing,
                            keyCode: (event.nativeEvent as globalThis.KeyboardEvent).keyCode,
                            internalComposing: isComposingRef.current,
                            ...getCursorInfo(event.currentTarget)
                          });
                          onTabNavigation(event, row.id, 'subtitle');
                          onArrowNavigation(event, row.id, 'subtitle');
                          onExistingRowEnter(event, row.id, 'subtitle');
                        }}
                        data-column="subtitle"
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
                  onFocus={(event) => {
                    completeNavigationTxnIfTarget('__draft__', 'word');
                    debugLog('focus', {
                      rowId: '__draft__',
                      column: 'word',
                      ...getCursorInfo(event.currentTarget),
                      activeElement: describeElement(document.activeElement)
                    });
                  }}
                  onBlur={(event) => {
                    debugLog('blur', {
                      rowId: '__draft__',
                      column: 'word',
                      ...getCursorInfo(event.currentTarget),
                      relatedTarget: describeElement(event.relatedTarget as Element | null)
                    });
                  }}
                  onCompositionStart={onCompositionStart}
                  onCompositionEnd={onCompositionEnd}
                  onKeyDown={(event) => {
                    debugLog('keydown', {
                      rowId: '__draft__',
                      column: 'word',
                      key: event.key,
                      code: event.code,
                      repeat: event.repeat,
                      shiftKey: event.shiftKey,
                      ctrlKey: event.ctrlKey,
                      altKey: event.altKey,
                      metaKey: event.metaKey,
                      nativeIsComposing: (event.nativeEvent as globalThis.KeyboardEvent).isComposing,
                      keyCode: (event.nativeEvent as globalThis.KeyboardEvent).keyCode,
                      internalComposing: isComposingRef.current,
                      ...getCursorInfo(event.currentTarget)
                    });
                    onTabNavigation(event, '__draft__', 'word');
                    onArrowNavigation(event, '__draft__', 'word');
                    onDraftEnter(event, 'word');
                  }}
                  data-column="word"
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
                    onFocus={(event) => {
                      completeNavigationTxnIfTarget('__draft__', 'subtitle');
                      debugLog('focus', {
                        rowId: '__draft__',
                        column: 'subtitle',
                        ...getCursorInfo(event.currentTarget),
                        activeElement: describeElement(document.activeElement)
                      });
                    }}
                    onBlur={(event) => {
                      debugLog('blur', {
                        rowId: '__draft__',
                        column: 'subtitle',
                        ...getCursorInfo(event.currentTarget),
                        relatedTarget: describeElement(event.relatedTarget as Element | null)
                      });
                    }}
                    onCompositionStart={onCompositionStart}
                    onCompositionEnd={onCompositionEnd}
                    onKeyDown={(event) => {
                      debugLog('keydown', {
                        rowId: '__draft__',
                        column: 'subtitle',
                        key: event.key,
                        code: event.code,
                        repeat: event.repeat,
                        shiftKey: event.shiftKey,
                        ctrlKey: event.ctrlKey,
                        altKey: event.altKey,
                        metaKey: event.metaKey,
                        nativeIsComposing: (event.nativeEvent as globalThis.KeyboardEvent).isComposing,
                        keyCode: (event.nativeEvent as globalThis.KeyboardEvent).keyCode,
                        internalComposing: isComposingRef.current,
                        ...getCursorInfo(event.currentTarget)
                      });
                      onTabNavigation(event, '__draft__', 'subtitle');
                      onArrowNavigation(event, '__draft__', 'subtitle');
                      onDraftEnter(event, 'subtitle');
                    }}
                    data-column="subtitle"
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
