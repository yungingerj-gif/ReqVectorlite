import * as fs from "fs";
import * as path from "path";

export interface EngineProfile {
  id: string;
  mode: "active" | "legacy";
  enabled_rule_blocks: string[];
  ai_attribute_analysis: boolean;
  ai_legacy_augment: boolean;
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
  ai_intra_enabled: boolean;
  ai_hierarchy_enabled: boolean;
  intra_ai_max_pairs: number;
  hierarchy_ai_max_pairs: number;
  /**
   * When true and OPENAI_API_KEY is set, embed requirements and pre-filter intra contradiction
   * candidates to top-K cosine neighbors (plus cluster IDs on output).
   */
  embedding_enabled: boolean;
  embedding_model: string;
  embedding_neighbor_top_k: number;
  embedding_neighbor_min_cosine: number;
  /** Union-merge clusters when pairwise cosine is at least this value. */
  embedding_cluster_min_cosine: number;
  /** Blend embedding cosine into hierarchy parent–child similarity matching. */
  embedding_hierarchy_match: boolean;
  embedding_hierarchy_min_cosine: number;
}

const DEFAULT_CONTRADICTION: ContradictionConfig = {
  intra_pair_budget: 120,
  intra_jaccard_floor: 0.14,
  same_type_bonus: 0.15,
  shared_object_weight: 0.18,
  shared_condition_bonus: 0.2,
  hierarchy_similarity_floor: 0.1,
  hierarchy_pair_budget: 80,
  ai_intra_enabled: false,
  ai_hierarchy_enabled: false,
  intra_ai_max_pairs: 10,
  hierarchy_ai_max_pairs: 12,
  embedding_enabled: false,
  embedding_model: "text-embedding-3-small",
  embedding_neighbor_top_k: 16,
  embedding_neighbor_min_cosine: 0.38,
  embedding_cluster_min_cosine: 0.62,
  embedding_hierarchy_match: true,
  embedding_hierarchy_min_cosine: 0.28,
};

/** Optional LLM pass for set-level cross-requirement same-intent detection. */
export interface SetLevelCrossConfig {
  ai_same_intent_enabled: boolean;
  /** Max pairs sent in one LLM batch (sorted by lexical similarity, strongest first). */
  ai_same_intent_max_pairs: number;
}

const DEFAULT_SET_LEVEL_CROSS: SetLevelCrossConfig = {
  ai_same_intent_enabled: false,
  ai_same_intent_max_pairs: 24,
};

function parseSetLevelCross(raw: unknown): SetLevelCrossConfig {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_SET_LEVEL_CROSS };
  const o = raw as Record<string, unknown>;
  return {
    ai_same_intent_enabled: Boolean(o.ai_same_intent_enabled ?? DEFAULT_SET_LEVEL_CROSS.ai_same_intent_enabled),
    ai_same_intent_max_pairs: Number(
      o.ai_same_intent_max_pairs ?? DEFAULT_SET_LEVEL_CROSS.ai_same_intent_max_pairs
    ),
  };
}

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
    ai_intra_enabled: Boolean(o.ai_intra_enabled ?? DEFAULT_CONTRADICTION.ai_intra_enabled),
    ai_hierarchy_enabled: Boolean(o.ai_hierarchy_enabled ?? DEFAULT_CONTRADICTION.ai_hierarchy_enabled),
    intra_ai_max_pairs: Number(o.intra_ai_max_pairs ?? DEFAULT_CONTRADICTION.intra_ai_max_pairs),
    hierarchy_ai_max_pairs: Number(o.hierarchy_ai_max_pairs ?? DEFAULT_CONTRADICTION.hierarchy_ai_max_pairs),
    embedding_enabled: Boolean(o.embedding_enabled ?? DEFAULT_CONTRADICTION.embedding_enabled),
    embedding_model: String(o.embedding_model ?? DEFAULT_CONTRADICTION.embedding_model),
    embedding_neighbor_top_k: Math.max(
      1,
      Math.floor(Number(o.embedding_neighbor_top_k ?? DEFAULT_CONTRADICTION.embedding_neighbor_top_k))
    ),
    embedding_neighbor_min_cosine: Number(
      o.embedding_neighbor_min_cosine ?? DEFAULT_CONTRADICTION.embedding_neighbor_min_cosine
    ),
    embedding_cluster_min_cosine: Number(
      o.embedding_cluster_min_cosine ?? DEFAULT_CONTRADICTION.embedding_cluster_min_cosine
    ),
    embedding_hierarchy_match: Boolean(
      o.embedding_hierarchy_match ?? DEFAULT_CONTRADICTION.embedding_hierarchy_match
    ),
    embedding_hierarchy_min_cosine: Number(
      o.embedding_hierarchy_min_cosine ?? DEFAULT_CONTRADICTION.embedding_hierarchy_min_cosine
    ),
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
  set_level_cross: SetLevelCrossConfig;
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
        ? (p.enabled_rule_blocks as unknown[]).map(String)
        : [],
      ai_attribute_analysis: Boolean(p.ai_attribute_analysis),
      ai_legacy_augment: Boolean(p.ai_legacy_augment),
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
    thresholds:
      typeof data.thresholds === "object" && data.thresholds
        ? (data.thresholds as Record<string, number>)
        : {},
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
    set_level_cross: parseSetLevelCross(data.set_level_cross),
    profiles: parseProfiles(data.profiles),
  };
  return lockRulesOnlyEngineConfig(parsed);
}

/**
 * ReqVectorlite: specification review is deterministic rules only (active spec).
 * AI passes, embeddings, and legacy reconstruction cannot be turned on via config or env.
 */
export function lockRulesOnlyEngineConfig(config: EngineConfig): EngineConfig {
  const registry = { ...config.rule_block_registry };
  registry["ai.attribute_analysis"] = false;
  registry["legacy.reconstruction"] = false;

  const activeBlocks = [
    "deterministic.unambiguous",
    "deterministic.complete",
    "deterministic.verifiable",
    "deterministic.singular",
    "deterministic.consistent_correct",
    "setLevel.cross_requirement",
    "contradiction.intra_document",
    "contradiction.parent_child",
  ];

  const defaultActive = config.profiles.default_active_spec;
  const profiles: Record<string, EngineProfile> = {
    default_active_spec: {
      id: "default_active_spec",
      mode: "active",
      enabled_rule_blocks: defaultActive
        ? defaultActive.enabled_rule_blocks.filter(
            (id) => id !== "legacy.reconstruction" && id !== "ai.attribute_analysis"
          )
        : activeBlocks,
      ai_attribute_analysis: false,
      ai_legacy_augment: false,
      scoring_weights_override: defaultActive?.scoring_weights_override ?? {},
    },
  };

  return {
    ...config,
    rule_block_registry: registry,
    contradiction: {
      ...config.contradiction,
      ai_intra_enabled: false,
      ai_hierarchy_enabled: false,
      embedding_enabled: false,
    },
    set_level_cross: {
      ...config.set_level_cross,
      ai_same_intent_enabled: false,
    },
    profiles,
  };
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

/** Kept for API compatibility; LLM same-intent cannot be enabled in this build. */
export function withSameIntentLlmEnabled(config: EngineConfig, _enabled: boolean): EngineConfig {
  return lockRulesOnlyEngineConfig(config);
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
