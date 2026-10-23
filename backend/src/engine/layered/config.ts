import * as fs from "fs";
import * as path from "path";

export interface EngineProfile {
  id: string;
  mode: "active" | "legacy";
  enabled_rule_blocks: string[];
  scoring_weights_override: Record<string, number>;
}

/** Tunables for intra-doc and parent-child contradiction engines. */
export interface ContradictionConfig {
  intra_pair_budget: number;
  intra_jaccard_floor: number;
  same_type_bonus: number;
  shared_object_weight: number;
  shared_condition_bonus: number;
  hierarchy_similarity_floor: number;
  hierarchy_pair_budget: number;
}

const DEFAULT_CONTRADICTION: ContradictionConfig = {
  intra_pair_budget: 120,
  intra_jaccard_floor: 0.14,
  same_type_bonus: 0.15,
  shared_object_weight: 0.18,
  shared_condition_bonus: 0.2,
  hierarchy_similarity_floor: 0.1,
  hierarchy_pair_budget: 80,
};

function parseContradiction(raw: unknown): ContradictionConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CONTRADICTION };
  const o = raw as Record<string, unknown>;
  return {
    intra_pair_budget: Number(o.intra_pair_budget ?? DEFAULT_CONTRADICTION.intra_pair_budget),
    intra_jaccard_floor: Number(o.intra_jaccard_floor ?? DEFAULT_CONTRADICTION.intra_jaccard_floor),
    same_type_bonus: Number(o.same_type_bonus ?? DEFAULT_CONTRADICTION.same_type_bonus),
    shared_object_weight: Number(o.shared_object_weight ?? DEFAULT_CONTRADICTION.shared_object_weight),
    shared_condition_bonus: Number(o.shared_condition_bonus ?? DEFAULT_CONTRADICTION.shared_condition_bonus),
    hierarchy_similarity_floor: Number(
      o.hierarchy_similarity_floor ?? DEFAULT_CONTRADICTION.hierarchy_similarity_floor
    ),
    hierarchy_pair_budget: Number(o.hierarchy_pair_budget ?? DEFAULT_CONTRADICTION.hierarchy_pair_budget),
  };
}

export interface EngineConfig {
  organization_id: string;
  scoring_penalties: Record<"low" | "medium" | "high", number>;
  scoring_weights: Record<string, number>;
  rule_block_registry: Record<string, boolean>;
  thresholds: Record<string, number>;
  dictionaries: {
    banned_terms: string[];
    vague_terms: string[];
    weak_modals: string[];
    terminology_synonym_groups: string[][];
  };
  singular_conjunction_patterns: {
    count_and_or_as_compound: boolean;
  };
  contradiction: ContradictionConfig;
  profiles: Record<string, EngineProfile>;
}

const DEFAULT_PENALTIES = { low: 10, medium: 20, high: 35 };

function parseProfiles(raw: unknown): Record<string, EngineProfile> {
  const out: Record<string, EngineProfile> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const p = v as Record<string, unknown>;
    out[k] = {
      id: String(p.id ?? k),
      mode: p.mode === "legacy" ? "legacy" : "active",
      enabled_rule_blocks: Array.isArray(p.enabled_rule_blocks)
        ? (p.enabled_rule_blocks as unknown[]).map(String).filter(
            (id) => id !== "ai.attribute_analysis" && id !== "legacy.reconstruction"
          )
        : [],
      scoring_weights_override:
        p.scoring_weights_override && typeof p.scoring_weights_override === "object"
          ? (p.scoring_weights_override as Record<string, number>)
          : {},
    };
  }
  return out;
}

