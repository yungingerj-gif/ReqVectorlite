/**
 * Consistent / correct quality rule (INCOSE-style), intra-statement only.
 *
 * Checks whether a single requirement is internally coherent and physically
 * plausible. Cross-requirement consistency lives in set-level and
 * contradiction engines, not here.
 *
 * Heuristics (pattern-based, not a physics solver):
 * - absolute wording that is easy to falsify or contradict
 * - unbounded / infeasible claims
 * - open-ended lists that leave verification scope undefined
 * - mixed shall / shall-not in one sentence (possible self-contradiction)
 * - percentages over 100%
 *
 * Findings use attribute `"ConsistentCorrect"`.
 */
import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

/** Registry / profile id for this quality block. */
export const BLOCK_ID = "deterministic.consistent_correct";

/**
 * Evaluate intra-statement consistency and obvious correctness issues.
 * `_ctx` is unused today; kept so all quality rules share the same signature.
 */
export function runConsistentCorrect(req: CanonicalRequirement, _ctx: DeterministicContext): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;

  // --- Rule: absolute_wording (low) -----------------------------------------
  // always / never / all conditions rarely survive real operating modes.
  // Prefer named conditions and exceptions so the statement can stay true.
  if (/\b(always|never|all\s+times|under\s+all\s+conditions)\b/i.test(text)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "ConsistentCorrect",
        severity: "low",
        confidence: 0.6,
        issue_type: "absolute_wording",
        explanation:
          "Absolute statements (always/never/all conditions) are easy to contradict; prefer bounded conditions and exceptions where needed.",
        evidence_span: text.slice(0, 200),
      })
    );
  }

  // --- Rule: potentially_infeasible (medium) --------------------------------
  // infinite / unlimited / zero defect / 100% of all — likely not achievable
  // or not meant literally. Reviewer should confirm intent and bound the claim.
  if (/\b(infinite|unlimited|zero\s+defect|100%\s+of\s+all)\b/i.test(text)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "ConsistentCorrect",
        severity: "medium",
        confidence: 0.55,
        issue_type: "potentially_infeasible",
        explanation: "Wording suggests physically or practically unbounded claims; validate feasibility.",
      })
    );
  }

  // --- Rule: open_ended_language (medium) -----------------------------------
  // "etc." and "and so on" mean the set of required items is not closed, so
  // a test cannot know when it has covered the requirement.
  if (/\betc\.?|and\s+so\s+on|and\s+more\b/i.test(text)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "ConsistentCorrect",
        severity: "medium",
        confidence: 0.7,
        issue_type: "open_ended_language",
        explanation: "Open-ended enumerations (etc.) leave verification scope undefined.",
        suggested_rewrite: "List all applicable items explicitly or reference a controlled list.",
      })
    );
  }

  // --- Rule: possible_internal_normative_tension (low) ----------------------
  // Both "shall" and "shall not" in the same statement, within 400 characters.
  // Often valid (permit A, forbid B); flag so a reviewer checks they cannot
  // apply to the same case.
  if (/\bshall\s+not\b/i.test(text) && /\bshall\b/i.test(text)) {
    const notIdx = text.search(/\bshall\s+not\b/i);
    const shallIdx = text.search(/\bshall\b/i);
    if (notIdx >= 0 && shallIdx >= 0 && Math.abs(notIdx - shallIdx) < 400) {
      findings.push(
        createFinding({
          requirement_id: req.id,
          block_id: BLOCK_ID,
          attribute: "ConsistentCorrect",
          severity: "low",
          confidence: 0.5,
          issue_type: "possible_internal_normative_tension",
          explanation:
            "Both positive and negative shall statements appear close together; ensure they cannot contradict under any valid interpretation.",
          evidence_span: text.slice(0, 220),
        })
      );
    }
  }

  // --- Rule: internal_numeric_conflict (high) -------------------------------
  // A percentage above 100% is almost always a typo or a confused metric.
  const percentMatches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  for (const m of percentMatches) {
    const v = Number(m[1]);
    if (v > 100) {
      findings.push(
        createFinding({
          requirement_id: req.id,
          block_id: BLOCK_ID,
          attribute: "ConsistentCorrect",
          severity: "high",
          confidence: 0.95,
          issue_type: "internal_numeric_conflict",
          explanation: "Percentage value exceeds 100%; check for typographical or logical error.",
          evidence_span: m[0],
        })
      );
    }
  }

  return findings;
}
