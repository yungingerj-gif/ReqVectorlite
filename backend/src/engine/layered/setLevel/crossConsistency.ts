import { createFinding } from "../deterministic/newFinding";
import type { CanonicalRequirement, StructuredFinding } from "../types";
import type { EngineConfig } from "../config";
import {
  buildSemanticsMap,
  obligationSemanticAlignment,
  semanticsStrongEnoughToGate,
} from "./semanticAlignment";

export const BLOCK_ID = "setLevel.cross_requirement";

const L5 = "L5_SetLevel";

/** Strip normative / structural boilerplate so unrelated reqs are not paired on "the system shall" alone. */
const CROSS_REQ_STOPWORDS = new Set(
  [
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "if",
    "then",
    "for",
    "nor",
    "on",
    "at",
    "to",
    "from",
    "by",
    "with",
    "without",
    "in",
    "into",
    "of",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "shall",
    "should",
    "may",
    "might",
    "must",
    "can",
    "could",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "they",
    "them",
    "their",
    "there",
    "all",
    "any",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "not",
    "only",
    "own",
    "same",
    "than",
    "too",
    "very",
    "just",
    "when",
    "where",
    "which",
    "while",
    "who",
    "whom",
    "how",
    "what",
    "whether",
    "also",
    "here",
    "upon",
    "via",
    "per",
    "among",
    "within",
    "throughout",
    "either",
    "neither",
    "system",
    // Very common capability verbs — alone they drive false “overlap” across unrelated FRs.
    "provide",
    "display",
    "support",
    "include",
    "ensure",
    "maintain",
    "manage",
    "handle",
    "process",
    "perform",
    "implement",
    "define",
    "contain",
    "allow",
    "enable",
  ].map((w) => w.toLowerCase())
);

function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s]/g, "")
    .trim();
}

