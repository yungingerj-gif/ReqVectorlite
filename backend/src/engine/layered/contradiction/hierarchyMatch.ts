import type { ContradictionConfig } from "../config";
import type { CanonicalRequirement, TraceLinkInput } from "../types";
import { jaccard, tokenSet } from "./textUtils";

export type HierarchyPair = {
  parent: CanonicalRequirement;
  child: CanonicalRequirement;
  via: "trace" | "similarity";
};

export function buildHierarchyPairs(
  parentReqs: CanonicalRequirement[],
  childReqs: CanonicalRequirement[],
  traceLinks: TraceLinkInput[] | undefined,
  cfg: ContradictionConfig
): HierarchyPair[] {
  const pmap = new Map(parentReqs.map((r) => [r.id, r]));
  const cmap = new Map(childReqs.map((r) => [r.id, r]));

  if (traceLinks && traceLinks.length > 0) {
    const out: HierarchyPair[] = [];
    for (const l of traceLinks) {
      const p = pmap.get(l.parent_requirement_id);
      const c = cmap.get(l.child_requirement_id);
      if (p && c) out.push({ parent: p, child: c, via: "trace" });
    }
    return out.slice(0, cfg.hierarchy_pair_budget * 3);
  }

  const out: HierarchyPair[] = [];
  const floor = cfg.hierarchy_similarity_floor;

  for (const c of childReqs) {
    let best: CanonicalRequirement | null = null;
    let bestScore = 0;
    const tc = tokenSet(c.normalized_text);

    for (const p of parentReqs) {
      const lexical = jaccard(tc, tokenSet(p.normalized_text));
      if (lexical < floor) continue;
      const score = lexical + (p.type === c.type ? 0.12 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) out.push({ parent: best, child: c, via: "similarity" });
  }

  out.sort((a, b) => {
    const ja = jaccard(tokenSet(a.parent.normalized_text), tokenSet(a.child.normalized_text));
    const jb = jaccard(tokenSet(b.parent.normalized_text), tokenSet(b.child.normalized_text));
    return jb - ja;
  });
  return out.slice(0, cfg.hierarchy_pair_budget * 2);
}
