import type { CanonicalRequirement, RequirementParameter, ThresholdSpec } from "../types";
import { parseRequirementSemanticFrame } from "../semanticParse";

/** Polarity / modality cues for cross-requirement comparison. */
export type PolarityModality =
  | "required"
  | "allowed"
  | "prohibited"
  | "absolute"
  | "negative"
  | "weak_obligation"
  | "unknown";

export interface ParsedThreshold {
  numericValue: number;
  unit?: string;
  comparator?: string;
  raw: string;
  parameter?: string;
}

/**
 * Pairwise comparison view of the L0 semantic frame (plus polarities used by contradiction rules).
 */
export interface RequirementSemantics {
  requirement_id: string;
  actor?: string;
  action?: string;
  object?: string;
  conditions: string[];
  thresholds: ParsedThreshold[];
  polarities: PolarityModality[];
  /** Short free-text cue for matching (action + object heuristics). */
  function_signature: string;
}

function parameterToParsed(p: RequirementParameter): ParsedThreshold {
  const pt: ParsedThreshold = {
    numericValue: p.value,
    comparator: p.operator,
    raw: `${p.parameter} ${p.operator} ${p.value}${p.unit ? ` ${p.unit}` : ""}`.trim(),
    parameter: p.parameter,
  };
  if (p.unit) pt.unit = p.unit.toLowerCase();
  return pt;
}

function parseThresholdSpec(t: ThresholdSpec, fallbackText: string): ParsedThreshold | null {
  const n = Number.parseFloat(String(t.value).replace(/,/g, ""));
  if (Number.isNaN(n)) return null;
  const pt: ParsedThreshold = {
    numericValue: n,
    raw: `${t.comparator ?? ""} ${t.value} ${t.unit ?? ""}`.trim() || fallbackText.slice(0, 80),
  };
  if (t.unit) pt.unit = t.unit.toLowerCase();
  if (t.comparator) pt.comparator = t.comparator.toLowerCase();
  return pt;
}

function polaritiesFromFrame(
  polarity: "required" | "prohibited" | "allowed" | "unknown",
  text: string
): PolarityModality[] {
  const t = text.toLowerCase();
  const out: PolarityModality[] = [];
  if (polarity === "prohibited" || /\bshall\s+not\b|\bmust\s+not\b|\bprohibited\b/.test(t)) {
    out.push("prohibited", "negative");
  }
  if (polarity === "required" || (!out.includes("prohibited") && /\bshall\b|\bmust\b/.test(t))) {
    out.push("required");
  }
  if (polarity === "allowed" || /\bshould\b|\bmay\b|\bmight\b|\bcould\b/.test(t)) {
    out.push("weak_obligation", "allowed");
  }
  if (/\bonly\b|\bexclusively\b|\balways\b|\bnever\b/.test(t)) {
    out.push("absolute");
  }
  if (out.length === 0) out.push("unknown");
  return [...new Set(out)];
}

function functionSignature(
  req: CanonicalRequirement,
  partial: { actor?: string; action?: string; object?: string; conditions: string[] }
): string {
  const parts = [
    req.type,
    partial.actor ?? "",
    (partial.action ?? "").slice(0, 80),
    (partial.object ?? "").slice(0, 80),
    ...partial.conditions.map((c) => c.slice(0, 40)),
  ];
  return parts.join("|").toLowerCase().replace(/\s+/g, " ");
}

/**
 * Projects the L0 semantic frame for pairwise engines.
 * Does not re-parse the sentence when `req.semantics` is already present.
 */
export function extractRequirementSemantics(req: CanonicalRequirement): RequirementSemantics {
  const frame = req.semantics ?? parseRequirementSemanticFrame(req.normalized_text);
  const fromParams = (req.parameters ?? frame.parameters).map(parameterToParsed);
  let thresholds = fromParams;
  if (thresholds.length === 0 && req.thresholds) {
    thresholds = [];
    for (const th of req.thresholds) {
      const p = parseThresholdSpec(th, req.normalized_text);
      if (p) thresholds.push(p);
    }
  }

  const polarities = polaritiesFromFrame(frame.polarity, req.normalized_text);
  const actor = frame.actor ?? req.actor;
  const action = frame.action ?? req.action;
  const object = frame.object ?? req.object;
  const conditions = frame.conditions.length > 0 ? frame.conditions : (req.conditions ?? []);

  const sem: RequirementSemantics = {
    requirement_id: req.id,
    conditions,
    thresholds,
    polarities,
    function_signature: "",
  };
  if (actor !== undefined) sem.actor = actor;
  if (action !== undefined) sem.action = action;
  if (object !== undefined) sem.object = object;
  const sigPartial: { actor?: string; action?: string; object?: string; conditions: string[] } = {
    conditions: sem.conditions,
  };
  if (sem.actor !== undefined) sigPartial.actor = sem.actor;
  if (sem.action !== undefined) sigPartial.action = sem.action;
  if (sem.object !== undefined) sigPartial.object = sem.object;
  sem.function_signature = functionSignature(req, sigPartial);
  return sem;
}
