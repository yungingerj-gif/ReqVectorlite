import type { CanonicalRequirement } from "../types";
import type { ContradictionConfig } from "../config";
import type { RequirementSemantics } from "./semantics";
import { hasSharedNumericalThresholdUnit, sameActorForIntraContradictionPair } from "./intraPairGuards";
import { jaccard, overlapCoefficient, tokenSet } from "./textUtils";

export type CandidatePair = {
  a: CanonicalRequirement;
  b: CanonicalRequirement;
  score: number;
  reasons: string[];
};

function sharedTokens(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) {
    if (b.has(x)) n += 1;
  }
  return n;
}

/**
 * Heuristic candidate generation — avoids full O(n²) adjudication while keeping likely pairs.
 * Lexical overlap (Jaccard / overlap coefficient) only contributes after same-actor alignment
 * and a shared quantitative metric (same unit, finite numeric on both sides).
 */
export function generateIntraCandidatePairs(
  reqs: CanonicalRequirement[],
  sems: Map<string, RequirementSemantics>,
  cfg: ContradictionConfig
): CandidatePair[] {
  const floor = cfg.intra_jaccard_floor;
  const budget = cfg.intra_pair_budget;
  const pairs: CandidatePair[] = [];

  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i]!;
      const b = reqs[j]!;

      const sa = sems.get(a.id);
      const sb = sems.get(b.id);
      if (!sa || !sb) continue;
      if (!sameActorForIntraContradictionPair(sa, sb)) continue;
      if (!hasSharedNumericalThresholdUnit(sa, sb)) continue;

      const ta = tokenSet(a.normalized_text);
      const tb = tokenSet(b.normalized_text);
      const jac = jaccard(ta, tb);
      const oc = overlapCoefficient(ta, tb);

      const reasons: string[] = ["same_actor_shared_numeric_metric"];
      let score = 0.2;

      if (jac >= floor) {
        score += jac * 2;
        reasons.push(`jaccard≈${jac.toFixed(2)}`);
      }
      if (oc >= 0.25) {
        score += oc;
        reasons.push(`overlap≈${oc.toFixed(2)}`);
      }

      if (a.type === b.type) {
        score += cfg.same_type_bonus;
        reasons.push("same_type");
      }

      if (sa.actor && sb.actor && sa.actor.toLowerCase() === sb.actor.toLowerCase()) {
        score += 0.08;
        reasons.push("shared_actor");
      }

      const sigA = tokenSet(sa.function_signature);
      const sigB = tokenSet(sb.function_signature);
      const sigJac = jaccard(sigA, sigB);
      if (sigJac >= 0.12) {
        score += sigJac;
        reasons.push("similar_function_signature");
      }

      const objA = sa.object ? tokenSet(sa.object) : new Set<string>();
      const objB = sb.object ? tokenSet(sb.object) : new Set<string>();
      if (objA.size && objB.size && sharedTokens(objA, objB) >= 2) {
        score += cfg.shared_object_weight;
        reasons.push("shared_object_terms");
      }

      const condOverlap = sa.conditions.some((c) =>
        sb.conditions.some((d) => jaccard(tokenSet(c), tokenSet(d)) > 0.35)
      );
      if (condOverlap) {
        score += cfg.shared_condition_bonus;
        reasons.push("shared_condition");
      }

      const unitA = new Set(sa.thresholds.map((t) => t.unit).filter(Boolean) as string[]);
      const unitB = new Set(sb.thresholds.map((t) => t.unit).filter(Boolean) as string[]);
      for (const u of unitA) {
        if (unitB.has(u)) {
          score += 0.12;
          reasons.push(`shared_unit:${u}`);
          break;
        }
      }

      pairs.push({ a, b, score, reasons });
    }
  }

  pairs.sort((x, y) => y.score - x.score);
  return pairs.slice(0, budget);
}
