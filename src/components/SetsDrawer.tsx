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
                <svg className="set-delete-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M9 3.75A2.25 2.25 0 0 0 6.75 6H4.5a.75.75 0 0 0 0 1.5h.69l.91 11.84A2.25 2.25 0 0 0 8.34 21h7.32a2.25 2.25 0 0 0 2.24-1.66l.91-11.84h.69a.75.75 0 0 0 0-1.5h-2.25A2.25 2.25 0 0 0 15 3.75H9Zm6.75 2.25H8.25A.75.75 0 0 1 9 5.25h6a.75.75 0 0 1 .75.75ZM9.53 9.47a.75.75 0 1 0-1.06 1.06l.94.94-.94.94a.75.75 0 1 0 1.06 1.06l.94-.94.94.94a.75.75 0 0 0 1.06-1.06l-.94-.94.94-.94a.75.75 0 1 0-1.06-1.06l-.94.94-.94-.94Zm4.94 0a.75.75 0 1 0-1.06 1.06l.94.94-.94.94a.75.75 0 1 0 1.06 1.06l.94-.94.94.94a.75.75 0 1 0 1.06-1.06l-.94-.94.94-.94a.75.75 0 1 0-1.06-1.06l-.94.94-.94-.94Z"
                  />
                </svg>
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