function tokenSet(text: string): Set<string> {
  const words = normalizeForDedup(text)
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

/** Tokens used for similarity / overlap (excludes stopwords and bare numbers). */
function contentTokenSet(text: string): Set<string> {
  const out = new Set<string>();
  for (const w of tokenSet(text)) {
    if (CROSS_REQ_STOPWORDS.has(w)) continue;
    if (/^\d+(\.\d+)?$/.test(w)) continue;
    out.add(w);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) {
    if (b.has(x)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sharedContentCount(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) {
    if (b.has(x)) n += 1;
  }
  return n;
}

function thresholdNum(config: EngineConfig, key: string, fallback: number): number {
  const v = config.thresholds[key];
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function pairKey(idA: string, idB: string): string {
  return idA <= idB ? `${idA}\0${idB}` : `${idB}\0${idA}`;
}

/** One soft cross-issue per unordered pair (avoids overlap + terminology on the same two reqs). */
const SOFT_PAIR_ISSUE_PRIORITY: Record<string, number> = {
  same_intent_llm: 4,
  near_duplicate: 3,
  terminology_drift: 2,
  possible_overlap: 1,
};

function groupIdsByNormalizedText(reqs: CanonicalRequirement[]): Map<string, string[]> {
  const byNorm = new Map<string, string[]>();
  for (const r of reqs) {
    const k = normalizeForDedup(r.normalized_text);
    if (k.length < 20) continue;
    const arr = byNorm.get(k) ?? [];
    arr.push(r.id);
    byNorm.set(k, arr);
  }
  return byNorm;
}

function exactDupPairKeysFromByNorm(byNorm: Map<string, string[]>): Set<string> {
  const keys = new Set<string>();
  for (const ids of byNorm.values()) {
    if (ids.length < 2) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        keys.add(pairKey(ids[i]!, ids[j]!));
      }
    }
  }
  return keys;
}

export function dedupeSoftCrossPairs(findings: StructuredFinding[]): StructuredFinding[] {
  const soft = SOFT_PAIR_ISSUE_PRIORITY;
  const bestByPair = new Map<string, StructuredFinding>();
  const out: StructuredFinding[] = [];

  for (const f of findings) {
    const rel = f.related_requirement_ids;
    if (
      f.attribute !== "CrossRequirement" ||
      !rel ||
      rel.length !== 1 ||
      soft[f.issue_type] === undefined
    ) {
      out.push(f);
      continue;
    }
    const pk = pairKey(f.requirement_id, rel[0]!);
    const prev = bestByPair.get(pk);
    if (!prev) {
      bestByPair.set(pk, f);
      continue;
    }
    if (soft[f.issue_type]! > soft[prev.issue_type]!) {
      bestByPair.set(pk, f);
    }
  }

  return [...out, ...bestByPair.values()];
}

type NumericClaim = {
  requirementId: string;
  key: string;
  value: number;
  unit: string;
};

function extractNumericClaims(reqs: CanonicalRequirement[]): NumericClaim[] {
  const claims: NumericClaim[] = [];
  for (const r of reqs) {
    const params = r.parameters ?? r.semantics?.parameters ?? [];
    for (const p of params) {
      if (!p.unit) continue;
      claims.push({
        requirementId: r.id,
        key: `${p.parameter} ${p.unit}`.toLowerCase(),
        value: p.value,
        unit: p.unit.toLowerCase(),
      });
    }
  }
  return claims;
}

function terminologyDriftFindings(
  reqs: CanonicalRequirement[],
  groups: string[][],
  driftJacFloor: number,
  driftMinShared: number,
  skipPairKeys: Set<string>
): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  for (const group of groups) {
    const lowerGroup = group.map((g) => g.toLowerCase());
    for (let i = 0; i < reqs.length; i++) {
      for (let j = i + 1; j < reqs.length; j++) {
        const a = reqs[i]!;
        const b = reqs[j]!;
        if (skipPairKeys.has(pairKey(a.id, b.id))) continue;
        const ca = contentTokenSet(a.normalized_text);
        const cb = contentTokenSet(b.normalized_text);
        if (ca.size < 3 || cb.size < 3) continue;
        if (sharedContentCount(ca, cb) < driftMinShared) continue;
        if (jaccard(ca, cb) < driftJacFloor) continue;
        const hitA = lowerGroup.filter((g) => new RegExp(`\\b${g}\\b`, "i").test(a.normalized_text));
        const hitB = lowerGroup.filter((g) => new RegExp(`\\b${g}\\b`, "i").test(b.normalized_text));
        if (hitA.length === 0 || hitB.length === 0) continue;
        const sa = new Set(hitA);
        const sb = new Set(hitB);
        const disjoint = [...sa].every((x) => !sb.has(x)) && [...sb].every((x) => !sa.has(x));
        if (!disjoint) continue;
        findings.push(
          createFinding({
            requirement_id: a.id,
            block_id: BLOCK_ID,
            attribute: "CrossRequirement",
            severity: "low",
            confidence: 0.55,
            issue_type: "terminology_drift",
            explanation: `Similar scope but different preferred terms (${hitA.join(",")} vs ${hitB.join(",")}) in synonym family [${group.join(" | ")}].`,
            related_requirement_ids: [b.id],
            layer: L5,
          })
        );
      }
    }
  }
  return findings;
}

export function runSetLevelCrossRequirement(
  reqs: CanonicalRequirement[],
  config: EngineConfig
): StructuredFinding[] {
  const findings: StructuredFinding[] = [];
  const jaccardMin = thresholdNum(config, "near_duplicate_jaccard", 0.82);
  const longWords = thresholdNum(config, "long_requirement_word_count", 45);
  const overlapFloor = thresholdNum(config, "overlap_jaccard_floor", 0.58);
  const overlapMinShared = Math.max(1, Math.round(thresholdNum(config, "overlap_min_shared_content_tokens", 4)));
  const overlapMaxPairs = Math.max(0, Math.round(thresholdNum(config, "overlap_max_pairs", 15)));
  const driftJacFloor = thresholdNum(config, "terminology_drift_content_jaccard_floor", 0.42);
  const driftMinShared = Math.max(1, Math.round(thresholdNum(config, "terminology_drift_min_shared_content_tokens", 4)));
  const nearDupMinContent = Math.max(1, Math.round(thresholdNum(config, "near_duplicate_min_content_tokens_per_side", 4)));
  const overlapMinShorterCoverage = thresholdNum(config, "overlap_min_shorter_coverage", 0.52);
  /** When > 0, near_duplicate / possible_overlap skip pairs with structured semantics but low obligation alignment. Set to 0 to disable gating (explanation still notes alignment when available). */
  const crossSemanticFloor = thresholdNum(config, "cross_semantic_alignment_floor", 0.1);

  const semMap = buildSemanticsMap(reqs);

  const byNorm = groupIdsByNormalizedText(reqs);
  const exactDupPairKeys = exactDupPairKeysFromByNorm(byNorm);

  for (const [norm, ids] of byNorm.entries()) {
    if (ids.length < 2) continue;
    findings.push(
      createFinding({
        requirement_id: ids[0]!,
        block_id: BLOCK_ID,
        attribute: "CrossRequirement",
        severity: "medium",
        confidence: 0.92,
        issue_type: "duplicate_requirement",
        explanation: "Requirements share substantively identical normalized text.",
        evidence_span: norm.slice(0, 160),
        related_requirement_ids: ids.slice(1),
        layer: L5,
      })
    );
  }

  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i]!;
      const b = reqs[j]!;
      if (exactDupPairKeys.has(pairKey(a.id, b.id))) continue;
      if (a.normalized_text.length <= 40 || b.normalized_text.length <= 40) continue;
      const ca = contentTokenSet(a.normalized_text);
      const cb = contentTokenSet(b.normalized_text);
      if (ca.size < nearDupMinContent || cb.size < nearDupMinContent) continue;
      const jac = jaccard(ca, cb);
      if (jac >= jaccardMin && jac < 1) {
        const sa = semMap.get(a.id)!;
        const sb = semMap.get(b.id)!;
        const semAlign = obligationSemanticAlignment(sa, sb);
        if (
          crossSemanticFloor > 0 &&
          semanticsStrongEnoughToGate(sa, sb) &&
          semAlign < crossSemanticFloor
        ) {
          continue;
        }
        const semNote =
          semanticsStrongEnoughToGate(sa, sb) || semAlign > 0
            ? ` Obligation / scope alignment≈${semAlign.toFixed(2)} (from parsed actor–action–object cues, not just word overlap).`
            : "";
        findings.push(
          createFinding({
            requirement_id: a.id,
            block_id: BLOCK_ID,
            attribute: "CrossRequirement",
            severity: "low",
            confidence: 0.7,
            issue_type: "near_duplicate",
            explanation: `High similarity on substantive terms (Jaccard≈${jac.toFixed(2)} after boilerplate removal); verify redundancy or merge.${semNote}`,
            related_requirement_ids: [b.id],
            layer: L5,
          })
        );
      }
    }
  }

  const claims = extractNumericClaims(reqs);
  const byKeyUnit = new Map<string, NumericClaim[]>();
  for (const c of claims) {
    const k = `${c.key}__${c.unit}`;
    const arr = byKeyUnit.get(k) ?? [];
    arr.push(c);
    byKeyUnit.set(k, arr);
  }
  for (const [, arr] of byKeyUnit.entries()) {
    if (arr.length < 2) continue;
    const values = new Set(arr.map((x) => x.value));
    if (values.size <= 1) continue;
    const ids = Array.from(new Set(arr.map((x) => x.requirementId)));
    if (ids.length < 2) continue;
    findings.push(
      createFinding({
        requirement_id: ids[0]!,
        block_id: BLOCK_ID,
        attribute: "CrossRequirement",
        severity: "high",
        confidence: 0.74,
        issue_type: "possible_threshold_conflict",
        explanation:
          "Two or more requirements appear to define different numeric limits for a similar quantity.",
        evidence_span: `${arr[0]!.key} (${arr[0]!.unit})`,
        related_requirement_ids: ids.slice(1),
        layer: L5,
      })
    );
  }

  findings.push(
    ...terminologyDriftFindings(
      reqs,
      config.dictionaries.terminology_synonym_groups,
      driftJacFloor,
      driftMinShared,
      exactDupPairKeys
    )
  );

  for (const r of reqs) {
    const t = r.normalized_text;
    if (/\bshall\s+never\b/i.test(t) && /\bshall\s+(allow|permit|enable)\b/i.test(t)) {
      findings.push(
        createFinding({
          requirement_id: r.id,
          block_id: BLOCK_ID,
          attribute: "CrossRequirement",
          severity: "medium",
          confidence: 0.5,
          issue_type: "conflicting_absolute_statements",
          explanation:
            "Single requirement mixes strong prohibition with enabling language; validate for contradiction.",
          layer: L5,
        })
      );
    }
  }

  for (const r of reqs) {
    const wc = r.normalized_text.split(/\s+/).length;
    const shalls = (r.normalized_text.match(/\bshall\b/gi) ?? []).length;
    if (wc > longWords && shalls >= 2) {
      findings.push(
        createFinding({
          requirement_id: r.id,
          block_id: BLOCK_ID,
          attribute: "CrossRequirement",
          severity: "low",
          confidence: 0.62,
          issue_type: "possible_missing_decomposition",
          explanation:
            "Long requirement with multiple obligations may be missing parent/child decomposition in the spec structure.",
          layer: L5,
        })
      );
    }
  }

  const overlapPairs: { pair: [CanonicalRequirement, CanonicalRequirement]; jac: number }[] = [];
  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i]!;
      const b = reqs[j]!;
      if (exactDupPairKeys.has(pairKey(a.id, b.id))) continue;
      const ca = contentTokenSet(a.normalized_text);
      const cb = contentTokenSet(b.normalized_text);
      if (ca.size < 3 || cb.size < 3) continue;
      const shared = sharedContentCount(ca, cb);
      if (shared < overlapMinShared) continue;
      const shorter = Math.min(ca.size, cb.size);
      if (shorter > 0 && shared / shorter < overlapMinShorterCoverage) continue;
      const jac = jaccard(ca, cb);
      if (jac > overlapFloor && jac < jaccardMin) {
        overlapPairs.push({ pair: [a, b], jac });
      }
    }
  }
  overlapPairs.sort((x, y) => y.jac - x.jac);
  const overlapTake = overlapMaxPairs <= 0 ? [] : overlapPairs.slice(0, overlapMaxPairs);
  for (const { pair: [a, b], jac } of overlapTake) {
    const sa = semMap.get(a.id)!;
    const sb = semMap.get(b.id)!;
    const semAlign = obligationSemanticAlignment(sa, sb);
    if (
      crossSemanticFloor > 0 &&
      semanticsStrongEnoughToGate(sa, sb) &&
      semAlign < crossSemanticFloor
    ) {
      continue;
    }
    const semNote =
      semanticsStrongEnoughToGate(sa, sb) || semAlign > 0
        ? ` Obligation / scope alignment≈${semAlign.toFixed(2)} (parsed structure, not only shared words).`
        : "";
    findings.push(
      createFinding({
        requirement_id: a.id,
        block_id: BLOCK_ID,
        attribute: "CrossRequirement",
        severity: "low",
        confidence: 0.58,
        issue_type: "possible_overlap",
        explanation: `Moderate overlap in substantive terms (Jaccard≈${jac.toFixed(2)} after boilerplate removal); check for partial duplication or unclear allocation.${semNote}`,
        related_requirement_ids: [b.id],
        layer: L5,
      })
    );
  }

  return dedupeSoftCrossPairs(findings);
}

