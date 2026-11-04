import { useMemo } from "react";
import {
  filterVisibleRequirements,
  scoreBadgeClass,
  sortRequirementRows,
  topFinding,
} from "../store/analysisUtils";
import type { SortColumn } from "../store/useAnalysisStore";
import { useAnalysisStore } from "../store/useAnalysisStore";

export function RequirementsTable() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const filters = useAnalysisStore((s) => s.filters);
  const selectedRequirementId = useAnalysisStore((s) => s.selectedRequirementId);
  const setSelectedRequirementId = useAnalysisStore((s) => s.setSelectedRequirementId);
  const sortColumn = useAnalysisStore((s) => s.sortColumn);
  const sortDirection = useAnalysisStore((s) => s.sortDirection);
  const toggleSort = useAnalysisStore((s) => s.toggleSort);

  const rows = useMemo(() => {
    const filtered = filterVisibleRequirements(analysisResult, filters);
    return sortRequirementRows(filtered, sortColumn, sortDirection);
  }, [analysisResult, filters, sortColumn, sortDirection]);

  const header = (col: SortColumn, label: string) => (
    <th scope="col">
      <button type="button" className="lv-th-btn" onClick={() => toggleSort(col)}>
        {label}
        {sortColumn === col ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
      </button>
    </th>
  );

  if (!analysisResult) {
    return (
      <section className="lv-panel">
        <h2 className="lv-h2">Requirements</h2>
        <p className="lv-muted">Run an analysis to see the table.</p>
      </section>
    );
  }

  const docName = analysisResult.meta.source_document?.trim();

  return (
    <section className="lv-panel lv-table-panel">
      <h2 className="lv-h2">Requirements</h2>
      {docName ? (
        <p className="lv-muted lv-table-doc-caption">
          All rows are from <code className="lv-doc-name">{docName}</code>
          {analysisResult.meta.parent_source_document?.trim() ? (
            <>
              {" "}
              (parent file <code className="lv-doc-name">{analysisResult.meta.parent_source_document.trim()}</code> is
              used only for cross-document checks, not listed here)
            </>
          ) : null}
        </p>
      ) : null}
      <div className="lv-table-scroll">
        <table className="lv-table">
          <thead>
            <tr>
              {header("id", "ID")}
              {header("text", "Requirement text")}
              {header("type", "Type")}
              {header("necessary", "Necessary")}
              {header("unambiguous", "Unambiguous")}
              {header("complete", "Complete")}
              {header("feasible", "Feasible")}
              {header("verifiable", "Verifiable")}
              {header("maturity", "Maturity")}
              {header("qualityScore", "Quality %")}
              {header("topIssue", "Top issue")}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { requirement: r, scores, findings } = row;
              const tf = topFinding(findings);
              const active = r.id === selectedRequirementId;
              return (
                <tr
                  key={r.id}
                  className={active ? "lv-tr-selected" : ""}
                  onClick={() => setSelectedRequirementId(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedRequirementId(r.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                >
                  <td>
                    <code>{r.id}</code>
                    {scores.safety_critical ? " SC" : ""}
                  </td>
                  <td className="lv-td-text">{r.source_text}</td>
                  <td>{r.type}</td>
                  <td>
                    <span className={`lv-score-badge ${scoreBadgeClass(scores.necessary)}`}>{scores.necessary}</span>
                  </td>
                  <td>
                    <span className={`lv-score-badge ${scoreBadgeClass(scores.unambiguous)}`}>
                      {scores.unambiguous}
                    </span>
                  </td>
                  <td>
                    <span className={`lv-score-badge ${scoreBadgeClass(scores.complete)}`}>{scores.complete}</span>
                  </td>
                  <td>
                    <span className={`lv-score-badge ${scoreBadgeClass(scores.feasible)}`}>{scores.feasible}</span>
                  </td>
                  <td>
                    <span className={`lv-score-badge ${scoreBadgeClass(scores.verifiable)}`}>
                      {scores.verifiable}
                    </span>
                  </td>
                  <td>
                    <span className={`lv-score-badge ${scoreBadgeClass(scores.maturity)}`}>{scores.maturity}</span>
                  </td>
                  <td>{typeof scores.quality_score === "number" ? `${scores.quality_score}%` : "—"}</td>
                  <td className="lv-td-issue">
                    {tf ? (
                      <>
                        <span className={`lv-mini-sev ${tf.severity}`}>{tf.severity}</span> {tf.attribute}:{" "}
                        {tf.explanation.slice(0, 80)}
                        {tf.explanation.length > 80 ? "…" : ""}
                      </>
                    ) : (
                      "—"
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
