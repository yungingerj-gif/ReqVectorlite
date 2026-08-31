import { NullAiClient, type AiClient } from "./ai/aiClient";
import {
  isBlockEnabled,
  loadEngineConfig,
  lockRulesOnlyEngineConfig,
  resolveProfile,
  type EngineConfig,
} from "./config";
import {
  runComplete,
  runConsistentCorrect,
  runSingular,
  runUnambiguous,
  runVerifiable,
} from "./deterministic";
import type { DeterministicContext } from "./deterministic/ruleContext";
import {
  normalizeParentRequirementsForHierarchy,
  normalizeToCanonicalRequirements,
} from "./normalizeCanonical";
import { scoreRequirements } from "./scoring";
import { runIntraDocumentContradictions } from "./contradiction/runIntraDocument";
import { runParentChildContradictions } from "./contradiction/runParentChild";
import { runSetLevelCrossRequirement } from "./setLevel/crossConsistency";
import type {
  CanonicalRequirement,
  EngineRunOptions,
  LayeredAnalysisResult,
  PerRequirementResult,
  StructuredFinding,
} from "./types";

const DETERMINISTIC: Array<{
  blockId: string;
  run: (req: CanonicalRequirement, ctx: DeterministicContext) => StructuredFinding[];
}> = [
  { blockId: "deterministic.unambiguous", run: runUnambiguous },
  { blockId: "deterministic.complete", run: runComplete },
  { blockId: "deterministic.verifiable", run: runVerifiable },
  { blockId: "deterministic.singular", run: runSingular },
  { blockId: "deterministic.consistent_correct", run: runConsistentCorrect },
];

export async function runLayeredEngine(
  options: EngineRunOptions,
  config: EngineConfig,
  aiClient?: AiClient
): Promise<LayeredAnalysisResult> {
  const locked = lockRulesOnlyEngineConfig(config);
  const profile = resolveProfile(locked, options.profile);
  void aiClient;
  const client = new NullAiClient();

  const requirements = normalizeToCanonicalRequirements(
    options.rawText,
    locked,
    options.parseOptions
  );

  const ctx: DeterministicContext = { config: locked, allRequirements: requirements };
  const perReq = new Map<string, StructuredFinding[]>();
  for (const r of requirements) {
    perReq.set(r.id, []);
  }

  for (const r of requirements) {
    const bucket = perReq.get(r.id)!;
    for (const { blockId, run } of DETERMINISTIC) {
      if (!isBlockEnabled(locked, profile, blockId)) continue;
      bucket.push(...run(r, ctx));
    }
  }

  let setLevel: StructuredFinding[] = [];
  if (isBlockEnabled(locked, profile, "setLevel.cross_requirement")) {
    setLevel = runSetLevelCrossRequirement(requirements, locked);
  }

  const intraOn = isBlockEnabled(locked, profile, "contradiction.intra_document");
  const parentText = options.parent_raw_text?.trim() ?? "";
  const parentReqs =
    parentText.length > 0
      ? normalizeParentRequirementsForHierarchy(parentText, locked, options.parseOptions)
      : [];
  const parentSourceLabel =
    options.parent_source_document?.trim() ||
    (parentReqs.length > 0 ? "Parent specification" : undefined);
  const hierarchyOn =
    parentReqs.length > 0 && isBlockEnabled(locked, profile, "contradiction.parent_child");

  let intraPairsExamined = 0;
  let hierarchyPairsExamined = 0;
  const contradictionFindings: StructuredFinding[] = [];

  if (intraOn) {
    const intra = await runIntraDocumentContradictions(requirements, locked, profile, client, null);
    contradictionFindings.push(...intra.findings);
    intraPairsExamined = intra.pairsExamined;
  }

  if (hierarchyOn) {
    const hier = await runParentChildContradictions(
      parentReqs,
      requirements,
      options.trace_links,
      locked,
      profile,
      client,
      null
    );
    contradictionFindings.push(...hier.findings);
    hierarchyPairsExamined = hier.pairsExamined;
  }

  setLevel = [...setLevel, ...contradictionFindings];

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
      ...(parentSourceLabel ? { parent_source_document: parentSourceLabel } : {}),
      ai_enabled: false,
      organization_id: locked.organization_id,
      contradiction: {
        intra_enabled: intraOn,
        hierarchy_enabled: hierarchyOn,
        intra_pairs_examined: intraPairsExamined,
        hierarchy_pairs_examined: hierarchyPairsExamined,
        ...(parentReqs.length > 0 ? { parent_requirement_count: parentReqs.length } : {}),
      },
    },
    requirements: requirementsOut,
    set_level_findings: setLevel,
    ...(parentReqs.length > 0 ? { parent_requirements: parentReqs } : {}),
  };
}

export { loadEngineConfig };