export type SameIntentCandidatePair = {
  a: CanonicalRequirement;
  b: CanonicalRequirement;
  content_jaccard: number;
};

/**
 * Pairs that share enough substantive vocabulary to warrant LLM same-intent review.
 * Sorted by content Jaccard descending (caller's max_pairs slice limits API cost).
 */
export function collectSameIntentAiCandidatePairs(
  reqs: CanonicalRequirement[],
  config: EngineConfig
): SameIntentCandidatePair[] {
  const byNorm = groupIdsByNormalizedText(reqs);
  const exactDupPairKeys = exactDupPairKeysFromByNorm(byNorm);
  const floor = thresholdNum(config, "same_intent_ai_lexical_floor", 0.28);
  const maxCollect = Math.max(1, Math.round(thresholdNum(config, "same_intent_ai_max_candidates", 64)));
  const out: SameIntentCandidatePair[] = [];
  for (let i = 0; i < reqs.length; i++) {
    for (let j = i + 1; j < reqs.length; j++) {
      const a = reqs[i]!;
      const b = reqs[j]!;
      if (exactDupPairKeys.has(pairKey(a.id, b.id))) continue;
      if (a.normalized_text.length < 25 || b.normalized_text.length < 25) continue;
      const ca = contentTokenSet(a.normalized_text);
      const cb = contentTokenSet(b.normalized_text);
      if (ca.size < 3 || cb.size < 3) continue;
      const jac = jaccard(ca, cb);
      if (jac < floor) continue;
      out.push({ a, b, content_jaccard: jac });
    }
  }
  out.sort((x, y) => y.content_jaccard - x.content_jaccard);
  return out.slice(0, maxCollect);
}
