/**
 * Singular / atomic quality rule (INCOSE-style).
 *
 * A requirement is singular when it states one obligation about one subject
 * acting on one object (or tightly related set), so it can be implemented,
 * verified, and traced independently. Compound statements hide extra
 * requirements and make pass/fail ambiguous.
 *
 * This pass inspects `normalized_text` only. It does not use the semantic
 * frame. Findings feed the Singular score via attribute `"Singular"`.
 *
 * Config:
 * - `thresholds.max_words_for_singular_warn` — word-count ceiling (default 60)
 * - `singular_conjunction_patterns.count_and_or_as_compound` — when false,
 *   standalone "and"/"or" counting is skipped
 */
import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

/** Registry / profile id for this quality block. */
export const BLOCK_ID = "deterministic.singular";

/**
 * Count whole-word coordinating conjunctions (`and`, `or`).
 *
 * Word boundaries prevent false hits inside tokens such as "unauthorized"
 * or "information". The slash form "and/or" is handled separately as
 * combinatorial phrasing; it still contains standalone `and` and `or` if
 * split, but the dedicated `and/or` check is the primary signal for that case.
 */
export function countStandaloneConjunctions(text: string): number {
  const re = /\b(?:and|or)\b/gi;
  return (text.match(re) ?? []).length;
}

/**
 * Evaluate whether a single requirement statement appears atomic.
 * Returns zero or more findings; callers may emit several on one row.
 */
export function runSingular(req: CanonicalRequirement, ctx: DeterministicContext): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;

  // --- Statement metrics ----------------------------------------------------
  // Obligation verbs: more than one shall/must usually means multiple
  // requirements were concatenated. Should/may are not counted here; those
  // are modality/quality issues, not extra mandatory clauses.
  const shallCount = (text.match(/\bshall\b/gi) ?? []).length;
  const mustCount = (text.match(/\bmust\b/gi) ?? []).length;
  const obligations = shallCount + mustCount;

  // Length heuristic: long prose is harder to verify as one acceptance
  // criterion. Threshold is configurable per organization.
  const maxWords = ctx.config.thresholds.max_words_for_singular_warn ?? 60;
  const words = text.split(/\s+/).filter(Boolean).length;

  // Conjunction load: two or more standalone and/or plus an obligation is a
  // weak signal of a compound statement (lists, dual actions, alternatives).
  const conj =
    ctx.config.singular_conjunction_patterns.count_and_or_as_compound !== false
      ? countStandaloneConjunctions(text)
      : 0;

  // --- Rule: multiple_obligations (medium) ----------------------------------
  // Two or more shall/must in one statement. Split into separately IDed
  // requirements so each can be allocated and verified on its own.
  if (obligations >= 2) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "medium",
        confidence: 0.8,
        issue_type: "multiple_obligations",
        explanation: "Multiple shall/must clauses suggest more than one requirement in a single statement.",
        evidence_span: `shall=${shallCount}, must=${mustCount}`,
        suggested_rewrite: "Split into separate requirements with distinct IDs.",
      })
    );
  }

  // --- Rule: combinatorial_phrasing (medium) --------------------------------
  // Literal "and/or" (or AND/OR) packs inclusive/exclusive alternatives into
  // one line. Reviewers cannot tell which combination is mandatory.
  if (/\band\/or\b/i.test(text)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "medium",
        confidence: 0.78,
        issue_type: "combinatorial_phrasing",
        explanation: "‘And/or’ style phrasing often bundles alternatives that should be decomposed.",
      })
    );
  }

  // --- Rule: conjunction_heavy (low) ----------------------------------------
  // Needs both an obligation and at least two standalone and/or tokens so
  // ordinary "The system shall A and B" (one conjunction) is not flagged.
  // Lower severity: lists can be legitimate, but they often hide a second
  // requirement.
  if (conj >= 2 && obligations >= 1) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "low",
        confidence: 0.72,
        issue_type: "conjunction_heavy",
        explanation:
          "Multiple standalone ‘and’/‘or’ conjunctions with obligations may indicate a compound requirement.",
        evidence_span: `conjunction_count=${conj}`,
      })
    );
  }

  // --- Rule: overlong_clause (low) ------------------------------------------
  // Word count above the configured cap. Not a grammar error; a prompt to
  // decompose so verification remains atomic.
  if (words > maxWords) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Singular",
        severity: "low",
        confidence: 0.68,
        issue_type: "overlong_clause",
        explanation: "Very long requirements are harder to verify atomically; consider decomposition.",
        evidence_span: `word_count=${words}`,
      })
    );
  }

  return findings;
}
