import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeNewSet, normalizeSet } from '../constants/project';
import { loadWorkspace, saveWorkspace } from '../storage';
import type { CardTemplate, FlashcardRow, FlashcardSet, TextElement } from '../types';

interface UseWorkspaceResult {
  sets: FlashcardSet[];
  activeSetId: string;
  loading: boolean;
  project: FlashcardSet | null;
  setActiveSetId: (setId: string) => void;
  createSet: (name: string) => void;
  deleteSet: (setId: string) => void;
  updateActiveSet: (updater: (current: FlashcardSet) => FlashcardSet) => void;
  patchTemplate: (patch: Partial<CardTemplate>) => void;
  patchTextElement: (id: 'text1' | 'text2', patch: Partial<TextElement>) => void;
  replaceRows: (rows: FlashcardRow[]) => void;
  appendRows: (rows: FlashcardRow[]) => void;
  updateRow: (rowId: string, patch: Partial<FlashcardRow>) => void;
}

export function useWorkspace(): UseWorkspaceResult {
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [activeSetId, setActiveSetId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  const project = useMemo(() => {
    return sets.find((setItem) => setItem.id === activeSetId) ?? sets[0] ?? null;
  }, [sets, activeSetId]);

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

  const updateActiveSet = useCallback(
    (updater: (current: FlashcardSet) => FlashcardSet) => {
      setSets((currentSets) =>
        currentSets.map((item) => {
          if (item.id !== activeSetId) {
            return item;
          }
          return normalizeSet({ ...updater(item), updatedAt: Date.now() });
        })
      );
    },
    [activeSetId]
  );

  const createSet = useCallback((name: string) => {
    setSets((currentSets) => {
      const nextSet = makeNewSet(name, currentSets.length + 1);
      setActiveSetId(nextSet.id);
      return [...currentSets, nextSet];
    });
  }, []);

  const deleteSet = useCallback(
    (setId: string) => {
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
    },
    [activeSetId]
  );

  const patchTemplate = useCallback(
    (patch: Partial<CardTemplate>) => {
      updateActiveSet((current) => ({
        ...current,
        template: {
          ...current.template,
          ...patch
        }
      }));
    },
    [updateActiveSet]
  );

  const patchTextElement = useCallback(
    (id: 'text1' | 'text2', patch: Partial<TextElement>) => {
      updateActiveSet((current) => ({
        ...current,
        template: {
          ...current.template,
          textElements: current.template.textElements.map((item) =>
            item.id === id ? { ...item, ...patch } : item
          ) as [TextElement, TextElement]
        }
      }));
    },
    [updateActiveSet]
  );

  const replaceRows = useCallback(
    (rows: FlashcardRow[]) => {
      updateActiveSet((current) => ({
        ...current,
        rows,
        selectedRowId: rows[0]?.id
      }));
    },
    [updateActiveSet]
  );

  const appendRows = useCallback(
    (rows: FlashcardRow[]) => {
      updateActiveSet((current) => ({
        ...current,
        rows: [...current.rows, ...rows],
        selectedRowId: current.selectedRowId ?? rows[0]?.id
      }));
    },
    [updateActiveSet]
  );

  const updateRow = useCallback(
    (rowId: string, patch: Partial<FlashcardRow>) => {
      updateActiveSet((current) => ({
        ...current,
        rows: current.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
      }));
    },
    [updateActiveSet]
  );

  return {
    sets,
    activeSetId,
    loading,
    project,
    setActiveSetId,
    createSet,
    deleteSet,
    updateActiveSet,
    patchTemplate,
    patchTextElement,
    replaceRows,
    appendRows,
    updateRow
  };
}
