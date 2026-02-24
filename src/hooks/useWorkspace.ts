import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeNewSet, normalizeSet, patchTemplateForMode, patchTextElementForMode } from '../constants/project';
import { loadWorkspace, saveWorkspace } from '../storage';
import type { CardTemplate, FlashcardRow, FlashcardSet, TextElement } from '../types';

interface UseWorkspaceResult {
  sets: FlashcardSet[];
  activeSetId: string;
  loading: boolean;
  project: FlashcardSet | null;
  setActiveSetId: (setId: string) => void;
  createSet: (name: string) => void;
  renameSet: (setId: string, name: string) => void;
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

  const normalizedActiveSetId = useMemo(() => {
    if (!sets.length) {
      return '';
    }
    if (sets.some((setItem) => setItem.id === activeSetId)) {
      return activeSetId;
    }
    return sets[0].id;
  }, [activeSetId, sets]);

  const project = useMemo(() => {
    return sets.find((setItem) => setItem.id === normalizedActiveSetId) ?? null;
  }, [normalizedActiveSetId, sets]);

  useEffect(() => {
    let cancelled = false;
    loadWorkspace().then((saved) => {
      if (cancelled) {
        return;
      }
      if (saved?.sets.length) {
        const normalizedSets = saved.sets.map(normalizeSet);
        const nextActiveSetId = normalizedSets.some((setItem) => setItem.id === saved.activeSetId) ? saved.activeSetId : normalizedSets[0].id;
        setSets(normalizedSets);
        setActiveSetId(nextActiveSetId);
      } else {
        const firstSet = makeNewSet('Set 1', 1);
        setSets([firstSet]);
        setActiveSetId(firstSet.id);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || !sets.length || !normalizedActiveSetId) {
      return;
    }
    const nextSets = sets.map((item) => (item.id === normalizedActiveSetId ? { ...item, updatedAt: Date.now() } : item));
    saveWorkspace({
      sets: nextSets,
      activeSetId: normalizedActiveSetId,
      updatedAt: Date.now()
    });
  }, [sets, normalizedActiveSetId, loading]);

  const updateActiveSet = useCallback(
    (updater: (current: FlashcardSet) => FlashcardSet) => {
      setSets((currentSets) =>
        currentSets.map((item) => {
          if (item.id !== normalizedActiveSetId) {
            return item;
          }
          return normalizeSet({ ...updater(item), updatedAt: Date.now() });
        })
      );
    },
    [normalizedActiveSetId]
  );

  const createSet = useCallback(
    (name: string) => {
      const nextSet = makeNewSet(name, sets.length + 1);
      setSets((currentSets) => [...currentSets, nextSet]);
      setActiveSetId(nextSet.id);
    },
    [sets.length]
  );

  const deleteSet = useCallback(
    (setId: string) => {
      setSets((currentSets) => {
        const remaining = currentSets.filter((item) => item.id !== setId);
        if (!remaining.length) {
          const fallback = makeNewSet('Set 1', 1);
          setActiveSetId(fallback.id);
          return [fallback];
        }
        if (setId === normalizedActiveSetId) {
          setActiveSetId(remaining[0].id);
        }
        return remaining;
      });
    },
    [normalizedActiveSetId]
  );

  const renameSet = useCallback((setId: string, name: string) => {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }
    setSets((currentSets) => currentSets.map((item) => (item.id === setId ? { ...item, name: nextName, updatedAt: Date.now() } : item)));
  }, []);

  const patchTemplate = useCallback(
    (patch: Partial<CardTemplate>) => {
      updateActiveSet((current) => patchTemplateForMode(current, patch));
    },
    [updateActiveSet]
  );

  const patchTextElement = useCallback(
    (id: 'text1' | 'text2', patch: Partial<TextElement>) => {
      updateActiveSet((current) => patchTextElementForMode(current, id, patch));
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
    activeSetId: normalizedActiveSetId,
    loading,
    project,
    setActiveSetId,
    createSet,
    renameSet,
    deleteSet,
    updateActiveSet,
    patchTemplate,
    patchTextElement,
    replaceRows,
    appendRows,
    updateRow
  };
}
