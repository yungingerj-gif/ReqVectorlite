import { loadEngineConfig, type EngineConfig } from "./config";
import { normalizeToCanonicalRequirements } from "./normalizeCanonical";
import { assessQualityMatrix, rowAdvances } from "./qualityMatrix";
import type { CanonicalRequirement, GateStage, GatedScore } from "./types";

export interface RewriteAdvanceResult {
  advances: boolean;
  previous: GatedScore[];
  next: GatedScore[];
  previous_stage: GateStage | null;
  next_stage: GateStage | null;
  reason: string;
}

function parseOne(text: string, id: string, config: EngineConfig): CanonicalRequirement | null {
  const [first] = normalizeToCanonicalRequirements(text, config, {});
  if (!first) return null;
  return { ...first, id };
}

function parsePeers(peerTexts: string[], config: EngineConfig): CanonicalRequirement[] {
  const peers: CanonicalRequirement[] = [];
  peerTexts.forEach((text, index) => {
    normalizeToCanonicalRequirements(text, config, {}).forEach((row, inner) => {
      peers.push({ ...row, id: `peer-${index}-${inner}` });
    });
  });
  return peers;
}

function gateOf(req: CanonicalRequirement, peers: CanonicalRequirement[], config: EngineConfig) {
  const assessed = assessQualityMatrix(
    [req, ...peers],
    [],
    config.safety_critical_weight,
    config.dictionaries,
    {
      maxWords: config.thresholds.max_words_for_singular_warn,
      countAndOr: config.singular_conjunction_patterns.count_and_or_as_compound,
    }
  );
  return {
    row: assessed.quality_matrix[0] ?? [],
    stage: assessed.scores.get(req.id)?.stage ?? null,
  };
}

/** Score the current sentence and the candidate against the same peer texts. Keep the candidate only when a later gate opens and every gate that was already 2 stays 2. */
export function assessRewriteAdvance(
  currentText: string,
  candidateText: string,
  peerTexts: string[] = [],
  config: EngineConfig = loadEngineConfig()
): RewriteAdvanceResult {
  const peers = parsePeers(peerTexts, config);
  const current = parseOne(currentText, "current", config);
  if (!current) {
    return {
      advances: false,
      previous: [],
      next: [],
      previous_stage: null,
      next_stage: null,
      reason: "The current text was not recognized as a requirement, so the rewrite was not kept.",
    };
  }
  const previous = gateOf(current, peers, config);
  const candidate = parseOne(candidateText, "candidate", config);
  if (!candidate) {
    return {
      advances: false,
      previous: previous.row,
      next: [],
      previous_stage: previous.stage,
      next_stage: null,
      reason: "The rewrite was not recognized as a requirement, so it was not kept.",
    };
  }
  const next = gateOf(candidate, peers, config);
  const advances = rowAdvances(previous.row, next.row);
  return {
    advances,
    previous: previous.row,
    next: next.row,
    previous_stage: previous.stage,
    next_stage: next.stage,
    reason: advances
      ? "The rewrite opens a later gate and keeps every gate that was already met."
      : `The rewrite stays at ${next.stage ?? "the same stage"} and was not kept. A kept rewrite has to pass a later gate and leave every gate that was already 2 still at 2.`,
  };
}
