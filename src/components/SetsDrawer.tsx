import type { FlashcardSet } from '../types';

interface SetsDrawerProps {
  setsMenuOpen: boolean;
  sets: FlashcardSet[];
  activeSetId: string;
  onCreateSet: () => void;
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

  return (
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
        <button type="button" className="set-item set-create-item" onClick={onCreateSet}>
          <span className="set-create-icon" aria-hidden="true">
            +
          </span>
          <span>Create Flashcard Set</span>
        </button>
      </div>
    </aside>
  );
}
