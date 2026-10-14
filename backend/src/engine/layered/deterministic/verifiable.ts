import type { CanonicalRequirement, StructuredFinding } from "../types";
import { createFinding } from "./newFinding";
import type { DeterministicContext } from "./ruleContext";

export const BLOCK_ID = "deterministic.verifiable";

function parametersOf(req: CanonicalRequirement) {
  return req.parameters ?? req.semantics?.parameters ?? [];
}

export function runVerifiable(req: CanonicalRequirement, _ctx: DeterministicContext): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const text = req.normalized_text;
  const params = parametersOf(req);
  const obligation = req.semantics?.obligation;
  const hasObligation = obligation === "shall" || obligation === "must" || /\b(shall|must)\b/i.test(text);
  const qualitativeOnly =
    /\b(user-friendly|intuitive|easy|robust|reliable|appropriate|efficient)\b/i.test(text) &&
    params.length === 0 &&
    !/\d/.test(text);

  if (!hasObligation) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Verifiable",
        severity: "high",
        confidence: 0.84,
        issue_type: "no_objective_acceptance_basis",
        explanation:
          "Without shall/must, verification criteria cannot be tied to an objective obligation.",
        evidence_span: text.slice(0, 200),
      })
    );
    return findings;
  }

  if (req.type === "Performance" && params.length === 0) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Verifiable",
        severity: "high",
        confidence: 0.82,
        issue_type: "missing_measurable_threshold",
        explanation: "Performance requirements should state measurable limits (value and unit) or a defined test method.",
        missing_fields: ["threshold", "unit"],
      })
    );
  }

  if (qualitativeOnly && req.type !== "Functional") {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Verifiable",
        severity: "medium",
        confidence: 0.78,
        issue_type: "qualitative_only_wording",
        explanation:
          "Requirement relies on qualitative adjectives without measurable acceptance criteria.",
        evidence_span: text.slice(0, 200),
      })
    );
  }

  if (req.type === "Performance" && params.some((p) => p.unit == null || p.unit.length === 0)) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Verifiable",
        severity: "low",
        confidence: 0.65,
        issue_type: "numeric_without_unit",
        explanation: "Numeric values should include units for repeatable verification.",
      })
    );
  }

  return findings;
}
