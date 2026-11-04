import { isBlockEnabled, type EngineConfig, type EngineProfile } from "../config";
import {
  runComplete,
  runConsistentCorrect,
  runSingular,
  runUnambiguous,
} from "../deterministic";
import type { DeterministicContext } from "../deterministic/ruleContext";
import type { CanonicalRequirement, StructuredFinding } from "../types";

const QUALITY_BLOCKS: Array<{
  blockId: string;
  run: (req: CanonicalRequirement, ctx: DeterministicContext) => StructuredFinding[];
}> = [
  { blockId: "deterministic.unambiguous", run: runUnambiguous },
  { blockId: "deterministic.complete", run: runComplete },
  { blockId: "deterministic.singular", run: runSingular },
  { blockId: "deterministic.consistent_correct", run: runConsistentCorrect },
];

/**
 * Quality rules: INCOSE-style per-requirement checks on CanonicalRequirement.
 * Does not include verification (see verification/runVerificationAnalysis).
 */
export function runQualityRules(
  requirements: CanonicalRequirement[],
  config: EngineConfig,
  profile: EngineProfile
): Map<string, StructuredFinding[]> {
  const ctx: DeterministicContext = { config, allRequirements: requirements };
  const perReq = new Map<string, StructuredFinding[]>();
  for (const r of requirements) {
    const bucket: StructuredFinding[] = [];
    for (const { blockId, run } of QUALITY_BLOCKS) {
      if (!isBlockEnabled(config, profile, blockId)) continue;
      bucket.push(...run(r, ctx));
    }
    perReq.set(r.id, bucket);
  }
  return perReq;
}
