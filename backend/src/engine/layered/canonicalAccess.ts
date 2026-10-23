import type { CanonicalRequirement, RequirementSemanticFrame } from "./types";

/**
 * Downstream engines (quality, cross-set, contradiction, verification) must read
 * CanonicalRequirement through this accessor instead of re-parsing source text.
 */
export function semanticFrameOf(req: CanonicalRequirement): RequirementSemanticFrame {
  if (req.semantics) return req.semantics;
  const frame: RequirementSemanticFrame = {
    polarity: req.polarity ?? "unknown",
    conditions: req.conditions ?? [],
    modes: req.modes ?? [],
    states: req.states ?? [],
    parameters: req.parameters ?? [],
    verification_signals: req.verification_signals ?? [],
  };
  if (req.actor) frame.actor = req.actor;
  if (req.obligation) frame.obligation = req.obligation;
  if (req.action) frame.action = req.action;
  if (req.object) frame.object = req.object;
  return frame;
}
