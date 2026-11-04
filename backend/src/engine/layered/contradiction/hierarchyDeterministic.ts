import { createFinding } from "../deterministic/newFinding";
import type { CanonicalRequirement, StructuredFinding } from "../types";
import type { RequirementSemantics } from "./semantics";
import { BLOCK_HIERARCHY } from "./blockIds";

const L6 = "L6_Contradiction";

function isUpperBound(raw: string, comparator?: string): boolean {
  const s = `${comparator ?? ""} ${raw}`.toLowerCase();
  if (s.includes(">=")) return false;
  if (s.includes("<=")) return true;
  return /\b(max|maximum|less\s+than|at\s+most|no\s+more|upper|not\s+exceed|<(?!=))\b/.test(s);
}

function isLowerBound(raw: string, comparator?: string): boolean {
  const s = `${comparator ?? ""} ${raw}`.toLowerCase();
  if (s.includes("<=")) return false;
  if (s.includes(">=")) return true;
  return /\b(min|minimum|greater\s+than|at\s+least|no\s+less|lower|>(?!=))\b/.test(s);
}

export function runHierarchyDeterministicChecks(
  parent: CanonicalRequirement,
  child: CanonicalRequirement,
  sp: RequirementSemantics,
  sc: RequirementSemantics
): StructuredFinding[] {
  const out: StructuredFinding[] = [];

  if (sp.thresholds.length > 0 && (parent.type === "Performance" || child.type === "Performance")) {
    const parentUnits = new Set(sp.thresholds.map((t) => t.unit).filter(Boolean) as string[]);
    const childUnits = new Set(sc.thresholds.map((t) => t.unit).filter(Boolean) as string[]);
    let anyMissing = false;
    for (const u of parentUnits) {
      if (!childUnits.has(u)) anyMissing = true;
    }
    if (anyMissing) {
      out.push(
        createFinding({
          requirement_id: child.id,
          block_id: BLOCK_HIERARCHY,
          attribute: "ConsistentCorrect",
          severity: "medium",
          confidence: 0.66,
          issue_type: "hierarchy.omitted_inherited_constraint",
          explanation: `Parent ${parent.id} states quantitative bounds; child ${child.id} does not restate a compatible limit for the same unit family.`,
          evidence_span: `${parent.normalized_text.slice(0, 100)} → ${child.normalized_text.slice(0, 100)}`,
          related_requirement_ids: [parent.id],
          layer: L6,
        })
      );
    }
  }

  for (const pt of sp.thresholds) {
    const childMatch = sc.thresholds.filter((t) => t.unit && pt.unit && t.unit === pt.unit);
    for (const ct of childMatch) {
      const parentUpper = isUpperBound(pt.raw, pt.comparator);
      const childUpper = isUpperBound(ct.raw, ct.comparator);
      const parentLower = isLowerBound(pt.raw, pt.comparator);
      const childLower = isLowerBound(ct.raw, ct.comparator);
      if (parentUpper && childUpper && ct.numericValue > pt.numericValue) {
        out.push(
          createFinding({
            requirement_id: child.id,
            block_id: BLOCK_HIERARCHY,
            attribute: "ConsistentCorrect",
            severity: "high",
            confidence: 0.78,
            issue_type: "hierarchy.relaxed_parent_constraint",
            explanation: `Child allows a looser upper bound (${ct.raw}) than parent (${pt.raw}) on ${pt.unit ?? "metric"}.`,
            evidence_span: `${parent.id}: ${pt.raw} | ${child.id}: ${ct.raw}`,
            related_requirement_ids: [parent.id],
            layer: L6,
          })
        );
      }
      if (parentLower && childLower && ct.numericValue < pt.numericValue) {
        out.push(
          createFinding({
            requirement_id: child.id,
            block_id: BLOCK_HIERARCHY,
            attribute: "ConsistentCorrect",
            severity: "high",
            confidence: 0.75,
            issue_type: "hierarchy.conflicting_lower_bound",
            explanation: `Child minimum (${ct.raw}) is stricter or conflicts with parent's lower expectation (${pt.raw}).`,
            evidence_span: `${parent.id}: ${pt.raw} | ${child.id}: ${ct.raw}`,
            related_requirement_ids: [parent.id],
            layer: L6,
          })
        );
      }
    }
  }

  const pProh = sp.polarities.includes("prohibited");
  const cReq = sc.polarities.includes("required") && !sc.polarities.includes("prohibited");
  if (pProh && cReq) {
    out.push(
      createFinding({
        requirement_id: child.id,
        block_id: BLOCK_HIERARCHY,
        attribute: "ConsistentCorrect",
        severity: "high",
        confidence: 0.7,
        issue_type: "hierarchy.behavioral_conflict",
        explanation: `Parent ${parent.id} reads as prohibitive while child ${child.id} states an obligation on the linked scope.`,
        evidence_span: `${parent.normalized_text.slice(0, 90)} … ${child.normalized_text.slice(0, 90)}`,
        related_requirement_ids: [parent.id],
        layer: L6,
      })
    );
  }

  return out;
}
