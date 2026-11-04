/**
 * Shared input for every per-requirement quality rule in this folder.
 *
 * `config` — dictionaries, thresholds, and conjunction flags for the run.
 * `allRequirements` — the full intra-spec set (available for rules that
 *    need neighbors; current rules inspect only the current row).
 */
import type { CanonicalRequirement } from "../types";
import type { EngineConfig } from "../config";

export interface DeterministicContext {
  config: EngineConfig;
  allRequirements: CanonicalRequirement[];
}
