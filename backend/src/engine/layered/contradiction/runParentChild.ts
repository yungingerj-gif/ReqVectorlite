import { isBlockEnabled, type EngineConfig, type EngineProfile } from "../config";
import { createFinding } from "../deterministic/newFinding";
import type { CanonicalRequirement, StructuredFinding } from "../types";
import { BLOCK_HIERARCHY } from "./blockIds";
import type { TraceLinkInput } from "../types";
import { buildHierarchyPairs } from "./hierarchyMatch";
import { runHierarchyDeterministicChecks } from "./hierarchyDeterministic";
import { extractRequirementSemantics } from "./semantics";

export function runParentChildContradictions(
  parentReqs: CanonicalRequirement[],
  childReqs: CanonicalRequirement[],
  traceLinks: TraceLinkInput[] | undefined,
  config: EngineConfig,
  profile: EngineProfile
): { findings: StructuredFinding[]; pairsExamined: number } {
  if (!isBlockEnabled(config, profile, BLOCK_HIERARCHY)) {
    return { findings: [], pairsExamined: 0 };
  }

  const pairs = buildHierarchyPairs(parentReqs, childReqs, traceLinks, config.contradiction);
  const psem = new Map(parentReqs.map((r) => [r.id, extractRequirementSemantics(r)]));
  const csem = new Map(childReqs.map((r) => [r.id, extractRequirementSemantics(r)]));
  const findings: StructuredFinding[] = [];
  const seen = new Set<string>();

  function add(f: StructuredFinding) {
    const k = `${f.requirement_id}::${f.related_requirement_ids?.join(",") ?? ""}::${f.issue_type}`;
    if (seen.has(k)) return;
    seen.add(k);
    findings.push(f);
  }

  for (const { parent, child } of pairs) {
    const sp = psem.get(parent.id);
    const sc = csem.get(child.id);
    if (!sp || !sc) continue;
    for (const f of runHierarchyDeterministicChecks(parent, child, sp, sc)) {
      add(f);
    }
  }

  const childPaired = new Set(pairs.map((p) => p.child.id));
  const parentPaired = new Set(pairs.map((p) => p.parent.id));

  for (const c of childReqs) {
    if (!childPaired.has(c.id)) {
      add(
        createFinding({
          requirement_id: c.id,
          block_id: BLOCK_HIERARCHY,
          attribute: "ConsistentCorrect",
          severity: "medium",
          confidence: 0.55,
          issue_type: "hierarchy.orphan_child_requirement",
          explanation:
            "No parent requirement was linked or matched with sufficient similarity for this child requirement.",
          layer: "L6_Contradiction",
        })
      );
    }
  }

  for (const p of parentReqs) {
    if (!parentPaired.has(p.id)) {
      add(
        createFinding({
          requirement_id: p.id,
          block_id: BLOCK_HIERARCHY,
          attribute: "ConsistentCorrect",
          severity: "low",
          confidence: 0.52,
          issue_type: "hierarchy.missing_child_allocation",
          explanation:
            "Parent requirement has no traced or similarity-matched child requirement in the child document.",
          layer: "L6_Contradiction",
        })
      );
    }
  }

  return { findings, pairsExamined: pairs.length };
}
