/**
 * Unambiguous quality rule (INCOSE-style).
 *
 * A requirement is unambiguous when a competent reader would interpret the
 * same mandatory behavior. Vague adjectives, banned vocabulary, and weak
 * modals leave the statement open to negotiation instead of verification.
 *
 * Dictionaries come from engine config (organization-editable):
 * - `dictionaries.vague_terms` — multi-word phrases or single tokens
 * - `dictionaries.banned_terms` — organization-forbidden wording
 * - `dictionaries.weak_modals` — typically should / may / could / might
 *
 * Matching: multi-word vague terms are substring (case-insensitive);
 * single-word vague terms and weak modals are whole-word so "may" does not
 * hit "maybe" incorrectly beyond `\b` (and "information" is not "or").
 *
 * Findings use attribute `"Unambiguous"`.
 */
import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

/** Registry / profile id for this quality block. */
export const BLOCK_ID = "deterministic.unambiguous";

/** Case-insensitive substring match (used for phrases and banned terms). */
function containsPhrase(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i").test(haystack);
}

/** Case-insensitive whole-word match (used for single-token dictionary hits). */
function containsWholeWord(haystack: string, word: string): boolean {
  const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
  return re.test(haystack);
}

/**
 * Scan one requirement against vague, banned, and weak-modal dictionaries.
 */
export function runUnambiguous(
  req: CanonicalRequirement,
  ctx: DeterministicContext
): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;
  const lower = text.toLowerCase();

  // --- Dictionary scan ------------------------------------------------------
  // Collect hits first so one finding lists all offending terms rather than
  // emitting one finding per word.
  const vagueHits: string[] = [];
  for (const term of ctx.config.dictionaries.vague_terms) {
    if (term.includes(" ")) {
      if (containsPhrase(text, term)) vagueHits.push(term);
    } else if (containsWholeWord(lower, term)) {
      vagueHits.push(term);
    }
  }

  for (const term of ctx.config.dictionaries.banned_terms) {
    if (term.length > 0 && containsPhrase(text, term)) {
      vagueHits.push(`banned:${term}`);
    }
  }

  // --- Rule: vague_or_subjective_language (high) ----------------------------
  // Subjective or non-measurable wording ("quickly", "user friendly") cannot
  // be a pass/fail criterion until replaced with an objective limit or state.
  if (vagueHits.length > 0) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Unambiguous",
        severity: "high",
        confidence: 0.92,
        issue_type: "vague_or_subjective_language",
        explanation:
          "The requirement uses vague, subjective, or non-measurable wording. Replace with objective, testable criteria.",
        evidence_span: vagueHits.slice(0, 15).join("; "),
        suggested_rewrite: `The system shall [define measurable behavior] for: ${req.normalized_text.slice(0, 120)}…`,
      })
    );
  }

  // --- Rule: weak_modal (medium) --------------------------------------------
  // should/may/could/might are allowed language for goals, not for binding
  // product requirements. Suggest promoting to shall.
  const weakHits = ctx.config.dictionaries.weak_modals.filter((w) => containsWholeWord(lower, w));
  if (weakHits.length > 0) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Unambiguous",
        severity: "medium",
        confidence: 0.85,
        issue_type: "weak_modal",
        explanation:
          "Weak modals (should/may/could) reduce binding clarity. Use 'shall' or 'must' for mandatory behavior.",
        evidence_span: weakHits.join(", "),
        suggested_rewrite: req.normalized_text.replace(/\b(should|may|could|might)\b/gi, "shall"),
      })
    );
  }

  return findings;
}
