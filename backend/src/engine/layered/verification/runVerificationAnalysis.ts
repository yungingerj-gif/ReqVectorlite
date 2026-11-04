import { createFinding } from "../deterministic/newFinding";
import type { DeterministicContext } from "../deterministic/ruleContext";
import { semanticFrameOf } from "../canonicalAccess";
import type { CanonicalRequirement, StructuredFinding } from "../types";

/** Historic id (config / scoring). */
export const LEGACY_BLOCK_ID = "deterministic.verifiable";
export const BLOCK_ID = "verification.analysis";

const VISUAL_CRITERION =
  /\b(illuminat(?:e|es|ed|ion)|visible|displayed|shown|appearance|telltale|\bleds?\b|warning\s+(?:lamp|light)|indicator\s+(?:lamp|light)|status\s+(?:lamp|light)|\blamp\b|\bicon\b|on[\s-]screen|colour(?:ed)?|colored|turns?\s+(?:red|green|amber|yellow|blue|white)|(?:shall|must)\s+be\s+(?:red|green|amber|yellow|blue|white))\b/i;

const REFERENCED_CRITERION =
  /\b(?:within\s+(?:the\s+)?(?:defined\s+|specified\s+|stated\s+|documented\s+)?tolerance|tolerance(?:s)?\s+(?:specified|defined|given|stated|documented|provided|listed)|(?:as|when)\s+(?:specified|defined|stated|documented|required)\s+(?:in|by|per|on)|in\s+accordance\s+with|according\s+to|per\s+(?:the\s+)?(?:applicable\s+)?(?:ICD|SRS|IRS|standard|specification|drawing|table|document|datasheet|requirement|parent)|(?:refer(?:red|ence)?\s+to|see)\s+(?:requirement|document|table|section|spec(?:ification)?|drawing|ICD|SRS)|(?:defined|specified)\s+(?:outside|elsewhere)|outside(?:\s+of)?\s+this\s+requirement|(?:another|external|parent|source)\s+(?:requirement|specification|document)|as\s+(?:given|listed|shown)\s+in)\b/i;

function hasQuantitativeCriterion(req: CanonicalRequirement): boolean {
  const params = semanticFrameOf(req).parameters;
  return params.some((p) => Number.isFinite(p.value));
}

function hasVisualCriterion(req: CanonicalRequirement): boolean {
  const frame = semanticFrameOf(req);
  if (frame.verification_signals.some((s) => s.kind === "observable")) return true;
  return VISUAL_CRITERION.test(req.normalized_text) || VISUAL_CRITERION.test(req.source_text);
}

function hasReferencedCriterion(req: CanonicalRequirement): boolean {
  const frame = semanticFrameOf(req);
  if (frame.verification_signals.some((s) => s.kind === "referenced")) return true;
  return REFERENCED_CRITERION.test(req.normalized_text) || REFERENCED_CRITERION.test(req.source_text);
}

/**
 * Verifiable means the statement names something that can be checked
 * quantitatively, visually, or against a tolerance/value defined outside
 * this requirement. It does not require a verification method
 * (test / inspection / analysis / demonstration).
 */
export function runVerificationAnalysis(
  req: CanonicalRequirement,
  _ctx?: DeterministicContext
): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const frame = semanticFrameOf(req);
  const params = frame.parameters;
  const obligation = frame.obligation;
  const hasObligation = obligation === "shall" || obligation === "must";

  if (!hasObligation && frame.polarity !== "required") {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Verifiable",
        severity: "high",
        confidence: 0.84,
        issue_type: "no_objective_acceptance_basis",
        explanation:
          "Without shall/must, there is no objective obligation to check quantitatively, visually, or against a referenced criterion.",
        evidence_span: req.normalized_text.slice(0, 200),
        layer: "L_Verification",
      })
    );
    return findings;
  }

  const quantitative = hasQuantitativeCriterion(req);
  const visual = hasVisualCriterion(req);
  const referenced = hasReferencedCriterion(req);
  const hasCheckableCriterion = quantitative || visual || referenced;

  if (req.type === "Performance" && !quantitative && !referenced) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Verifiable",
        severity: "high",
        confidence: 0.82,
        issue_type: "missing_measurable_threshold",
        explanation:
          "Performance requirements need a quantitative claim (parameter, value, and unit) that can be measured.",
        missing_fields: ["parameter", "unit"],
        layer: "L_Verification",
      })
    );
  } else if (hasObligation && !hasCheckableCriterion) {
    findings.push(
      createFinding({
        requirement_id: req.id,
        block_id: BLOCK_ID,
        attribute: "Verifiable",
        severity: "medium",
        confidence: 0.7,
        issue_type: "missing_verification_path",
        explanation:
          "Nothing was parsed that can be checked quantitatively (a numeric limit), visually (an observable indication), or against a defined tolerance/value specified outside this requirement.",
        missing_fields: ["quantitative_or_visual_or_referenced_criterion"],
        layer: "L_Verification",
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
        explanation: "Numeric values should include units so the quantity can be checked repeatably.",
        layer: "L_Verification",
      })
    );
  }

  return findings;
}

/** @deprecated Use runVerificationAnalysis. */
export const runVerifiable = runVerificationAnalysis;
