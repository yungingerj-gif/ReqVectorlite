/**
 * Factory for StructuredFinding rows produced by quality / verification rules.
 *
 * Always assigns a unique `finding_id` and a layer label. Optional evidence,
 * rewrite, missing fields, and related ids are omitted when empty so the
 * JSON payload stays small.
 *
 * Default layer is `L1_Deterministic` (quality rules). Verification analysis
 * passes `layer: "L_Verification"` explicitly.
 */
import { randomUUID } from "crypto";
import type { FindingAttribute, FindingSeverity, StructuredFinding } from "../types";

const L1 = "L1_Deterministic";

export function createFinding(p: {
  requirement_id: string;
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
  layer?: string;
}): StructuredFinding {
  const base: StructuredFinding = {
    finding_id: randomUUID(),
    requirement_id: p.requirement_id,
    layer: p.layer ?? L1,
    block_id: p.block_id,
    attribute: p.attribute,
    severity: p.severity,
    confidence: p.confidence,
    issue_type: p.issue_type,
    explanation: p.explanation,
  };
  if (p.evidence_span !== undefined) base.evidence_span = p.evidence_span;
  if (p.suggested_rewrite !== undefined) base.suggested_rewrite = p.suggested_rewrite;
  if (p.missing_fields !== undefined && p.missing_fields.length > 0) {
    base.missing_fields = p.missing_fields;
  }
  if (p.related_requirement_ids !== undefined && p.related_requirement_ids.length > 0) {
    base.related_requirement_ids = p.related_requirement_ids;
  }
  return base;
}
