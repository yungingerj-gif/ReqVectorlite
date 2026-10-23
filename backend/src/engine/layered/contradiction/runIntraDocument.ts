import { isBlockEnabled, type EngineConfig, type EngineProfile } from "../config";
import type { CanonicalRequirement, StructuredFinding } from "../types";
import { BLOCK_INTRA } from "./blockIds";
import { runIntraDeterministicContradictionChecks } from "./intraDeterministic";
import { generateIntraCandidatePairs } from "./pairCandidates";
import { extractRequirementSemantics } from "./semantics";

function pairDedupeKey(a: string, b: string, issue: string): string {
  return `${[a, b].sort().join("::")}::${issue}`;
}

export function runIntraDocumentContradictions(
  requirements: CanonicalRequirement[],
  config: EngineConfig,
  profile: EngineProfile
): { findings: StructuredFinding[]; pairsExamined: number } {
  if (!isBlockEnabled(config, profile, BLOCK_INTRA)) {
    return { findings: [], pairsExamined: 0 };
  }

  const sems = new Map(requirements.map((r) => [r.id, extractRequirementSemantics(r)]));
  const candidates = generateIntraCandidatePairs(requirements, sems, config.contradiction);
  const findings: StructuredFinding[] = [];
  const seen = new Set<string>();

  for (const c of candidates) {
    const sa = sems.get(c.a.id);
    const sb = sems.get(c.b.id);
    if (!sa || !sb) continue;
    const det = runIntraDeterministicContradictionChecks(c.a, c.b, sa, sb);
    for (const f of det) {
      const k = pairDedupeKey(
        f.requirement_id,
        f.related_requirement_ids?.[0] ?? "",
        f.issue_type
      );
      if (seen.has(k)) continue;
      seen.add(k);
      findings.push(f);
    }
  }

  return { findings, pairsExamined: candidates.length };
}
