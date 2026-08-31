import { useMemo } from "react";
import { useAnalysisStore } from "../store/useAnalysisStore";

type Props = { title?: string };

export function AnalysisFiltersBar({ title = "Filters" }: Props) {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const filters = useAnalysisStore((s) => s.filters);
  const setFilters = useAnalysisStore((s) => s.setFilters);

  const types = useMemo(() => {
    if (!analysisResult) return [] as string[];
    const s = new Set<string>();
    for (const r of analysisResult.requirements) s.add(r.requirement.type);
    return Array.from(s).sort();
  }, [analysisResult]);

  if (!analysisResult) return null;

  return (
    <div className="lv-filters-bar-wrap">
      <span className="lv-filters-title">{title}</span>
      <div className="lv-filters-bar">
        <label>
          Profile
          <select value={filters.profile} onChange={(e) => setFilters({ profile: e.target.value })}>
            <option value="all">All (match current run)</option>
            <option value="default_active_spec">default_active_spec</option>
          </select>
        </label>
        <label>
          Severity
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ severity: e.target.value as typeof filters.severity })}
          >
            <option value="all">All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          Requirement type
          <select value={filters.type} onChange={(e) => setFilters({ type: e.target.value })}>
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
