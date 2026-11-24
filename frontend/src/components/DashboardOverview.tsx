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
        systemMaturity: "—",
        consistency: "—",
        meanMaturity: "—",
        highFindings: 0,
      };
    }
    const allFindings = rows.flatMap((r) => r.findings);
    const highFindings = allFindings.filter((f) => f.severity === "high").length;
    const index = maturity.system_maturity_index;
    return {
      count: rows.length,
      systemMaturity: typeof index === "number" ? `${index}%` : "—",
      consistency: String(maturity.consistency),
      meanMaturity: typeof maturity.mean_maturity === "number" ? `${Math.round(maturity.mean_maturity * 10000) / 100}%` : "—",
      highFindings,
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
          <span className="lv-stat-value">{stats.systemMaturity}</span>
          <span className="lv-stat-label">System maturity index</span>
        </div>
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.consistency}</span>
          <span className="lv-stat-label">Set consistency</span>
        </div>
        <div className="lv-stat-card">
          <span className="lv-stat-value">{stats.meanMaturity}</span>
          <span className="lv-stat-label">Mean gate maturity</span>
        </div>
        <div className="lv-stat-card high">
          <span className="lv-stat-value">{stats.highFindings}</span>
          <span className="lv-stat-label">High severity findings</span>
        </div>
        {analysisResult?.quality_matrix?.length ? (
          <div className="lv-stat-card wide">
            <span className="lv-stat-label">Gate matrix. A blank cell was withheld.</span>
            <div className="lv-table-scroll">
              <table className="lv-table">
                <thead>
                  <tr>
                    <th>Requirement</th>
                    <th>Ambiguous</th>
                    <th>Feasible</th>
                    <th>Verifiable</th>
                    <th>Singular</th>
                  </tr>
                </thead>
                <tbody>
                  {analysisResult.requirements.map((row, index) => {
                    const cells = analysisResult.quality_matrix[index] ?? [];
                    return (
                      <tr key={row.requirement.id}>
                        <td>
                          <code>{row.requirement.id}</code>
                          {row.scores.safety_critical ? " SC" : ""}
                        </td>
                        {cells.map((value, column) => (
                          <td key={`${row.requirement.id}-${column}`}>{value ?? "—"}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
