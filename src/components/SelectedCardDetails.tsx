import { useEffect, useMemo, useRef, useState } from 'react';
import { searchAllEmojis } from '../utils/emoji';

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
    showUseEmojiForAll: boolean;
  };
  actions: {
    onImageUrlDraftChange: (value: string) => void;
    onApplySelectedImageUrl: (value?: string) => void;
    onSelectedRowImageUpload: (file: File) => void;
    onApplyEmoji: (rowId: string, emoji: string) => void;
    onRemoveSelectedRowImage: () => void;
    onUseEmojiForAllWords: () => void;
  };
}

export function SelectedCardDetails(props: SelectedCardDetailsProps) {
  const { data, actions } = props;
  const { selectedRow, selectedRowHasImage, imageUrlDraft, selectedRowEmojiMatches, showUseEmojiForAll } = data;
  const { onImageUrlDraftChange, onApplySelectedImageUrl, onSelectedRowImageUpload, onApplyEmoji, onRemoveSelectedRowImage, onUseEmojiForAllWords } =
    actions;
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showEmojiSearch, setShowEmojiSearch] = useState(false);
  const [emojiSearchQuery, setEmojiSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);
  const applyAttemptIdRef = useRef(0);
  const emojiSearchInputRef = useRef<HTMLInputElement>(null);
  const emojiSearchResults = useMemo(() => searchAllEmojis(emojiSearchQuery, 120), [emojiSearchQuery]);

  useEffect(() => {
    if (!showUrlInput) {
      return;
    }
    urlInputRef.current?.focus();
    urlInputRef.current?.select();
  }, [showUrlInput]);

  useEffect(() => {
    if (selectedRowHasImage) {
      setShowUrlInput(false);
      setShowEmojiSearch(false);
      setEmojiSearchQuery('');
    }
  }, [selectedRowHasImage]);

  useEffect(() => {
    if (!showEmojiSearch) {
      return;
    }
    emojiSearchInputRef.current?.focus();
  }, [showEmojiSearch]);

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
      </div>
      {selectedRow ? (
        selectedRowHasImage ? (
          <div className="image-selected-state">
            <button type="button" className="danger" onClick={onRemoveSelectedRowImage}>
              Remove image
            </button>
            {showUseEmojiForAll ? (
              <button type="button" className="button-link" onClick={onUseEmojiForAllWords}>
                Use emoji for all words
              </button>
            ) : null}
          </div>
        ) : (
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
                {showEmojiSearch ? (
                  <div className="emoji-search-mode">
                    <div className="emoji-search-header">
                      <input
                        ref={emojiSearchInputRef}
                        value={emojiSearchQuery}
                        onChange={(event) => setEmojiSearchQuery(event.target.value)}
                        placeholder="Search emoji keywords..."
                        aria-label="Search emoji"
                      />
                      <button
                        type="button"
                        aria-label="Close emoji search"
                        onClick={() => {
                          setShowEmojiSearch(false);
                          setEmojiSearchQuery('');
                        }}
                      >
                        X
                      </button>
                    </div>
                    <div className="emoji-grid">
                      {emojiSearchResults.map((match) => (
                        <button
                          type="button"
                          key={match.emoji}
                          className="emoji-choice"
                          aria-label={`Use emoji ${match.emoji}`}
                          title={`${match.label}${match.keywords.length ? ` (${match.keywords.join(', ')})` : ''}`}
                          onClick={() => onApplyEmoji(selectedRow.id, match.emoji)}
                        >
                          {match.emoji}
                        </button>
                      ))}
                    </div>
                    {emojiSearchResults.length === 0 ? <p className="hint">No matching emoji found.</p> : null}
                  </div>
                ) : (
                  <div className="emoji-options">
                    <p>Emoji choices</p>
                    {selectedRowEmojiMatches.length > 0 ? (
                      <div className="emoji-grid">
                        {selectedRowEmojiMatches.slice(0, 4).map((match) => (
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
                        <button type="button" className="emoji-choice emoji-search-trigger" aria-label="Search all emoji" onClick={() => setShowEmojiSearch(true)}>
                          🔍
                        </button>
                      </div>
                    ) : (
                      <div className="emoji-grid">
                        <button type="button" className="emoji-choice emoji-search-trigger" aria-label="Search all emoji" onClick={() => setShowEmojiSearch(true)}>
                          🔍
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )
      ) : (
        <p>Select a row from the list to edit details.</p>
      )}
    </aside>
  );
}
