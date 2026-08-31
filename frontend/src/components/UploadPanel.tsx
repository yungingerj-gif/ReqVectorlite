import { useCallback, useState } from "react";
import { useAnalysisStore } from "../store/useAnalysisStore";

const FILE_ACCEPT = ".txt,.csv,.pdf,.docx,.xlsx,.xls";

type Slot = "child" | "parent";

function DualDropZone(props: {
  slot: Slot;
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File) => void;
  disabled: boolean;
}) {
  const { slot, label, hint, file, onFile, disabled } = props;
  const [dragOver, setDragOver] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const f = e.dataTransfer.files?.[0];
      if (f) onFile(f);
    },
    [disabled, onFile]
  );

  return (
    <div
      className={`lv-dropzone lv-dropzone-dual ${dragOver ? "dragover" : ""}`}
      data-slot={slot}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="lv-dropzone-dual-title-row">
        <p className="lv-dropzone-dual-title">{label}</p>
        {file ? (
          <span className="lv-upload-check" title="File ready">
            ✓
          </span>
        ) : null}
      </div>
      <p className="lv-dropzone-dual-file">{file ? file.name : "No file selected"}</p>
      <label className="lv-dropzone-btn">
        <input
          type="file"
          accept={FILE_ACCEPT}
          className="lv-file-input-hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <span className="primary">Choose file</span>
      </label>
      <p className="lv-hint">{hint}</p>
    </div>
  );
}

export function UploadPanel() {
  const rawText = useAnalysisStore((s) => s.rawText);
  const setRawText = useAnalysisStore((s) => s.setRawText);
  const parentChildCompareEnabled = useAnalysisStore((s) => s.parentChildCompareEnabled);
  const setParentChildCompareEnabled = useAnalysisStore((s) => s.setParentChildCompareEnabled);
  const hierarchyChildFile = useAnalysisStore((s) => s.hierarchyChildFile);
  const hierarchyParentFile = useAnalysisStore((s) => s.hierarchyParentFile);
  const setHierarchyChildFile = useAnalysisStore((s) => s.setHierarchyChildFile);
  const setHierarchyParentFile = useAnalysisStore((s) => s.setHierarchyParentFile);
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

  const dualReady = Boolean(hierarchyChildFile && hierarchyParentFile);
  const runDisabled = loading || (parentChildCompareEnabled ? !dualReady : !rawText.trim());

  return (
    <section className="lv-panel">
      <h2 className="lv-h2">Upload or paste requirements</h2>

      <div className="lv-parent-child-toggle-wrap">
        <button
          type="button"
          className={`lv-toggle-parent-child ${parentChildCompareEnabled ? "on" : ""}`}
          aria-pressed={parentChildCompareEnabled}
          disabled={loading}
          onClick={() => setParentChildCompareEnabled(!parentChildCompareEnabled)}
        >
          {parentChildCompareEnabled
            ? "Parent / child comparison: on"
            : "Parent / child comparison: off"}
        </button>
        <p className="lv-hint lv-toggle-hint">
          {parentChildCompareEnabled
            ? "Upload the lower-level (child) spec and the higher-level (parent) spec. Analysis runs against the child with hierarchy checks to the parent."
            : "Turn on to compare two uploaded documents (child vs parent). Otherwise use a single file or pasted text."}
        </p>
      </div>

      {parentChildCompareEnabled ? (
        <div className="lv-dual-upload-grid">
          <DualDropZone
            slot="child"
            label="Child specification"
            hint="The document analyzed in detail (e.g. subsystem or implementation spec)."
            file={hierarchyChildFile}
            onFile={setHierarchyChildFile}
            disabled={loading}
          />
          <DualDropZone
            slot="parent"
            label="Parent specification"
            hint="Higher-level spec the child should refine (e.g. system or stakeholder requirements)."
            file={hierarchyParentFile}
            onFile={setHierarchyParentFile}
            disabled={loading}
          />
        </div>
      ) : (
        <>
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
        </>
      )}

      <p className="lv-hint">
        Analysis uses deterministic INCOSE-style rules only (clarity, completeness, verifiability, singularity,
        consistency, plus set-level and parent/child contradiction checks). AI and legacy reconstruction are not
        available on this branch.
      </p>

      <button
        type="button"
        className="primary lv-run-btn"
        disabled={runDisabled}
        onClick={() => void runAnalyze()}
      >
        {loading ? "Running…" : "Run analysis"}
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  );
}
