import type { FlashcardRow, RowValidation } from '../types';

interface WordListPanelProps {
  csvInput: string;
  rows: FlashcardRow[];
  validations: RowValidation[];
  imageIssues: Record<string, string>;
  selectedRowId?: string;
  onCsvInputChange: (value: string) => void;
  onCsvImport: () => void;
  onClearRows: () => void;
  onSelectRow: (rowId: string) => void;
  onUpdateRow: (rowId: string, patch: Partial<FlashcardRow>) => void;
}

export function WordListPanel(props: WordListPanelProps) {
  const {
    csvInput,
    rows,
    validations,
    imageIssues,
    selectedRowId,
    onCsvInputChange,
    onCsvImport,
    onClearRows,
    onSelectRow,
    onUpdateRow
  } = props;

  return (
    <section className="panel data-panel">
      <h2>Word & Image List</h2>
      <p>Columns: `word`, `subtitle`, `imageUrl`. Header row is optional. Select a row to edit details at left.</p>
      <textarea
        value={csvInput}
        onChange={(event) => onCsvInputChange(event.target.value)}
        placeholder={'word,subtitle,imageUrl\nDog,Animal,https://example.com/dog.jpg'}
        rows={5}
      />
      <div className="row-buttons">
        <button onClick={onCsvImport}>Import CSV</button>
        <button onClick={onClearRows} className="danger">
          Clear Rows
        </button>
      </div>

      <div className="list-table" role="region" aria-label="Rows list">
        <table>
          <thead>
            <tr>
              <th>Word</th>
              <th>Subtitle</th>
              <th>Image URL</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rowValidation = validations.find((item) => item.rowId === row.id);
              const hasIssue = Boolean(
                rowValidation?.wordOverflow || rowValidation?.subtitleOverflow || rowValidation?.imageIssue || imageIssues[row.id]
              );
              return (
                <tr
                  key={row.id}
                  className={row.id === selectedRowId ? 'selected' : undefined}
                  onClick={() => onSelectRow(row.id)}
                >
                  <td>
                    <input
                      value={row.word}
                      onChange={(event) => onUpdateRow(row.id, { word: event.target.value })}
                      aria-label="Word"
                    />
                  </td>
                  <td>
                    <input
                      value={row.subtitle}
                      onChange={(event) => onUpdateRow(row.id, { subtitle: event.target.value })}
                      aria-label="Subtitle"
                    />
                  </td>
                  <td>
                    <input
                      value={row.imageUrl}
                      onChange={(event) => onUpdateRow(row.id, { imageUrl: event.target.value })}
                      aria-label="Image URL"
                      placeholder="https://..."
                    />
                  </td>
                  <td>
                    {hasIssue ? (
                      <span className="warn">
                        {rowValidation?.wordOverflow ? 'Word overflow. ' : ''}
                        {rowValidation?.subtitleOverflow ? 'Subtitle overflow. ' : ''}
                        {rowValidation?.imageIssue ? 'Missing image. ' : ''}
                        {imageIssues[row.id] ? 'Image fetch blocked.' : ''}
                      </span>
                    ) : (
                      <span className="ok">Fits</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
