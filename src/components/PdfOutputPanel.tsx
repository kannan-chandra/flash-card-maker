import type { CardPreset } from '../types';

interface PdfProgress {
  active: boolean;
  percent: number;
  stage: string;
}

interface PdfOutputPanelProps {
  preset: CardPreset;
  showCutGuides: boolean;
  pdfProgress: PdfProgress;
  pdfStatus: string;
  onPresetChange: (preset: CardPreset) => void;
  onShowCutGuidesChange: (value: boolean) => void;
  onGeneratePdf: () => void;
}

export function PdfOutputPanel(props: PdfOutputPanelProps) {
  const { preset, showCutGuides, pdfProgress, pdfStatus, onPresetChange, onShowCutGuidesChange, onGeneratePdf } = props;

  return (
    <section className="panel output-panel">
      <h2>PDF Output</h2>

      <label>
        Cards per page
        <select value={preset} onChange={(event) => onPresetChange(Number(event.target.value) as CardPreset)}>
          <option value={6}>6 per page</option>
          <option value={8}>8 per page</option>
          <option value={12}>12 per page</option>
        </select>
      </label>

      <label className="checkbox-row">
        <input type="checkbox" checked={showCutGuides} onChange={(event) => onShowCutGuidesChange(event.target.checked)} />
        Include cut guide borders
      </label>

      <button className="primary" onClick={onGeneratePdf} disabled={pdfProgress.active}>
        {pdfProgress.active ? 'Generating...' : 'Generate PDF'}
      </button>

      {pdfProgress.active && (
        <div className="progress-wrap" aria-live="polite">
          <div className="progress-label">
            <span>{pdfProgress.stage}</span>
            <span>{pdfProgress.percent}%</span>
          </div>
          <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pdfProgress.percent}>
            <div className="progress-fill" style={{ width: `${pdfProgress.percent}%` }} />
          </div>
        </div>
      )}

      {pdfStatus && <p className="status">{pdfStatus}</p>}

      <p className="hint">
        If a web image fails due to CORS/restrictions, save it to your computer and upload it in Selected Card
        Details.
      </p>
    </section>
  );
}
