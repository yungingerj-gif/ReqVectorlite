import { createFinding } from "../deterministic/newFinding";
import type { CanonicalRequirement, StructuredFinding } from "../types";
import type { RequirementSemantics } from "./semantics";
import { BLOCK_INTRA } from "./blockIds";
import { hasSharedNumericalThresholdUnit, sameActorForIntraContradictionPair } from "./intraPairGuards";
import { jaccard, tokenSet } from "./textUtils";

const L6 = "L6_Contradiction";

function opposingModality(a: RequirementSemantics, b: RequirementSemantics): boolean {
  const pa = new Set(a.polarities);
  const pb = new Set(b.polarities);
  const aReq = pa.has("required") && !pa.has("prohibited");
  const bProh = pb.has("prohibited") || pb.has("negative");
  const bReq = pb.has("required") && !pb.has("prohibited");
  const aProh = pa.has("prohibited") || pa.has("negative");
  return (aReq && bProh) || (bReq && aProh);
}

function boundKind(comparator?: string, raw?: string): "upper" | "lower" | "equal" | "unknown" {
  const s = `${comparator ?? ""} ${raw ?? ""}`.toLowerCase();
  if (s.includes(">=")) return "lower";
  if (s.includes("<=")) return "upper";
  if (/(?:^|\s)>(?!=)/.test(s) || /\bgreater than\b|\bmore than\b|\bexceed/.test(s)) return "lower";
  if (/(?:^|\s)<(?!=)/.test(s) || /\bless than\b|\bbelow\b/.test(s)) return "upper";
  if (/\bmin(?:imum)?\b|\bat least\b|\bno less/.test(s)) return "lower";
  if (/\bmax(?:imum)?\b|\bat most\b|\bno more|\bnot exceed/.test(s)) return "upper";
  if (s.includes("=")) return "equal";
  return "unknown";
}

function numericConflict(a: RequirementSemantics, b: RequirementSemantics): NumericConflictResult {
  if (!sameActorForIntraContradictionPair(a, b)) {
    return { hit: false };
  }

  for (const ta of a.thresholds) {
    for (const tb of b.thresholds) {
      if (!ta.unit || !tb.unit || ta.unit !== tb.unit) continue;
      if (ta.parameter && tb.parameter && ta.parameter !== tb.parameter) continue;
      const va = ta.numericValue;
      const vb = tb.numericValue;
      if (Number.isNaN(va) || Number.isNaN(vb)) continue;

      const aKind = boundKind(ta.comparator, ta.raw);
      const bKind = boundKind(tb.comparator, tb.raw);

      if (aKind === "upper" && bKind === "lower" && va < vb) {
        return {
          hit: true,
          kind: "bound_conflict",
          detail: `Conflicting bounds for the same actor on ${ta.parameter ?? ta.unit}: one caps at ${va}, another requires at least ${vb}.`,
        };
      }
      if (aKind === "lower" && bKind === "upper" && va > vb) {
        return {
          hit: true,
          kind: "bound_conflict",
          detail: `Conflicting bounds for the same actor on ${ta.parameter ?? ta.unit}: one requires at least ${va}, another caps at ${vb}.`,
        };
      }
      if (
        Math.abs(va - vb) > 1e-6 &&
        aKind === bKind &&
        aKind !== "unknown" &&
        (ta.parameter == null || tb.parameter == null || ta.parameter === tb.parameter)
      ) {
        return {
          hit: true,
          kind: "value_mismatch",
          detail: `Same actor and bound direction but different numeric values (${va} vs ${vb}) in ${ta.unit}.`,
        };
      }
    }
  }
  return { hit: false };
}

export function runIntraDeterministicContradictionChecks(
  a: CanonicalRequirement,
  b: CanonicalRequirement,
  sa: RequirementSemantics,
  sb: RequirementSemantics
): StructuredFinding[] {
  const out: StructuredFinding[] = [];

  const num = numericConflict(sa, sb);
  if (num.hit) {
    const severity = num.kind === "bound_conflict" ? "high" : "medium";
    out.push(
      createFinding({
        requirement_id: a.id,
        block_id: BLOCK_INTRA,
        attribute: "ConsistentCorrect",
        severity,
        confidence: num.kind === "bound_conflict" ? 0.85 : 0.78,
        issue_type: "intra.numeric_conflict",
        explanation: num.detail,
        evidence_span: `${a.id}: ${sa.thresholds[0]?.raw ?? a.normalized_text.slice(0, 120)} | ${b.id}: ${sb.thresholds[0]?.raw ?? b.normalized_text.slice(0, 120)}`,
        related_requirement_ids: [b.id],
        layer: L6,
      })
    );
  }

  if (
    sameActorForIntraContradictionPair(sa, sb) &&
    hasSharedNumericalThresholdUnit(sa, sb) &&
    opposingModality(sa, sb)
  ) {
    const jac = jaccard(tokenSet(a.normalized_text), tokenSet(b.normalized_text));
    if (jac >= 0.12) {
      out.push(
        createFinding({
          requirement_id: a.id,
          block_id: BLOCK_INTRA,
          attribute: "ConsistentCorrect",
          severity: "medium",
          confidence: 0.72,
          issue_type: "intra.behavioral_conflict",
          explanation:
            "One requirement reads as obligatory/positive and the other as prohibition or negative obligation over a related scope.",
          evidence_span: `${a.normalized_text.slice(0, 100)} … / … ${b.normalized_text.slice(0, 100)}`,
          related_requirement_ids: [b.id],
          layer: L6,
        })
      );
    }
  }

  if (sa.conditions.length && sb.conditions.length) {
    const overlap = sa.conditions.some((c) =>
      sb.conditions.some((d) => c.slice(0, 20) === d.slice(0, 20) || c.includes(d.slice(0, 15)))
    );
    if (overlap && opposingModality(sa, sb)) {
      out.push(
        createFinding({
          requirement_id: a.id,
          block_id: BLOCK_INTRA,
          attribute: "ConsistentCorrect",
          severity: "medium",
          confidence: 0.68,
          issue_type: "intra.condition_conflict",
          explanation: "Shared conditional context but opposing obligation polarity between the two requirements.",
          related_requirement_ids: [b.id],
          layer: L6,
        })
      );
    }
  }

  return out;
}
