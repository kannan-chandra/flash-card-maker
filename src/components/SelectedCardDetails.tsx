import { useRef, useState } from 'react';

interface EmojiMatch {
  emoji: string;
  keywords: string[];
}

interface SelectedRowData {
  id: string;
}

interface SelectedCardDetailsProps {
  data: {
    selectedRow?: SelectedRowData;
    selectedRowHasImage: boolean;
    imageUrlDraft: string;
    selectedRowEmojiMatches: EmojiMatch[];
  };
  actions: {
    onImageUrlDraftChange: (value: string) => void;
    onApplySelectedImageUrl: () => void;
    onSelectedRowImageUpload: (file: File) => void;
    onApplyEmoji: (rowId: string, emoji: string) => void;
    onRemoveSelectedRowImage: () => void;
  };
}

export function SelectedCardDetails(props: SelectedCardDetailsProps) {
  const { data, actions } = props;
  const { selectedRow, selectedRowHasImage, imageUrlDraft, selectedRowEmojiMatches } = data;
  const { onImageUrlDraftChange, onApplySelectedImageUrl, onSelectedRowImageUpload, onApplyEmoji, onRemoveSelectedRowImage } = actions;
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside className="card-detail-panel">
      <div className="card-detail-heading">
        <h3>Image</h3>
        {selectedRowHasImage ? (
          <button type="button" className="danger subtle" onClick={onRemoveSelectedRowImage}>
            Remove image
          </button>
        ) : null}
      </div>
      {selectedRow ? (
        <div className="image-options">
          <div className="image-actions-row">
            <button
              type="button"
              onClick={() => setShowUrlInput((current) => !current)}
              aria-expanded={showUrlInput}
              aria-controls="selected-row-image-url"
            >
              Upload with URL
            </button>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              Upload Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              aria-label="Selected row image upload"
              className="visually-hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  onSelectedRowImageUpload(file);
                  event.target.value = '';
                }
              }}
            />
          </div>
          {showUrlInput ? (
            <div className="image-url-inline" id="selected-row-image-url">
              <input
                value={imageUrlDraft}
                onChange={(event) => onImageUrlDraftChange(event.target.value)}
                aria-label="Selected row image URL"
                placeholder="Paste image URL"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onApplySelectedImageUrl();
                  }
                }}
              />
              <button type="button" onClick={onApplySelectedImageUrl} disabled={!imageUrlDraft.trim()}>
                Apply
              </button>
            </div>
          ) : null}
          <div className="emoji-options">
            <p>Emoji choices</p>
            {selectedRowEmojiMatches.length > 0 ? (
              <div className="emoji-grid">
                {selectedRowEmojiMatches.map((match) => (
                  <button
                    type="button"
                    key={match.emoji}
                    className="emoji-choice"
                    aria-label={`Use emoji ${match.emoji}`}
                    title={`Keywords: ${match.keywords.join(', ')}`}
                    onClick={() => onApplyEmoji(selectedRow.id, match.emoji)}
                  >
                    {match.emoji}
                  </button>
                ))}
              </div>
            ) : (
              <p className="hint">No emoji matches found for this word.</p>
            )}
          </div>
        </div>
      ) : (
        <p>Select a row from the list to edit details.</p>
      )}
    </aside>
  );
}
