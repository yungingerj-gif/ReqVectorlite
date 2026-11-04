/**
 * Quality-rule barrel for the layered engine.
 *
 * These modules are the INCOSE-style per-requirement checks run after
 * normalizeCanonical (see `quality/runQualityRules.ts`):
 * - Unambiguous — dictionaries for vague / banned / weak-modal wording
 * - Complete — actor, obligation, type-specific fields
 * - Singular — one atomic statement
 * - ConsistentCorrect — intra-statement coherence
 *
 * Verifiable is re-exported here for API compatibility but is executed as
 * the separate verification analysis pass, not inside runQualityRules.
 */
export { runUnambiguous, BLOCK_ID as UNAMBIGUOUS_ID } from "./unambiguous";
export { runComplete, BLOCK_ID as COMPLETE_ID } from "./complete";
export {
  runVerifiable,
  BLOCK_ID as VERIFICATION_ANALYSIS_ID,
  LEGACY_BLOCK_ID as VERIFIABLE_ID,
} from "./verifiable";
export { runSingular, BLOCK_ID as SINGULAR_ID, countStandaloneConjunctions } from "./singular";
export { runConsistentCorrect, BLOCK_ID as CONSISTENT_ID } from "./consistentCorrect";
export type { DeterministicContext } from "./ruleContext";
