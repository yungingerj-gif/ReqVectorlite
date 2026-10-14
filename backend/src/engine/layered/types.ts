/**
 * Layered requirements analysis engine — public contracts (MVP).
 */

export type AnalysisMode = "active" | "legacy";

export type CanonicalRequirementType =
  | "Functional"
  | "Performance"
  | "Interface"
  | "Constraint"
  | "General"
  | "Unknown";

export type ComparisonOperator = "<" | "<=" | ">" | ">=" | "=";

/** First-class measurable claim produced by the L0 semantic parser. */
export interface RequirementParameter {
  parameter: string;
  operator: ComparisonOperator;
  value: number;
  unit?: string;
  evidence_span?: string;
}

export type ObligationVerb = "shall" | "must" | "should" | "may" | "could" | "might";

/**
 * Single semantic frame for a requirement. Built once at normalize time; rules should
 * read this instead of re-parsing `normalized_text`.
 */
export interface RequirementSemanticFrame {
  actor?: string;
  action?: string;
  object?: string;
  conditions: string[];
  parameters: RequirementParameter[];
  obligation?: ObligationVerb;
  polarity: "required" | "prohibited" | "allowed" | "unknown";
}

/** @deprecated Prefer RequirementParameter. Kept for older findings/tests. */
export interface ThresholdSpec {
  value: string;
  unit?: string;
  comparator?: string;
}

export interface CanonicalRequirement {
  id: string;
  source_text: string;
  normalized_text: string;
  explicit_id: boolean;

  type: CanonicalRequirementType;

  /** Parsed once in normalizeCanonical. Absent only on hand-built test fixtures. */
  semantics?: RequirementSemanticFrame;

  actor?: string;
  action?: string;
  object?: string;
  conditions?: string[];
  /** Derived from `semantics.parameters` when normalized. */
  thresholds?: ThresholdSpec[];
  /** Same objects as `semantics.parameters` (first-class parameters). */
  parameters?: RequirementParameter[];

  tags?: string[];
  custom_attributes?: Record<string, unknown>;
}

export type FindingAttribute =
  | "Unambiguous"
  | "Complete"
  | "Verifiable"
  | "Singular"
  | "ConsistentCorrect"
  | "LegacyReconstruction"
  | "CrossRequirement";

export type FindingSeverity = "low" | "medium" | "high";

export interface StructuredFinding {
  finding_id: string;
  requirement_id: string;
  layer: string;
  block_id: string;
  attribute: FindingAttribute;
  severity: FindingSeverity;
  confidence: number;
  issue_type: string;
  explanation: string;
  evidence_span?: string;
  suggested_rewrite?: string;
  missing_fields?: string[];
  related_requirement_ids?: string[];
}

export interface AiAttributeAssessment {
  attribute: "Unambiguous" | "Complete" | "Verifiable" | "Singular" | "ConsistentCorrect";
  severity: FindingSeverity;
  confidence: number;
  explanation: string;
  evidence_span?: string;
  suggested_rewrite?: string;
  missing_fields?: string[];
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

export interface RequirementScores {
  unambiguous: number;
  complete: number;
  verifiable: number;
  singular: number;
  consistent_correct: number;
  overall: number;
}

export interface RequirementSemanticMeta {
  cluster_id: number;
  embedding_model?: string;
}

export interface PerRequirementResult {
  requirement: CanonicalRequirement;
  findings: StructuredFinding[];
  scores: RequirementScores;
  legacy?: LegacyReconstructionResult;
  /** Present when semantic embedding layer ran for this analysis. */
  semantic?: RequirementSemanticMeta;
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
  /** Multipart upload included a parent_file field (server received it). */
  parent_file_in_request?: boolean;
  /** Count of parent requirements after normalization (includes synthetic fallback when needed). */
  parent_requirement_count?: number;
  /** Multipart included parent_file but ingest produced no text (parent–child pass skipped). */
  parent_extraction_failed?: boolean;
}

export interface LayeredAnalysisMeta {
  profile: string;
  mode: AnalysisMode;
  analyzed_at: string;
  requirement_count: number;
  /** Display name for the primary (child) analyzed document, e.g. uploaded filename. */
  source_document?: string;
  /** Display name for the parent specification when parent–child analysis ran, e.g. parent upload filename. */
  parent_source_document?: string;
  ai_enabled: boolean;
  organization_id?: string;
  contradiction?: LayeredContradictionMeta;
  /** Embedding-based clustering / contradiction pre-filter telemetry */
  semantic_embedding?: SemanticEmbeddingMeta;
}

export interface LayeredAnalysisResult {
  meta: LayeredAnalysisMeta;
  requirements: PerRequirementResult[];
  set_level_findings: StructuredFinding[];
  /** Present when a parent specification was analyzed (for hierarchy findings UI). */
  parent_requirements?: CanonicalRequirement[];
}

export interface TraceLinkInput {
  parent_requirement_id: string;
  child_requirement_id: string;
}

export interface EngineRunOptions {
  rawText: string;
  source_document: string;
  profile: string;
  mode: AnalysisMode;
  parseOptions?: import("../../models/requirements").RequirementsAnalyzeOptions;
  /** Optional parent specification text (same parse rules as rawText). Enables parent–child contradiction pass vs main `rawText` child set. */
  parent_raw_text?: string;
  /** Human-readable parent document name for reporting (e.g. original filename). */
  parent_source_document?: string;
  /** Explicit parent/child ID links when both documents use the same id scheme. */
  trace_links?: TraceLinkInput[];
  /**
   * Prepended to every layered LLM system prompt (after loading from `data/ai-training-pack.json` or UI).
   * Used for proprietary layout steering — not fine-tuning.
   */
  ai_organization_context?: string;
}
