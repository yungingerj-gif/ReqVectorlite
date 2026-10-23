/**
 * Verifiable quality rule — compatibility shim.
 *
 * Historical block id `deterministic.verifiable` lived in this folder. The
 * actual checks now run in `verification/runVerificationAnalysis.ts` so
 * verification is a downstream engine on CanonicalRequirement (quantity,
 * visual cue, or referenced external tolerance — not a method type).
 *
 * This file re-exports that implementation so quality orchestration and
 * older imports (`runVerifiable`, `VERIFIABLE_ID`) keep compiling.
 *
 * `BLOCK_ID` is `verification.analysis`.
 * `LEGACY_BLOCK_ID` is `deterministic.verifiable` (config / scoring alias).
 */
export {
  runVerificationAnalysis as runVerifiable,
  BLOCK_ID,
  LEGACY_BLOCK_ID,
} from "../verification/runVerificationAnalysis";
