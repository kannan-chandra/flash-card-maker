import { useEffect, useRef, useState } from 'react';

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
    onApplySelectedImageUrl: (value?: string) => void;
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
  const urlInputRef = useRef<HTMLInputElement>(null);
  const applyAttemptIdRef = useRef(0);

  useEffect(() => {
    if (!showUrlInput) {
      return;
    }
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  }, [showUrlInput]);

  function tryApplyImageUrl(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'data:') {
      return;
    }

    const attemptId = applyAttemptIdRef.current + 1;
    applyAttemptIdRef.current = attemptId;
    const probe = new Image();
    probe.onload = () => {
      if (applyAttemptIdRef.current !== attemptId) {
        return;
      }
      onApplySelectedImageUrl(trimmed);
    };
    probe.onerror = () => {
      // Silent failure while user is still typing.
    };
    probe.src = trimmed;
  }

  return (
    <aside className="card-detail-panel">
      <div className="card-detail-heading">
        <h3>Image</h3>
        {selectedRowHasImage && !showUrlInput ? (
          <button type="button" className="danger subtle" onClick={onRemoveSelectedRowImage}>
            Remove image
          </button>
        ) : null}
      </div>
      {selectedRow ? (
        <div className="image-options">
          {showUrlInput ? (
            <div className="image-url-mode" id="selected-row-image-url">
              <button type="button" className="image-url-close" aria-label="Close URL upload" onClick={() => setShowUrlInput(false)}>
                X
              </button>
              <input
                ref={urlInputRef}
                className="image-url-input-active"
                value={imageUrlDraft}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  onImageUrlDraftChange(nextValue);
                  tryApplyImageUrl(nextValue);
                }}
                aria-label="Selected row image URL"
                placeholder="Paste image URL"
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text').trim();
                  if (!pasted) {
                    return;
                  }
                  event.preventDefault();
                  const input = event.currentTarget;
                  const selectionStart = input.selectionStart ?? 0;
                  const selectionEnd = input.selectionEnd ?? selectionStart;
                  const nextValue = `${imageUrlDraft.slice(0, selectionStart)}${pasted}${imageUrlDraft.slice(selectionEnd)}`;
                  onImageUrlDraftChange(nextValue);
                  tryApplyImageUrl(nextValue);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setShowUrlInput(false);
                    return;
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    onApplySelectedImageUrl(imageUrlDraft);
                  }
                }}
              />
            </div>
          ) : (
            <>
              <div className="image-actions-row">
                <button type="button" onClick={() => setShowUrlInput(true)} aria-expanded={showUrlInput} aria-controls="selected-row-image-url">
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
            </>
          )}
        </div>
      ) : (
        <p>Select a row from the list to edit details.</p>
      )}
    </aside>
  );
}
