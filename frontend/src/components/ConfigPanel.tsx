import { useEffect, useMemo, useState } from "react";
import { useAnalysisStore } from "../store/useAnalysisStore";

const OVERRIDE_KEY = "layered-config-override-v1";

const BLOCK_LABELS: Record<string, string> = {
  "deterministic.unambiguous": "Unambiguous",
  "deterministic.complete": "Complete",
  "deterministic.verifiable": "Verifiable",
  "deterministic.singular": "Singular",
  "deterministic.consistent_correct": "Consistent",
  "setLevel.cross_requirement": "Set-level / cross-requirement",
  "contradiction.intra_document": "Intra-document contradiction",
  "contradiction.parent_child": "Parent–child contradiction",
};

const DISABLED_BLOCKS = new Set(["ai.attribute_analysis", "legacy.reconstruction"]);

function loadOverride(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveOverride(data: Record<string, unknown>) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(data));
}

function mergeServerWithOverride(server: Record<string, unknown>): Record<string, unknown> {
  const o = loadOverride();
  const reg = {
    ...((server.rule_block_registry as Record<string, boolean>) || {}),
    ...((o.rule_block_registry as Record<string, boolean>) || {}),
  };
  const weights = {
    ...((server.scoring_weights as Record<string, number>) || {}),
    ...((o.scoring_weights as Record<string, number>) || {}),
  };
  const dServer = (server.dictionaries as Record<string, unknown>) || {};
  const dOver = (o.dictionaries as Record<string, unknown>) || {};
  const dictionaries = {
    ...dServer,
    ...dOver,
    vague_terms: (dOver.vague_terms as string[] | undefined) ?? (dServer.vague_terms as string[]) ?? [],
    banned_terms: (dOver.banned_terms as string[] | undefined) ?? (dServer.banned_terms as string[]) ?? [],
    weak_modals: (dOver.weak_modals as string[] | undefined) ?? (dServer.weak_modals as string[]) ?? [],
    terminology_synonym_groups:
      (dOver.terminology_synonym_groups as string[][] | undefined) ??
      (dServer.terminology_synonym_groups as string[][]) ??
      [],
  };
  return { ...server, rule_block_registry: reg, scoring_weights: weights, dictionaries };
}

