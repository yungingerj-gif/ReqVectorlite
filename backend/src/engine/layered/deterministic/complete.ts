/**
 * Completeness quality rule (INCOSE-style).
 *
 * A requirement is complete when it names who is responsible, what shall be
 * done, and (for typed statements) the fields that type implies. Gaps here
 * usually mean the statement cannot be implemented or verified as written.
 *
 * Prefers the L0 semantic frame (`obligation`, `actor`, `action`,
 * `parameters`) attached on CanonicalRequirement; falls back to
 * `normalized_text` when a field was not parsed.
 *
 * Config:
 * - `thresholds.min_text_length_for_complete` — character floor (default 8)
 *
 * Findings use attribute `"Complete"`.
 */
import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

/** Registry / profile id for this quality block. */
export const BLOCK_ID = "deterministic.complete";

/** True when the frame or text has a binding shall/must (or required polarity). */
function hasObligation(req: CanonicalRequirement): boolean {
  const v = req.obligation ?? req.semantics?.obligation;
  if (v === "shall" || v === "must") return true;
  if ((req.polarity ?? req.semantics?.polarity) === "required") return true;
  return /\b(shall|must)\b/i.test(req.normalized_text);
}

/** True when a responsible entity was parsed into the subject/actor slot. */
function hasActor(req: CanonicalRequirement): boolean {
  const actor = req.actor ?? req.semantics?.actor;
  return Boolean(actor && actor.length > 0);
}

/** Numeric claims from the single L0 parse — not re-scanned here. */
function parametersOf(req: CanonicalRequirement) {
  return req.parameters ?? req.semantics?.parameters ?? [];
}

/**
 * Evaluate whether a requirement has the structural pieces its type needs.
 * Several findings may apply to one row.
 */
export function runComplete(req: CanonicalRequirement, ctx: DeterministicContext): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;
  const minLen = ctx.config.thresholds.min_text_length_for_complete ?? 8;

  // --- Rule: insufficient_detail (medium) -----------------------------------
  // Extremely short strings cannot carry actor + obligation + object.
  if (text.length < minLen) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "medium",
        confidence: 0.88,
        issue_type: "insufficient_detail",
        explanation: "Requirement text is too short to contain a complete obligation and context.",
        evidence_span: text,
        missing_fields: ["detail", "context"],
      })
    );
  }

  // --- Rule: missing_obligation_verb (high) ---------------------------------
  // Without shall/must there is no mandatory statement to implement.
  if (!hasObligation(req)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "high",
        confidence: 0.9,
        issue_type: "missing_obligation_verb",
        explanation: "No explicit normative obligation (shall/must) was detected.",
        evidence_span: text.slice(0, 200),
        missing_fields: ["obligation"],
        suggested_rewrite: `The system shall ${text.charAt(0).toLowerCase()}${text.slice(1)}`,
      })
    );
  }

  // --- Rule: missing_actor (medium) -----------------------------------------
  // Actor comes from the subject span before the obligation verb. Confidence
  // is lower because some styles omit a named entity by convention.
  if (!hasActor(req)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "medium",
        confidence: 0.4,
        issue_type: "missing_actor",
        explanation: "Responsible entity (actor) is not clearly stated.",
        missing_fields: ["actor"],
        suggested_rewrite: `The system shall ${text.replace(/^(?:the\s+)?/i, "")}`,
      })
    );
  }

  // --- Rule: performance_without_metric (high) ------------------------------
  // Performance type implies how well, not only what. Flag when the parser
  // found no parameter and the text has no digit at all.
  if (req.type === "Performance" && parametersOf(req).length === 0 && !/\d/.test(text)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "high",
        confidence: 0.86,
        issue_type: "performance_without_metric",
        explanation:
          "Performance-type requirement has no measurable value or extracted parameter in the text.",
        missing_fields: ["measurable_threshold", "unit"],
      })
    );
  }

  // --- Rule: interface_missing_context (medium) -----------------------------
  // Interface type should name a medium or protocol so the boundary is testable.
  if (
    req.type === "Interface" &&
    !/\b(interface|bus|protocol|api|signal|connector|port|message|packet|can|ethernet|uart)\b/i.test(
      text
    )
  ) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "medium",
        confidence: 0.75,
        issue_type: "interface_missing_context",
        explanation:
          "Interface-type requirement should name interfacing entities and the logical/physical medium.",
        missing_fields: ["interface_entity", "medium_or_protocol"],
      })
    );
  }

  // --- Rule: incomplete_action_structure (low) ------------------------------
  // Obligation without a usable action verb and without parameters is often
  // a fragment ("The system shall.").
  const action = req.action ?? req.semantics?.action;
  if (hasObligation(req) && (!action || action.length < 3) && parametersOf(req).length === 0) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Complete",
        severity: "low",
        confidence: 0.7,
        issue_type: "incomplete_action_structure",
        explanation: "The action following the obligation verb is unclear or too generic.",
        missing_fields: ["action"],
      })
    );
  }

  return findings;
}
