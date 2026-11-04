import { useCallback, useEffect, useState } from "react";
import type { DomainConstraintDto, DomainConstraintLibraryDto } from "../api/layeredApi";
import * as layeredApi from "../api/layeredApi";

function splitLinesOrComma(s: string): string[] {
  return s
    .split(/[\n,]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function linesFromArray(arr: string[] | undefined): string {
  return (arr ?? []).join("\n");
}

function newConstraint(): DomainConstraintDto {
  return {
    id: crypto.randomUUID(),
    label: "Quantity",
    category: "",
    canonical_unit: "",
    alternate_units: [],
    synonyms: [],
    notes_for_llm: "",
    enabled: true,
  };
}

/** Draft row: alternate_units/synonyms edited as newline-separated text */
type DraftConstraint = DomainConstraintDto & {
  _alternateDraft?: string;
  _synonymsDraft?: string;
};

function toDraft(c: DomainConstraintDto): DraftConstraint {
  return {
    ...c,
    category: c.category ?? "",
    notes_for_llm: c.notes_for_llm ?? "",
    _alternateDraft: linesFromArray(c.alternate_units),
    _synonymsDraft: linesFromArray(c.synonyms),
  };
}

function fromDraft(d: DraftConstraint): DomainConstraintDto {
  return {
    id: d.id,
    label: d.label,
    category: d.category?.trim() || undefined,
    canonical_unit: d.canonical_unit,
    alternate_units: splitLinesOrComma(d._alternateDraft ?? ""),
    synonyms: splitLinesOrComma(d._synonymsDraft ?? ""),
    notes_for_llm: d.notes_for_llm?.trim() || undefined,
    enabled: d.enabled,
  };
}

export function DomainConstraintsPage() {
  const [lib, setLib] = useState<DomainConstraintLibraryDto | null>(null);
  const [drafts, setDrafts] = useState<DraftConstraint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const l = await layeredApi.getDomainConstraintLibrary();
      const constraints = l.constraints?.length ? l.constraints.map(toDraft) : [toDraft(newConstraint())];
      setLib({ ...l, summary: l.summary ?? "", constraints: [] });
      setDrafts(constraints);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = lib?.summary ?? "";

  const save = async () => {
    if (!lib) return;
    setSaving(true);
    setSaveMsg(null);
    setError(null);
    try {
      const constraints = drafts.map(fromDraft);
      const saved = await layeredApi.saveDomainConstraintLibrary({
        summary: summary.trim(),
        constraints,
      });
      setLib({ ...saved, summary: saved.summary ?? "" });
      setDrafts(saved.constraints?.length ? saved.constraints.map(toDraft) : [toDraft(newConstraint())]);
      setSaveMsg(
        "Saved on the server (backend/data/domain-constraints.json)."
      );
      setTimeout(() => setSaveMsg(null), 8000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !lib) {
    return (
      <div className="lv-page">
        <p className="lv-muted">{loading ? "Loading domain constraint library…" : error ?? "Empty."}</p>
        {error && (
          <button type="button" className="secondary-btn" onClick={() => void load()}>
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="lv-page lv-domain-constraints-page">
      <h1 className="lv-h1">Domain constraint library</h1>
      <p className="lv-muted">
        Define quantities your specs use (speed, torque, current, temperature, …) with a{" "}
        <strong>canonical unit</strong>, optional alternates, and synonyms. Saved rows stay in the library on the
        server. Copy{" "}
        <code className="lv-doc-name">backend/data/domain-constraints.example.json</code> to{" "}
        <code className="lv-doc-name">backend/data/domain-constraints.json</code> to seed the server without using this UI.
      </p>

      {error && <p className="error">{error}</p>}

      <section className="lv-panel lv-ai-training-global">
        <h2 className="lv-h2">Library scope</h2>
        <label className="lv-field">
          Short summary
          <textarea
            className="lv-textarea"
            rows={4}
            value={summary}
            onChange={(e) => setLib({ ...lib, summary: e.target.value })}
            spellCheck
          />
        </label>
      </section>

      <section className="lv-panel">
        <div className="lv-ai-training-examples-head">
          <h2 className="lv-h2">Quantities</h2>
          <button
            type="button"
            className="secondary-btn"
            onClick={() => setDrafts([...drafts, toDraft(newConstraint())])}
          >
            Add quantity
          </button>
        </div>
        <p className="lv-muted">
          Alternates and synonyms: one per line (commas also allowed). Disabled rows are ignored at runtime.
        </p>

        <div className="lv-ai-training-cards">
          {drafts.map((row, idx) => (
            <div key={row.id} className="lv-ai-training-card lv-domain-constraint-card">
              <div className="lv-ai-training-card-toolbar">
                <label className="lv-toggle">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => {
                      const next = [...drafts];
                      next[idx] = { ...row, enabled: e.target.checked };
                      setDrafts(next);
                    }}
                  />
                  <span>Enabled</span>
                </label>
                <button
                  type="button"
                  className="secondary-btn lv-ai-training-remove"
                  onClick={() => setDrafts(drafts.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              </div>
              <label className="lv-field">
                Label
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...row, label: e.target.value };
                    setDrafts(next);
                  }}
                />
              </label>
              <label className="lv-field">
                Category (optional)
                <input
                  type="text"
                  placeholder="e.g. mechanical, electrical"
                  value={row.category ?? ""}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...row, category: e.target.value };
                    setDrafts(next);
                  }}
                />
              </label>
              <label className="lv-field">
                Canonical unit
                <input
                  type="text"
                  placeholder="e.g. rad/s, N·m, A"
                  value={row.canonical_unit}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...row, canonical_unit: e.target.value };
                    setDrafts(next);
                  }}
                />
              </label>
              <label className="lv-field">
                Alternate units (one per line)
                <textarea
                  className="lv-textarea"
                  rows={2}
                  value={row._alternateDraft ?? ""}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...row, _alternateDraft: e.target.value };
                    setDrafts(next);
                  }}
                />
              </label>
              <label className="lv-field">
                Synonyms / phrases (one per line)
                <textarea
                  className="lv-textarea"
                  rows={2}
                  value={row._synonymsDraft ?? ""}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...row, _synonymsDraft: e.target.value };
                    setDrafts(next);
                  }}
                />
              </label>
              <label className="lv-field">
                Notes (optional)
                <textarea
                  className="lv-textarea"
                  rows={2}
                  value={row.notes_for_llm ?? ""}
                  onChange={(e) => {
                    const next = [...drafts];
                    next[idx] = { ...row, notes_for_llm: e.target.value };
                    setDrafts(next);
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <div className="lv-ai-training-actions">
        <button type="button" className="primary" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save to server"}
        </button>
        <button type="button" className="secondary-btn" onClick={() => void load()} disabled={saving}>
          Reload from server
        </button>
      </div>
      {saveMsg && <p className="lv-save-msg">{saveMsg}</p>}
      <p className="lv-muted lv-ai-training-meta">Last saved: {lib.updated_at}</p>
    </div>
  );
}
