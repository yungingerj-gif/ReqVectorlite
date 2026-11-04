import { useMemo } from "react";
import { filterVisibleRequirements } from "../store/analysisUtils";
import { useAnalysisStore } from "../store/useAnalysisStore";
import { AnalysisFiltersBar } from "./AnalysisFiltersBar";

export function DashboardOverview() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const filters = useAnalysisStore((s) => s.filters);

  const rows = useMemo(
    () => filterVisibleRequirements(analysisResult, filters),
    [analysisResult, filters]
  );

  const stats = useMemo(() => {
    const maturity = analysisResult?.document_maturity;
    if (!analysisResult || rows.length === 0 || !maturity) {
      return {
        count: 0,
        maturity: "—",
        systemMaturity: "—",
        weightedFeasibility: "—",
        weightedVerifiability: "—",
        highFindings: 0,
      };
    }
    const allFindings = rows.flatMap((r) => r.findings);
    const highFindings = allFindings.filter((f) => f.severity === "high").length;
    const index = maturity.system_maturity_index;
    return {
      count: rows.length,
      maturity: String(maturity.maturity),
      systemMaturity: typeof index === "number" ? `${index}%` : "—",
      weightedFeasibility: String(maturity.weighted_feasibility),
      weightedVerifiability: String(maturity.weighted_verifiability),
      highFindings,
      detail: `Completeness ${maturity.completeness} · Consistency ${maturity.consistency} · Bounded ${maturity.bounded} · Feasible ${maturity.feasible}`,
    };
  }, [analysisResult, rows]);

  return (
    <section className="lv-panel">
      <h2 className="lv-h2">Overview</h2>
      <p className="lv-muted">
        Filters apply to the current analysis. Profile filter hides rows when it does not match the run&apos;s profile.
      </p>

      <AnalysisFiltersBar />

      <div className="lv-stat-grid">
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.count}</span>
          <span className="lv-stat-label">Requirements (filtered)</span>
        </div>
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.maturity}</span>
          <span className="lv-stat-label">Document maturity</span>
        </div>
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.systemMaturity}</span>
          <span className="lv-stat-label">System maturity index</span>
        </div>
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.weightedFeasibility}</span>
          <span className="lv-stat-label">Weighted feasibility</span>
        </div>
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.weightedVerifiability}</span>
          <span className="lv-stat-label">Weighted verifiability</span>
        </div>
        <div className="lv-stat-card high">
          <span className="lv-stat-value">{stats.highFindings}</span>
          <span className="lv-stat-label">High severity findings</span>
        </div>
        {analysisResult?.document_maturity?.defect_profile?.length ? (
          <div className="lv-stat-card wide">
            <span className="lv-stat-label">Defect profile (column means of R)</span>
            <div className="lv-table-scroll">
              <table className="lv-table">
                <thead>
                  <tr>
                    <th>Necessary</th>
                    <th>Unambiguous</th>
                    <th>Complete</th>
                    <th>Feasible</th>
                    <th>Verifiable</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {analysisResult.document_maturity.defect_profile.map((value, column) => (
                      <td key={column}>{value}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {(analysisResult.document_maturity.defect_profile[4] ?? 1) < 0.5 ? (
              <p className="lv-muted">
                Verifiable is close to zero. Testable criteria are weak across the specification. Tighter templates or
                training on measurable limits would raise this column.
              </p>
            ) : null}
          </div>
        ) : null}
        {analysisResult?.weighted_evaluation_matrix?.length ? (
          <div className="lv-stat-card wide">
            <span className="lv-stat-label">Weighted evaluation matrix Q = R × W</span>
            <div className="lv-table-scroll">
              <table className="lv-table">
                <thead>
                  <tr>
                    <th>Requirement</th>
                    <th>Necessary</th>
                    <th>Unambiguous</th>
                    <th>Complete</th>
                    <th>Feasible</th>
                    <th>Verifiable</th>
                  </tr>
                </thead>
                <tbody>
                  {analysisResult.requirements.map((row, index) => {
                    const weighted = analysisResult.weighted_evaluation_matrix[index] ?? [];
                    return (
                      <tr key={row.requirement.id}>
                        <td>
                          <code>{row.requirement.id}</code>
                          {row.scores.safety_critical ? " SC" : ""}
                        </td>
                        {weighted.map((value, column) => (
                          <td key={`${row.requirement.id}-${column}`}>{value}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
        {"detail" in stats && stats.detail ? (
          <div className="lv-stat-card wide">
            <span className="lv-stat-label">Document checks</span>
            <div className="lv-ratio-bar">{stats.detail}</div>
          </div>
        ) : null}
        <div className="lv-stat-card wide">
          <span className="lv-stat-label">Review mode</span>
          <div className="lv-ratio-bar">
            <div className="lv-ratio active" style={{ width: "100%" }}>
              Active specification — rules only
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
