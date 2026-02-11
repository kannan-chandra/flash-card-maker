import { useEffect, useRef, useState } from 'react';
import type { FlashcardSet } from '../types';

interface SetsDrawerProps {
  setsMenuOpen: boolean;
  sets: FlashcardSet[];
  activeSetId: string;
  onCreateSet: (name: string) => void;
  onSelectSet: (setId: string) => void;
  onDeleteSet: (setId: string) => void;
  onClose: () => void;
}

export function SetsDrawer(props: SetsDrawerProps) {
  const {
    setsMenuOpen,
    sets,
    activeSetId,
    onCreateSet,
    onSelectSet,
    onDeleteSet,
    onClose
  } = props;
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [draftSetName, setDraftSetName] = useState('');
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!createModalOpen) {
      return;
    }
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [createModalOpen]);

  function closeCreateModal() {
    setCreateModalOpen(false);
    setDraftSetName('');
  }

  function submitCreateSet() {
    const nextName = draftSetName.trim();
    if (!nextName) {
      return;
    }
    onCreateSet(nextName);
    closeCreateModal();
  }

  return (
    <>
      <aside className={`panel sets-drawer ${setsMenuOpen ? 'open' : ''}`} aria-hidden={!setsMenuOpen}>
        <div className="sets-drawer-header">
          <h2>Flash Card Sets</h2>
          <button type="button" className="sets-drawer-close" onClick={onClose} aria-label="Close sets menu">
            <span aria-hidden="true" />
          </button>
        </div>
        <div className="set-list">
          {sets.map((setItem) => (
            <div key={setItem.id} className={`set-item ${setItem.id === activeSetId ? 'active' : ''}`}>
              <button
                className="set-select"
                onClick={() => {
                  onSelectSet(setItem.id);
                  onClose();
                }}
              >
                <strong>{setItem.name}</strong>
                <span>{setItem.rows.length} rows</span>
              </button>
              <button className="danger" onClick={() => onDeleteSet(setItem.id)}>
                Delete
              </button>
            </div>
          ))}
          <button type="button" className="set-item set-create-item" onClick={() => setCreateModalOpen(true)}>
            <span className="set-create-icon" aria-hidden="true">
              +
            </span>
            <span>Create Flashcard Set</span>
          </button>
        </div>
      </aside>

      {createModalOpen && (
        <>
          <button type="button" className="menu-backdrop set-create-backdrop" onClick={closeCreateModal} aria-label="Close create set modal" />
          <div className="set-create-modal" role="dialog" aria-modal="true" aria-label="Create flash card set">
            <h3>Create Flashcard Set</h3>
            <label className="set-create-modal-label">
              Name
              <input
                ref={nameInputRef}
                type="text"
                value={draftSetName}
                onChange={(event) => setDraftSetName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitCreateSet();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeCreateModal();
                  }
                }}
                placeholder="My New Set"
                aria-label="Flash card set name"
              />
            </label>
            <div className="set-create-modal-actions">
              <button type="button" onClick={submitCreateSet} disabled={!draftSetName.trim()}>
                Create Set
              </button>
              <button type="button" onClick={closeCreateModal}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
