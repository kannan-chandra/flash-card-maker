import type { FlashcardSet } from '../types';

interface SetsDrawerProps {
  setsMenuOpen: boolean;
  newSetName: string;
  sets: FlashcardSet[];
  activeSetId: string;
  onNewSetNameChange: (value: string) => void;
  onCreateSet: () => void;
  onSelectSet: (setId: string) => void;
  onDeleteSet: (setId: string) => void;
  onClose: () => void;
}

export function SetsDrawer(props: SetsDrawerProps) {
  const {
    setsMenuOpen,
    newSetName,
    sets,
    activeSetId,
    onNewSetNameChange,
    onCreateSet,
    onSelectSet,
    onDeleteSet,
    onClose
  } = props;

  return (
    <aside className={`panel sets-drawer ${setsMenuOpen ? 'open' : ''}`} aria-hidden={!setsMenuOpen}>
      <div className="sets-drawer-header">
        <h2>Flash Card Sets</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p>Browse and switch between locally stored sets.</p>
      <div className="set-create">
        <input
          value={newSetName}
          onChange={(event) => onNewSetNameChange(event.target.value)}
          placeholder="New set name"
          aria-label="New set name"
        />
        <button onClick={onCreateSet}>Create Set</button>
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
      </div>
    </aside>
  );
}
