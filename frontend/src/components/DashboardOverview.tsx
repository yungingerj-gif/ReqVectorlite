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
    if (!analysisResult || rows.length === 0) {
      return {
        count: 0,
        avgOverall: 0,
        highFindings: 0,
      };
    }
    const sum = rows.reduce((acc, r) => acc + r.scores.overall, 0);
    const allFindings = rows.flatMap((r) => r.findings);
    const highFindings = allFindings.filter((f) => f.severity === "high").length;
    return {
      count: rows.length,
      avgOverall: Math.round((sum / rows.length) * 10) / 10,
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
          <span className="lv-stat-value">{stats.avgOverall || "—"}</span>
          <span className="lv-stat-label">Avg overall score</span>
        </div>
        <div className="lv-stat-card high">
          <span className="lv-stat-value">{stats.highFindings}</span>
          <span className="lv-stat-label">High severity findings</span>
        </div>
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
