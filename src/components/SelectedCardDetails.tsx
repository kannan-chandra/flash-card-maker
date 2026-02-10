import type { DragEvent } from 'react';

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
    onUpdateRow: (rowId: string, patch: Partial<SelectedRowData> & { imageUrl?: string }) => void;
    onImageUrlDraftChange: (value: string) => void;
    onApplySelectedImageUrl: () => void;
    onSelectedRowImageDrop: (event: DragEvent<HTMLDivElement>) => void;
    onSelectedRowImageUpload: (file: File) => void;
    onApplyEmoji: (rowId: string, emoji: string) => void;
    onRemoveSelectedRowImage: () => void;
  };
}

export function SelectedCardDetails(props: SelectedCardDetailsProps) {
  const { data, actions } = props;
  const { selectedRow, selectedRowHasImage, imageUrlDraft, selectedRowEmojiMatches } = data;
  const {
    onUpdateRow,
    onImageUrlDraftChange,
    onApplySelectedImageUrl,
    onSelectedRowImageDrop,
    onSelectedRowImageUpload,
    onApplyEmoji,
    onRemoveSelectedRowImage
  } = actions;

  return (
    <aside className="card-detail-panel">
      <h3>Image</h3>
      {selectedRow ? (
        <>
          {selectedRowHasImage ? (
            <div className="image-selected-state">
              <p>Image is set for this row.</p>
              <button type="button" className="danger" onClick={onRemoveSelectedRowImage}>
                Remove image
              </button>
            </div>
          ) : (
            <div className="image-options">
              <label>
                Image URL
                <input
                  value={imageUrlDraft}
                  onChange={(event) => onImageUrlDraftChange(event.target.value)}
                  aria-label="Selected row image URL"
                  placeholder="https://..."
                />
              </label>
              <button type="button" onClick={onApplySelectedImageUrl} disabled={!imageUrlDraft.trim()}>
                Set image from URL
              </button>
              <div
                className="drop-zone large"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => void onSelectedRowImageDrop(event)}
              >
                Drop image here
              </div>
              <label>
                Upload local image
                <input
                  type="file"
                  accept="image/*"
                  aria-label="Selected row image upload"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onSelectedRowImageUpload(file);
                    }
                  }}
                />
              </label>

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
          )}
        </>
      ) : (
        <p>Select a row from the list to edit details.</p>
      )}
    </aside>
  );
}
