/**
 * Layered analysis pipeline:
 *
 *   Raw requirement
 *         ↓
 *   semanticParse.ts
 *         ↓
 *   RequirementSemanticFrame
 *         ↓
 *   normalizeCanonical.ts
 *         ↓
 *   CanonicalRequirement
 *         ↓
 *    ┌────┼────────┬──────────┐
 *    ↓    ↓        ↓          ↓
 * Quality  Cross-set  Contradiction  Verification
 * rules    analysis    engine (intra) analysis
 *
 * Scope: a single specification. Parent–child / hierarchy is not run.
 */
import {
  isBlockEnabled,
  loadEngineConfig,
  lockRulesOnlyEngineConfig,
  resolveProfile,
  type EngineConfig,
} from "./config";
import { normalizeToCanonicalRequirements } from "./normalizeCanonical";
import { runQualityRules } from "./quality/runQualityRules";
import { runVerificationAnalysis, LEGACY_BLOCK_ID as VERIFIABLE_LEGACY_ID } from "./verification/runVerificationAnalysis";
import { runSetLevelCrossRequirement } from "./setLevel/crossConsistency";
import { runContradictionEngine } from "./contradiction/runContradictionEngine";
import { scoreRequirements } from "./scoring";
import type { EngineRunOptions, LayeredAnalysisResult, PerRequirementResult } from "./types";

function verificationEnabled(config: EngineConfig, profile: ReturnType<typeof resolveProfile>): boolean {
  return (
    isBlockEnabled(config, profile, "verification.analysis") ||
    isBlockEnabled(config, profile, VERIFIABLE_LEGACY_ID)
  );
}

export async function runLayeredEngine(
  options: EngineRunOptions,
  config: EngineConfig
): Promise<LayeredAnalysisResult> {
  const locked = lockRulesOnlyEngineConfig(config);
  const profile = resolveProfile(locked, options.profile);

  const requirements = normalizeToCanonicalRequirements(
    options.rawText,
    locked,
    options.parseOptions
  );

  const perReq = runQualityRules(requirements, locked, profile);

  if (verificationEnabled(locked, profile)) {
    for (const r of requirements) {
      const bucket = perReq.get(r.id) ?? [];
      bucket.push(...runVerificationAnalysis(r));
      perReq.set(r.id, bucket);
    }
  }

  let setLevel = isBlockEnabled(locked, profile, "setLevel.cross_requirement")
    ? runSetLevelCrossRequirement(requirements, locked)
    : [];

  const contradiction = await runContradictionEngine({
    requirements,
    parentReqs: [],
    config: locked,
    profile,
  });
  setLevel = [...setLevel, ...contradiction.findings];

  const scoreMap = scoreRequirements(requirements, perReq, setLevel, locked, profile);

  const requirementsOut = requirements.map((r) => {
    const row: PerRequirementResult = {
      requirement: r,
      findings: perReq.get(r.id) ?? [],
      scores: scoreMap.get(r.id)!,
    };
    return row;
  });

  return {
    meta: {
      profile: profile.id,
      mode: "active",
      analyzed_at: new Date().toISOString(),
      requirement_count: requirements.length,
      source_document: options.source_document,
      organization_id: locked.organization_id,
      contradiction: {
        intra_enabled: contradiction.intraOn,
        hierarchy_enabled: false,
        intra_pairs_examined: contradiction.intraPairsExamined,
        hierarchy_pairs_examined: 0,
      },
    },
    requirements: requirementsOut,
    set_level_findings: setLevel,
  };
}

export { loadEngineConfig };
