import type { RequirementType } from "../../models/requirements";
import { parseRequirements } from "../../services/requirementsAnalyzeService";
import { classifyRequirementType } from "../../services/requirementTypeDesignator";
import type { RequirementsAnalyzeOptions } from "../../models/requirements";
import type { CanonicalRequirement, CanonicalRequirementType } from "./types";
import type { EngineConfig } from "./config";
import { applySemanticFrameToCanonical, parseRequirementSemanticFrame } from "./semanticParse";

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

function buildCanonicalRequirement(input: {
  id: string;
  source_text: string;
  normalized_text: string;
  explicit_id: boolean;
  type: CanonicalRequirementType;
  extraTags?: string[];
}): CanonicalRequirement {
  const { type: rt } = classifyRequirementType(input.source_text);
  const type = input.type;
  const tags: string[] = [...(input.extraTags ?? [])];
  if (!input.explicit_id) tags.push("generated_id");
  tags.push(`heuristic_type:${rt}`);

  const req: CanonicalRequirement = {
    id: input.id,
    source_text: input.source_text,
    normalized_text: input.normalized_text,
    explicit_id: input.explicit_id,
    type,
  };
  applySemanticFrameToCanonical(req, parseRequirementSemanticFrame(input.normalized_text));
  if (tags.length > 0) req.tags = tags;
  return req;
}

/**
 * L0 — segmentation + one semantic parse per statement, written onto CanonicalRequirement.
 *
 * text → semanticParse.ts → RequirementSemanticFrame → CanonicalRequirement
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
    return buildCanonicalRequirement({
      id: p.id,
      source_text,
      normalized_text,
      explicit_id: p.hasExplicitId,
      type: mapToCanonicalType(rt),
    });
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
  return [
    buildCanonicalRequirement({
      id: "PARENT-DOCUMENT-1",
      source_text: t,
      normalized_text: t,
      explicit_id: false,
      type: "General",
      extraTags: ["synthetic_parent_document_fallback"],
    }),
  ];
}
