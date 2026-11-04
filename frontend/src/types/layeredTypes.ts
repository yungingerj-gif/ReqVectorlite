/** Mirrors `backend/src/engine/layered/types.ts` for the UI. */

export type AnalysisMode = "active" | "legacy";

export interface CanonicalRequirement {
  id: string;
  source_text: string;
  normalized_text: string;
  explicit_id: boolean;
  type: string;
  actor?: string;
  obligation?: string;
  polarity?: string;
  action?: string;
  object?: string;
  conditions?: string[];
  modes?: string[];
  states?: string[];
  parameters?: Array<{
    parameter: string;
    operator: "<" | "<=" | ">" | ">=" | "=";
    value: number;
    unit?: string;
    evidence_span?: string;
  }>;
  verification_signals?: Array<{
    kind: string;
    name: string;
    evidence_span?: string;
  }>;
  thresholds?: Array<{ value: string; unit?: string; comparator?: string }>;
  semantics?: {
    actor?: string;
    obligation?: string;
    polarity?: string;
    action?: string;
    object?: string;
    conditions: string[];
    modes: string[];
    states: string[];
    parameters: Array<{
      parameter: string;
      operator: "<" | "<=" | ">" | ">=" | "=";
      value: number;
      unit?: string;
      evidence_span?: string;
    }>;
    verification_signals: Array<{
      kind: string;
      name: string;
      evidence_span?: string;
    }>;
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

export type QualityScore = 0 | 1 | 2;

export interface QualityVector {
  necessary: QualityScore;
  unambiguous: QualityScore;
  complete: QualityScore;
  feasible: QualityScore;
  verifiable: QualityScore;
  maturity: QualityScore;
  /** q_i, 0–100. Row sum of Q divided by the maximum weighted row. */
  quality_score: number;
  safety_critical: boolean;
  weight: number;
}

export interface DocumentMaturity {
  completeness: QualityScore;
  consistency: QualityScore;
  bounded: QualityScore;
  feasible: QualityScore;
  maturity: QualityScore;
  weighted_feasibility: number;
  weighted_verifiability: number;
  safety_critical_weight: number;
  safety_critical_count: number;
  /** M_sys, mean of q_i, 0–100. */
  system_maturity_index: number;
  /** Column means of R. Order: necessary, unambiguous, complete, feasible, verifiable. */
  defect_profile: number[];
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
  scores: QualityVector;
  legacy?: LegacyReconstructionResult;
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
    organization_id?: string;
    contradiction?: LayeredContradictionMeta;
  };
  requirements: PerRequirementResult[];
  set_level_findings: StructuredFinding[];
  quality_matrix: number[][];
  weight_matrix: number[][];
  weighted_evaluation_matrix: number[][];
  document_maturity: DocumentMaturity;
  parent_requirements?: CanonicalRequirement[];
}
