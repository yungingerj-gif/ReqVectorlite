import type { CanonicalRequirement, LegacyReconstructionResult, StructuredFinding } from "./types";

const NO_TIMING = "threshold not specified";

function hasAnyDigit(s: string): boolean {
  return /\d/.test(s);
}

/**
 * Deterministic legacy reconstruction — never introduces numeric thresholds not present in source_text.
 */
export function reconstructLegacyHeuristic(
  req: CanonicalRequirement,
  _findings: StructuredFinding[]
): LegacyReconstructionResult {
  const src = req.source_text.trim();
  const norm = req.normalized_text;
  const missing: string[] = [];
  if (!req.actor) missing.push("actor");
  if (!/\b(shall|must)\b/i.test(norm)) missing.push("normative_obligation");
  if (!req.action || req.action.length < 4) missing.push("clear_action");
  if (req.type === "Performance" && !hasAnyDigit(src) && (!req.thresholds || req.thresholds.length === 0)) {
    missing.push("measurable_threshold");
  }
  if (req.type === "Interface" && !/\b(interface|api|protocol|bus|signal)\b/i.test(norm)) {
    missing.push("interface_identifier");
  }

  const weak = norm.replace(/\b(should|may|could|might)\b/gi, "shall");
  const minimal_cleanup_rewrite = weak.trim();

  const actionPart =
    req.action && req.action.length > 2
      ? req.action
      : "[action: derive from context — not explicit in source]";
  const actorPart = req.actor ?? "The system";
  let perfPart = "";
  const params = req.parameters ?? req.semantics?.parameters ?? [];
  if (hasAnyDigit(src) && params.length > 0) {
    perfPart = ` with ${params.map((p) => `${p.parameter} ${p.operator} ${p.value}${p.unit ? ` ${p.unit}` : ""}`).join(", ")}`;
  } else if (hasAnyDigit(src) && req.thresholds && req.thresholds.length > 0) {
    perfPart = ` with ${req.thresholds.map((t) => `${t.comparator ?? ""} ${t.value} ${t.unit ?? ""}`.trim()).join(", ")}`;
  } else if (req.type === "Performance" && !hasAnyDigit(src)) {
    perfPart = ` [${NO_TIMING}]`;
  }

  const system_level_rewrite = `${actorPart} shall ${actionPart}${perfPart}.`.replace(/\s+/g, " ").trim();
  const formal_rewrite = `[${req.id}] ${system_level_rewrite}`;

  const rationale = [
    "Heuristic reconstruction from legacy text.",
    missing.length > 0 ? `Missing: ${missing.join(", ")}.` : "Core fields partially present.",
    !hasAnyDigit(src) && req.type === "Performance"
      ? "No numeric timing/performance data in source; no specific threshold was invented."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  const result: LegacyReconstructionResult = {
    likely_intent: norm.slice(0, 200),
    inferred_type: req.type,
    reconstructed_requirement: system_level_rewrite,
    reconstruction_rationale: rationale,
    reconstruction_confidence: missing.length >= 3 ? 0.45 : missing.length >= 1 ? 0.62 : 0.78,
    minimal_cleanup_rewrite,
    system_level_rewrite,
    formal_rewrite,
  };
  if (missing.length > 0) {
    result.inferred_missing_fields = missing;
  }
  return result;
}