export function loadEngineConfig(filePath?: string): EngineConfig {
  const bundled = path.join(__dirname, "..", "..", "..", "config", "layered-engine.json");
  const p = filePath ?? bundled;
  if (!fs.existsSync(p)) {
    throw new Error(`Engine config not found: ${p}`);
  }
  const data = JSON.parse(fs.readFileSync(p, "utf-8")) as Record<string, unknown>;
  const penalties = {
    ...DEFAULT_PENALTIES,
    ...(typeof data.scoring_penalties === "object" && data.scoring_penalties
      ? (data.scoring_penalties as Record<string, number>)
      : {}),
  };
  const parsed: EngineConfig = {
    organization_id: String(data.organization_id ?? "default"),
    scoring_penalties: {
      low: Number(penalties.low ?? DEFAULT_PENALTIES.low),
      medium: Number(penalties.medium ?? DEFAULT_PENALTIES.medium),
      high: Number(penalties.high ?? DEFAULT_PENALTIES.high),
    },
    scoring_weights:
      typeof data.scoring_weights === "object" && data.scoring_weights
        ? (data.scoring_weights as Record<string, number>)
        : {},
    rule_block_registry:
      typeof data.rule_block_registry === "object" && data.rule_block_registry
        ? (data.rule_block_registry as Record<string, boolean>)
        : {},
    thresholds: readThresholds(data.thresholds),
    dictionaries: {
      banned_terms: readStringArray((data.dictionaries as Record<string, unknown>)?.banned_terms),
      vague_terms: readStringArray((data.dictionaries as Record<string, unknown>)?.vague_terms),
      weak_modals: readStringArray((data.dictionaries as Record<string, unknown>)?.weak_modals),
      terminology_synonym_groups: readSynonymGroups(
        (data.dictionaries as Record<string, unknown>)?.terminology_synonym_groups
      ),
    },
    singular_conjunction_patterns: {
      count_and_or_as_compound: Boolean(
        (data.singular_conjunction_patterns as Record<string, unknown> | undefined)
          ?.count_and_or_as_compound ?? true
      ),
    },
    contradiction: parseContradiction(data.contradiction),
    profiles: parseProfiles(data.profiles),
  };
  return lockRulesOnlyEngineConfig(parsed);
}

/**
 * Specification review runs deterministic rules only.
 * Legacy reconstruction and parent–child comparison stay off.
 */
export function lockRulesOnlyEngineConfig(config: EngineConfig): EngineConfig {
  const registry = { ...config.rule_block_registry };
  delete registry["ai.attribute_analysis"];
  registry["legacy.reconstruction"] = false;
  registry["contradiction.parent_child"] = false;
  registry["verification.analysis"] = registry["verification.analysis"] ?? registry["deterministic.verifiable"] ?? true;
  registry["deterministic.verifiable"] = registry["deterministic.verifiable"] ?? true;

  const activeBlocks = [
    "deterministic.unambiguous",
    "deterministic.complete",
    "deterministic.verifiable",
    "verification.analysis",
    "deterministic.singular",
    "deterministic.consistent_correct",
    "setLevel.cross_requirement",
    "contradiction.intra_document",
  ];

  const defaultActive = config.profiles.default_active_spec;
  const lockedBlocks = (blocks: string[]) => {
    const filtered = blocks.filter(
      (id) => id !== "legacy.reconstruction" && id !== "ai.attribute_analysis" && id !== "contradiction.parent_child"
    );
    if (
      (filtered.includes("deterministic.verifiable") || filtered.includes("verification.analysis")) &&
      !filtered.includes("verification.analysis")
    ) {
      filtered.push("verification.analysis");
    }
    return filtered;
  };
  const profiles: Record<string, EngineProfile> = {
    default_active_spec: {
      id: "default_active_spec",
      mode: "active",
      enabled_rule_blocks: defaultActive
        ? lockedBlocks(defaultActive.enabled_rule_blocks)
        : activeBlocks,
      scoring_weights_override: defaultActive?.scoring_weights_override ?? {},
    },
  };

  return {
    ...config,
    rule_block_registry: registry,
    profiles,
  };
}

function readThresholds(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (key.startsWith("same_intent_ai_")) continue;
    const n = Number(value);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
}

function readStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map(String) : [];
}

function readSynonymGroups(v: unknown): string[][] {
  if (!Array.isArray(v)) return [];
  return (v as unknown[])
    .filter(Array.isArray)
    .map((g) => (g as unknown[]).map(String));
}

export function resolveProfile(config: EngineConfig, profileId: string): EngineProfile {
  const p = config.profiles[profileId] ?? config.profiles.default_active_spec;
  if (!p) {
    const keys = Object.keys(config.profiles);
    throw new Error(`Unknown profile "${profileId}". Known: ${keys.join(", ")}`);
  }
  return p;
}

export function isBlockEnabled(config: EngineConfig, profile: EngineProfile, blockId: string): boolean {
  return profile.enabled_rule_blocks.includes(blockId) && config.rule_block_registry[blockId] === true;
}

export function effectiveScoringWeights(config: EngineConfig, profile: EngineProfile): Record<string, number> {
  return { ...config.scoring_weights, ...profile.scoring_weights_override };
}
