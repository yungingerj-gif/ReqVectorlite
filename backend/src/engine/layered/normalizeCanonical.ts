import type { RequirementType } from "../../models/requirements";
import { parseRequirements } from "../../services/requirementsAnalyzeService";
import { classifyRequirementType } from "../../services/requirementTypeDesignator";
import type { RequirementsAnalyzeOptions } from "../../models/requirements";
import type { CanonicalRequirement, CanonicalRequirementType } from "./types";
import type { EngineConfig } from "./config";
import { parametersToThresholdSpecs, parseRequirementSemanticFrame } from "./semanticParse";

function mapToCanonicalType(rt: RequirementType): CanonicalRequirementType {
  switch (rt) {
    case "functional":
      return "Functional";
    case "performance":
      return "Performance";
    case "interface":
      return "Interface";
    case "constraint":
    case "safety":
    case "regulatory":
      return "Constraint";
    case "derived":
    case "cybersecurity":
    case "verification":
    case "environmental":
      return "General";
    default:
      return "Unknown";
  }
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * L0 — segmentation + one semantic parse per statement.
 * Downstream rules should read `semantics` / `parameters`, not re-parse the sentence.
 */
export function normalizeToCanonicalRequirements(
  rawText: string,
  _config: EngineConfig,
  parseOptions?: RequirementsAnalyzeOptions
): CanonicalRequirement[] {
  const lines = parseRequirements(rawText, parseOptions ?? {});
  return lines.map((p) => {
    const source_text = p.text;
    const normalized_text = normalizeWhitespace(source_text);
    const { type: rt } = classifyRequirementType(source_text);
    const type = mapToCanonicalType(rt);
    const semantics = parseRequirementSemanticFrame(normalized_text);
    const tags: string[] = [];
    if (!p.hasExplicitId) tags.push("generated_id");
    tags.push(`heuristic_type:${rt}`);

    const req: CanonicalRequirement = {
      id: p.id,
      source_text,
      normalized_text,
      explicit_id: p.hasExplicitId,
      type,
      semantics,
    };
    if (semantics.actor !== undefined) req.actor = semantics.actor;
    if (semantics.action !== undefined) req.action = semantics.action;
    if (semantics.object !== undefined) req.object = semantics.object;
    if (semantics.conditions.length > 0) req.conditions = semantics.conditions;
    if (semantics.parameters.length > 0) {
      req.parameters = semantics.parameters;
      req.thresholds = parametersToThresholdSpecs(semantics.parameters);
    }
    if (tags.length > 0) req.tags = tags;
    return req;
  });
}

/**
 * Normalizes parent specification text for hierarchy analysis. If the generic parser finds no
 * requirement-shaped blocks (e.g. parent doc uses only weak modals), returns one synthetic
 * requirement wrapping the full text so parent–child checks still run.
 */
export function normalizeParentRequirementsForHierarchy(
  rawText: string,
  config: EngineConfig,
  parseOptions?: RequirementsAnalyzeOptions
): CanonicalRequirement[] {
  const reqs = normalizeToCanonicalRequirements(rawText, config, parseOptions);
  if (reqs.length > 0) return reqs;
  const t = normalizeWhitespace(rawText);
  if (!t) return [];
  const semantics = parseRequirementSemanticFrame(t);
  const syn: CanonicalRequirement = {
    id: "PARENT-DOCUMENT-1",
    source_text: t,
    normalized_text: t,
    explicit_id: false,
    type: "General",
    semantics,
    tags: ["synthetic_parent_document_fallback"],
  };
  if (semantics.actor !== undefined) syn.actor = semantics.actor;
  if (semantics.action !== undefined) syn.action = semantics.action;
  if (semantics.object !== undefined) syn.object = semantics.object;
  if (semantics.conditions.length > 0) syn.conditions = semantics.conditions;
  if (semantics.parameters.length > 0) {
    syn.parameters = semantics.parameters;
    syn.thresholds = parametersToThresholdSpecs(semantics.parameters);
  }
  return [syn];
}
