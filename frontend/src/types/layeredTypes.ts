/** Mirrors `backend/src/engine/layered/types.ts` for the UI. */

export type AnalysisMode = "active" | "legacy";

export interface CanonicalRequirement {
  id: string;
  source_text: string;
  normalized_text: string;
  explicit_id: boolean;
  type: string;
  actor?: string;
  action?: string;
  object?: string;
  conditions?: string[];
  parameters?: Array<{
    parameter: string;
    operator: "<" | "<=" | ">" | ">=" | "=";
    value: number;
    unit?: string;
    evidence_span?: string;
  }>;
  thresholds?: Array<{ value: string; unit?: string; comparator?: string }>;
  semantics?: {
    actor?: string;
    action?: string;
    object?: string;
    conditions: string[];
    parameters: Array<{
      parameter: string;
      operator: "<" | "<=" | ">" | ">=" | "=";
      value: number;
      unit?: string;
      evidence_span?: string;
    }>;
    obligation?: string;
    polarity?: string;
  };
  tags?: string[];
}

export interface StructuredFinding {
  finding_id: string;
  requirement_id: string;
  layer: string;
  block_id: string;
  attribute: string;
  severity: "low" | "medium" | "high";
  confidence: number;
  issue_type: string;
  explanation: string;
  evidence_span?: string;
  suggested_rewrite?: string;
  missing_fields?: string[];
  related_requirement_ids?: string[];
}

export interface RequirementScores {
  unambiguous: number;
  complete: number;
  verifiable: number;
  singular: number;
  consistent_correct: number;
  overall: number;
}

export interface LegacyReconstructionResult {
  likely_intent?: string;
  inferred_type?: string;
  inferred_missing_fields?: string[];
  reconstructed_requirement?: string;
  reconstruction_rationale?: string;
  reconstruction_confidence?: number;
  minimal_cleanup_rewrite?: string;
  system_level_rewrite?: string;
  formal_rewrite?: string;
}

export interface PerRequirementResult {
  requirement: CanonicalRequirement;
  findings: StructuredFinding[];
  scores: RequirementScores;
  legacy?: LegacyReconstructionResult;
  /** Semantic embedding cluster (backend `embedding_enabled` + successful API call). */
  semantic?: { cluster_id: number; embedding_model?: string };
}

export interface SemanticEmbeddingMeta {
  enabled: boolean;
  skipped_reason?: string;
  model?: string;
  dimensions?: number;
  cluster_count?: number;
  neighbor_pair_count?: number;
  intra_prefilter_applied?: boolean;
  hierarchy_embedding_boost?: boolean;
}

export interface LayeredContradictionMeta {
  intra_enabled: boolean;
  hierarchy_enabled: boolean;
  intra_pairs_examined: number;
  hierarchy_pairs_examined: number;
  parent_file_in_request?: boolean;
  parent_requirement_count?: number;
  parent_extraction_failed?: boolean;
}

export interface LayeredAnalysisResult {
  meta: {
    profile: string;
    mode: AnalysisMode;
    analyzed_at: string;
    requirement_count: number;
    source_document?: string;
    parent_source_document?: string;
    ai_enabled: boolean;
    organization_id?: string;
    contradiction?: LayeredContradictionMeta;
    semantic_embedding?: SemanticEmbeddingMeta;
  };
  requirements: PerRequirementResult[];
  set_level_findings: StructuredFinding[];
  parent_requirements?: CanonicalRequirement[];
}
