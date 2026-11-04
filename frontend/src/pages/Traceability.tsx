import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PortRequirementsButton } from "../components/PortRequirementsButton";
import { useAnalysisStore } from "../store/useAnalysisStore";
import { TRACEABILITY_COLUMNS, type TraceabilityRow } from "../traceability/portTraceabilityRows";

const LOCKED_COLUMNS = new Set<keyof TraceabilityRow>(["id", "statement"]);

export function TraceabilityPage() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const traceabilityRows = useAnalysisStore((s) => s.traceabilityRows);
  const definedLabels = useAnalysisStore((s) => s.traceabilityDefinedLabels);
  const updateTraceabilityCell = useAnalysisStore((s) => s.updateTraceabilityCell);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const rows = traceabilityRows ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) =>
      TRACEABILITY_COLUMNS.some((column) => row[column.key].toLowerCase().includes(needle))
    );
  }, [query, traceabilityRows]);

  const docName = analysisResult?.meta.source_document?.trim();
  const ported = traceabilityRows != null;

  return (
    <div className="lv-page lv-page-wide">
      <section className="lv-panel">
        <h2 className="lv-h2">Traceability Matrix</h2>
        <p className="lv-muted">
          Running analysis does not fill this matrix. Port the current requirements when you want them here.
          Requirement IDs that begin a statement are placed in the Requirement ID column. Other columns fill only
          when the document defines them. You can edit every column except Requirement ID and Requirement statement.
        </p>
        {!analysisResult ? (
          <p className="lv-muted">
            Run an analysis first. <Link to="/review">Go to requirement review</Link>
          </p>
        ) : (
          <p className="lv-muted">
            Current analysis
            {docName ? (
              <>
                : <code className="lv-doc-name">{docName}</code>
              </>
            ) : null}
            {" · "}
            {analysisResult.requirements.length}{" "}
            {analysisResult.requirements.length === 1 ? "requirement" : "requirements"} ready to port.
          </p>
        )}
        <div className="lv-trace-toolbar">
          <PortRequirementsButton />
          {ported ? (
            <label className="lv-field lv-trace-filter">
              Filter
              <input
                type="search"
                value={query}
                placeholder="ID, statement, owner, test case…"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          ) : null}
          {ported ? (
            <p className="lv-muted lv-trace-count">
              {visible.length} of {traceabilityRows.length}{" "}
              {traceabilityRows.length === 1 ? "requirement" : "requirements"}
            </p>
          ) : null}
        </div>
        {ported && definedLabels.length > 0 ? (
          <p className="lv-muted">
            Filled from the document: {definedLabels.join(", ")}.
          </p>
        ) : null}
        <div className="lv-table-scroll lv-trace-scroll">
          <table className="lv-table lv-trace-table">
            <thead>
              <tr>
                {TRACEABILITY_COLUMNS.map((column) => (
                  <th key={column.key} scope="col">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!ported ? (
                <tr>
                  <td colSpan={TRACEABILITY_COLUMNS.length} className="lv-muted">
                    No requirements ported yet.
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={TRACEABILITY_COLUMNS.length} className="lv-muted">
                    No requirements match this filter.
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const rowIndex = (traceabilityRows ?? []).indexOf(row);
                  return (
                  <tr key={rowIndex}>
                    {TRACEABILITY_COLUMNS.map((column) => {
                      const value = row[column.key];
                      const locked = LOCKED_COLUMNS.has(column.key);
                      return (
                      <td key={column.key} className={column.className}>
                        {locked ? (
                          column.key === "id" && value !== "—" ? <code>{value}</code> : value
                        ) : (
                          <input
                            className="lv-trace-input"
                            aria-label={`${column.label} for ${row.id === "—" ? `row ${rowIndex + 1}` : row.id}`}
                            value={value === "—" ? "" : value}
                            placeholder="—"
                            onChange={(event) => updateTraceabilityCell(rowIndex, column.key, event.target.value)}
                            onBlur={(event) =>
                              updateTraceabilityCell(rowIndex, column.key, event.target.value.trim() || "—")
                            }
                          />
                        )}
                      </td>
                      );
                    })}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