export function ConfigPanel() {
  const engineConfig = useAnalysisStore((s) => s.engineConfig);
  const configLoadError = useAnalysisStore((s) => s.configLoadError);
  const loadEngineConfig = useAnalysisStore((s) => s.loadEngineConfig);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    void loadEngineConfig();
  }, [loadEngineConfig]);

  useEffect(() => {
    if (engineConfig) setDraft(mergeServerWithOverride(engineConfig));
  }, [engineConfig]);

  const registryKeys = useMemo(() => {
    if (!draft?.rule_block_registry) return [] as string[];
    return Object.keys(draft.rule_block_registry as object).sort();
  }, [draft]);

  const weightKeys = useMemo(() => {
    if (!draft?.scoring_weights) return [] as string[];
    return Object.keys(draft.scoring_weights as object).sort();
  }, [draft]);

  if (configLoadError && !draft) {
    return (
      <section className="lv-panel">
        <p className="error">{configLoadError}</p>
        <button type="button" className="primary" onClick={() => void loadEngineConfig()}>
          Retry
        </button>
      </section>
    );
  }

  if (!draft) {
    return (
      <section className="lv-panel">
        <p className="lv-muted">Loading configuration…</p>
      </section>
    );
  }

  const reg = (draft.rule_block_registry as Record<string, boolean>) || {};
  const weights = (draft.scoring_weights as Record<string, number>) || {};
  const dicts = (draft.dictionaries as Record<string, unknown>) || {};
  const vagueTerms = (dicts.vague_terms as string[]) || [];
  const bannedTerms = (dicts.banned_terms as string[]) || [];
  const weakModals = (dicts.weak_modals as string[]) || [];
  const synonymGroups = (dicts.terminology_synonym_groups as string[][]) || [];

  const setReg = (key: string, on: boolean) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            rule_block_registry: { ...(d.rule_block_registry as object), [key]: on },
          }
        : d
    );
  };

  const setWeight = (key: string, n: number) => {
    setDraft((d) =>
      d
        ? {
            ...d,
            scoring_weights: { ...(d.scoring_weights as object), [key]: n },
          }
        : d
    );
  };

  const saveProfile = () => {
    if (!draft) return;
    saveOverride({
      rule_block_registry: draft.rule_block_registry,
      scoring_weights: draft.scoring_weights,
      dictionaries: draft.dictionaries,
    });
    setSaveMsg("Saved to this browser (local only). The API still uses server layered-engine.json until a save endpoint exists.");
    setTimeout(() => setSaveMsg(null), 6000);
  };

  return (
    <section className="lv-panel">
      <h2 className="lv-h2">Configurable profiles</h2>
      <p className="lv-muted">
        Edit rule blocks, weights, and dictionaries. Changes are stored locally and do not change the running server
        configuration. AI and legacy reconstruction blocks cannot be enabled on this branch.
      </p>

      <div className="lv-config-section">
        <h3 className="lv-h3">Rule blocks</h3>
        <div className="lv-toggle-grid">
          {registryKeys
            .filter((key) => !DISABLED_BLOCKS.has(key))
            .map((key) => (
            <label key={key} className="lv-toggle">
              <input type="checkbox" checked={Boolean(reg[key])} onChange={(e) => setReg(key, e.target.checked)} />
              <span>{BLOCK_LABELS[key] ?? key}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="lv-config-section">
        <h3 className="lv-h3">Scoring weights</h3>
        <div className="lv-weights-grid">
          {weightKeys.map((key) => (
            <label key={key} className="lv-weight-field">
              {key}
              <input
                type="number"
                step={0.1}
                value={weights[key] ?? 0}
                onChange={(e) => setWeight(key, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="lv-config-section">
        <h3 className="lv-h3">Dictionaries</h3>
        <label className="lv-field">
          Vague terms (one per line)
          <textarea
            className="lv-textarea"
            rows={6}
            value={vagueTerms.join("\n")}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      dictionaries: {
                        ...((d.dictionaries as object) || {}),
                        vague_terms: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                      },
                    }
                  : d
              )
            }
          />
        </label>
        <label className="lv-field">
          Banned terms (one per line)
          <textarea
            className="lv-textarea"
            rows={4}
            value={bannedTerms.join("\n")}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      dictionaries: {
                        ...((d.dictionaries as object) || {}),
                        banned_terms: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                      },
                    }
                  : d
              )
            }
          />
        </label>
        <label className="lv-field">
          Weak modals (one per line)
          <textarea
            className="lv-textarea"
            rows={3}
            value={weakModals.join("\n")}
            onChange={(e) =>
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      dictionaries: {
                        ...((d.dictionaries as object) || {}),
                        weak_modals: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean),
                      },
                    }
                  : d
              )
            }
          />
        </label>
        <label className="lv-field">
          Terminology synonym groups (one group per line, synonyms separated by | )
          <textarea
            className="lv-textarea"
            rows={4}
            value={synonymGroups.map((g) => g.join(" | ")).join("\n")}
            onChange={(e) => {
              const groups = e.target.value
                .split("\n")
                .map((line) =>
                  line
                    .split("|")
                    .map((x) => x.trim())
                    .filter(Boolean)
                )
                .filter((g) => g.length > 0);
              setDraft((d) =>
                d
                  ? {
                      ...d,
                      dictionaries: {
                        ...((d.dictionaries as object) || {}),
                        terminology_synonym_groups: groups,
                      },
                    }
                  : d
              );
            }}
          />
        </label>
      </div>

      <button type="button" className="primary" onClick={saveProfile}>
        Save profile
      </button>
      {saveMsg && <p className="lv-save-msg">{saveMsg}</p>}

      <details className="lv-raw-config">
        <summary>Raw merged config (read-only)</summary>
        <pre className="lv-pre">{JSON.stringify(draft, null, 2)}</pre>
      </details>
    </section>
  );
}
