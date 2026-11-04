import { isBlockEnabled, type EngineConfig, type EngineProfile } from "../config";
import { runIntraDocumentContradictions } from "./runIntraDocument";
import type { CanonicalRequirement, StructuredFinding, TraceLinkInput } from "../types";

export async function runContradictionEngine(input: {
  requirements: CanonicalRequirement[];
  parentReqs: CanonicalRequirement[];
  traceLinks?: TraceLinkInput[];
  config: EngineConfig;
  profile: EngineProfile;
}): Promise<{
  findings: StructuredFinding[];
  intraPairsExamined: number;
  hierarchyPairsExamined: number;
  intraOn: boolean;
  hierarchyOn: boolean;
}> {
  const intraOn = isBlockEnabled(input.config, input.profile, "contradiction.intra_document");
  // Intra-spec only: parent–child / hierarchy is not run.
  void input.parentReqs;
  void input.traceLinks;

  const findings: StructuredFinding[] = [];
  let intraPairsExamined = 0;

  if (intraOn) {
    const intra = runIntraDocumentContradictions(input.requirements, input.config, input.profile);
    findings.push(...intra.findings);
    intraPairsExamined = intra.pairsExamined;
  }

  return {
    findings,
    intraPairsExamined,
    hierarchyPairsExamined: 0,
    intraOn,
    hierarchyOn: false,
  };
}
