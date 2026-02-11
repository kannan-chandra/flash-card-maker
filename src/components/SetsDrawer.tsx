import { useEffect, useRef, useState } from 'react';
import type { FlashcardSet } from '../types';
import { Drawer } from './ui/Drawer';
import { Modal } from './ui/Modal';
import { OverlayBackdrop } from './ui/OverlayBackdrop';

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
      <Drawer className="panel sets-drawer" isOpen={setsMenuOpen}>
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
                type="button"
                className="set-select"
                onClick={() => {
                  onSelectSet(setItem.id);
                  onClose();
                }}
              >
                <strong>{setItem.name}</strong>
                <span>{setItem.rows.length} rows</span>
              </button>
              <button type="button" className="set-delete-button" aria-label="Delete set" onClick={() => onDeleteSet(setItem.id)}>
                <span className="set-delete-icon" aria-hidden="true" />
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
      </Drawer>

      {createModalOpen && (
        <>
          <OverlayBackdrop className="menu-backdrop set-create-backdrop" onClick={closeCreateModal} ariaLabel="Close create set modal" />
          <Modal className="set-create-modal" ariaLabel="Create flash card set">
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
          </Modal>
        </>
      )}
    </>
  );
}
