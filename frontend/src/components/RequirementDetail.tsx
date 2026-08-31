import { findingSeverityClass, scoreBadgeClass } from "../store/analysisUtils";
import { useAnalysisStore } from "../store/useAnalysisStore";
import { RewritePanel } from "./RewritePanel";

export function RequirementDetail() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const selectedRequirementId = useAnalysisStore((s) => s.selectedRequirementId);

  const row = analysisResult?.requirements.find((r) => r.requirement.id === selectedRequirementId);

  if (!analysisResult) {
    return (
      <section className="lv-panel lv-detail-empty">
        <p className="lv-muted">Run analysis, then select a requirement from the table.</p>
      </section>
    );
  }

  if (!row) {
    return (
      <section className="lv-panel lv-detail-empty">
        <p className="lv-muted">Select a row in the requirements table.</p>
      </section>
    );
  }

  const { requirement: r, scores, findings } = row;
  const childDoc = analysisResult.meta.source_document?.trim();
  const parentDoc = analysisResult.meta.parent_source_document?.trim();

  return (
    <section className="lv-panel lv-detail">
      <h2 className="lv-h2">Requirement detail</h2>
      {(childDoc || parentDoc) && (
        <p className="lv-muted lv-detail-doc-line">
          {childDoc ? (
            <>
              <strong>Requirement document:</strong> <code className="lv-doc-name">{childDoc}</code>
            </>
          ) : null}
          {parentDoc ? (
            <>
              {childDoc ? " · " : null}
              <strong>Parent document (for hierarchy checks):</strong> <code className="lv-doc-name">{parentDoc}</code>
            </>
          ) : null}
        </p>
      )}

      <div className="lv-detail-basic">
        <p>
          <strong>ID</strong> <code>{r.id}</code>
        </p>
        <p>
          <strong>Type</strong> {r.type}
        </p>
        <p>
          <strong>Source text</strong>
        </p>
        <blockquote className="lv-source-quote">{r.source_text}</blockquote>
      </div>

      <h3 className="lv-h3">Attribute scores</h3>
      <div className="lv-score-grid">
        {(
          [
            ["Unambiguous", scores.unambiguous],
            ["Complete", scores.complete],
            ["Verifiable", scores.verifiable],
            ["Singular", scores.singular],
            ["Consistent", scores.consistent_correct],
            ["Overall", scores.overall],
          ] as const
        ).map(([label, val]) => (
          <div key={label} className="lv-score-cell">
            <span className="lv-score-label">{label}</span>
            <span className={`lv-score-badge lg ${scoreBadgeClass(val)}`}>{val}</span>
          </div>
        ))}
      </div>

      <h3 className="lv-h3">Findings ({findings.length})</h3>
      <p className="lv-muted">All severities are shown; explanations are always visible.</p>
      <ul className="lv-finding-list">
        {findings.map((f) => (
          <li key={f.finding_id} className={`lv-finding ${findingSeverityClass(f.severity)}`}>
            <div className="lv-finding-head">
              <span className="lv-finding-attr">{f.attribute}</span>
              <span className="lv-finding-sev">{f.severity}</span>
              <span className="lv-finding-block">{f.block_id}</span>
            </div>
            <div className="lv-finding-body">{f.explanation}</div>
            {f.evidence_span && (
              <details className="lv-finding-evidence-details">
                <summary className="lv-finding-evidence-summary">
                  <em>Evidence</em>
                  <span className="lv-evidence-chevron" aria-hidden />
                </summary>
                <div className="lv-finding-evidence-body">
                  <p className="lv-finding-evidence-text">{f.evidence_span}</p>
                </div>
              </details>
            )}
            {f.suggested_rewrite?.trim() && (
              <div className="lv-finding-rewrite">
                <div className="lv-finding-rewrite-label">
                  <em>Suggested rewrite</em>
                </div>
                <blockquote className="lv-finding-rewrite-quote">{f.suggested_rewrite}</blockquote>
              </div>
            )}
          </li>
        ))}
      </ul>

      <RewritePanel requirementId={r.id} findings={findings} />
    </section>
  );
}
