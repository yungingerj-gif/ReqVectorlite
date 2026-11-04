import { useCallback, useState } from "react";
import { PortRequirementsButton } from "./PortRequirementsButton";
import { useAnalysisStore } from "../store/useAnalysisStore";

const FILE_ACCEPT = ".txt,.csv,.pdf,.docx,.xlsx,.xls";

export function UploadPanel() {
  const rawText = useAnalysisStore((s) => s.rawText);
  const setRawText = useAnalysisStore((s) => s.setRawText);
  const runAnalyze = useAnalysisStore((s) => s.runAnalyze);
  const runUpload = useAnalysisStore((s) => s.runUpload);
  const loading = useAnalysisStore((s) => s.loading);
  const error = useAnalysisStore((s) => s.error);
  const lastSourceFile = useAnalysisStore((s) => s.lastSourceFile);
  const [dragOver, setDragOver] = useState(false);

  const onDropSingle = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void runUpload(f);
    },
    [runUpload]
  );

  const runDisabled = loading || !rawText.trim();

  return (
    <section className="lv-panel">
      <h2 className="lv-h2">Upload or paste requirements</h2>
      <p className="lv-hint">
        Analyze one specification at a time (intra-document quality, cross-set, contradiction, and verification).
        Parent–child comparison is not enabled yet.
      </p>

      <div
        className={`lv-dropzone ${dragOver ? "dragover" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDropSingle}
      >
        <div className="lv-dropzone-single-head">
          <p>Drag & drop a file here, or use the button.</p>
          {lastSourceFile ? (
            <span className="lv-upload-check" title={`Loaded: ${lastSourceFile.name}`}>
              ✓
            </span>
          ) : null}
        </div>
        <label className="lv-dropzone-btn">
          <input
            type="file"
            accept={FILE_ACCEPT}
            className="lv-file-input-hidden"
            disabled={loading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void runUpload(f);
              e.target.value = "";
            }}
          />
          <span className="primary">Upload file</span>
        </label>
        <p className="lv-hint">PDF, DOCX, XLSX, CSV, TXT</p>
      </div>

      <label className="lv-field">
        Paste requirements
        <textarea
          className="lv-textarea"
          rows={8}
          placeholder="Paste requirements text here..."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
        />
      </label>

      <p className="lv-hint">
        Analysis uses deterministic INCOSE-style rules only (clarity, completeness, verifiability, singularity,
        consistency, plus intra-spec set-level and contradiction checks).
      </p>

      <button
        type="button"
        className="primary lv-run-btn"
        disabled={runDisabled}
        onClick={() => void runAnalyze()}
      >
        {loading ? "Running…" : "Run analysis"}
      </button>
      <div className="lv-port-row">
        <PortRequirementsButton goToMatrix />
        <p className="lv-hint">
          Analysis does not fill the traceability matrix. Port requirements after the run. Only columns present in
          the document are copied.
        </p>
      </div>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
