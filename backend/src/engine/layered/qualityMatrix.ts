import { semanticFrameOf } from "./canonicalAccess";
import { countStandaloneConjunctions } from "./deterministic/singular";
import type { EngineConfig } from "./config";
import type {
  CanonicalRequirement,
  ComparisonOperator,
  DocumentMaturity,
  GateStage,
  GatedScore,
  QualityScore,
  QualityVector,
  StructuredFinding,
} from "./types";

const GATE_COUNT = 4;

const SAFETY_CRITICAL =
  /\b(safety[\s-]*critical|ASIL[\s-]*[A-D]|SIL[\s-]*[1-4])\b/i;

const UNBOUNDED = /\b(infinite|unlimited|zero\s+defect|100%\s+of\s+all)\b/i;
const ABSOLUTE = /\b(always|never|all\s+times|under\s+all\s+conditions)\b/i;
const PASSIVE =
  /\b(?:shall|must|is|are|be)\s+(?:\w+\s+){0,2}(?:\w+ed|built|shown|made)\b/i;

const DIRECT_CONFLICT = new Set([
  "intra.numeric_conflict",
  "intra.behavioral_conflict",
  "intra.condition_conflict",
  "possible_threshold_conflict",
  "conflicting_absolute_statements",
  "duplicate_requirement",
]);

const SOFT_CONFLICT = new Set([
  "near_duplicate",
  "terminology_drift",
  "possible_overlap",
  "possible_missing_decomposition",
]);

type Bound = {
  lower: number;
  upper: number;
  hasLower: boolean;
  hasUpper: boolean;
};

function containsPhrase(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i").test(haystack);
}

function containsWholeWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(haystack);
}

function hasVagueWording(text: string, dictionaries: EngineConfig["dictionaries"]): boolean {
  const lower = text.toLowerCase();
  for (const term of dictionaries.vague_terms) {
    if (!term) continue;
    if (term.includes(" ") ? containsPhrase(text, term) : containsWholeWord(lower, term)) return true;
  }
  for (const term of dictionaries.banned_terms) {
    if (term && containsPhrase(text, term)) return true;
  }
  return false;
}

function hasWeakModal(text: string, weak: string[]): boolean {
  const lower = text.toLowerCase();
  return weak.some((w) => w && containsWholeWord(lower, w));
}

export function isSafetyCritical(req: CanonicalRequirement): boolean {
  return SAFETY_CRITICAL.test(req.normalized_text) || SAFETY_CRITICAL.test(req.source_text);
}

function obligationCount(text: string): number {
  return (text.match(/\bshall\b/gi) ?? []).length + (text.match(/\bmust\b/gi) ?? []).length;
}

function hasBindingObligation(req: CanonicalRequirement): boolean {
  const frame = semanticFrameOf(req);
  if (frame.obligation === "shall" || frame.obligation === "must") return true;
  if (frame.polarity === "required") return true;
  return obligationCount(req.normalized_text) > 0;
}

function sentenceCount(text: string): number {
  const parts = text
    .split(/[.!?]+\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return Math.max(1, parts.length);
}

function quantityKey(parameter: string, unit: string): string {
  return `${parameter.trim().toLowerCase()}|${unit.trim().toLowerCase()}`;
}

function emptyBound(): Bound {
  return { lower: Number.NEGATIVE_INFINITY, upper: Number.POSITIVE_INFINITY, hasLower: false, hasUpper: false };
}

function applyOperator(bound: Bound, operator: ComparisonOperator, value: number): void {
  if (operator === "<" || operator === "<=") {
    bound.upper = Math.min(bound.upper, value);
    bound.hasUpper = true;
  } else if (operator === ">" || operator === ">=") {
    bound.lower = Math.max(bound.lower, value);
    bound.hasLower = true;
  } else if (operator === "=") {
    bound.lower = Math.max(bound.lower, value);
    bound.upper = Math.min(bound.upper, value);
    bound.hasLower = true;
    bound.hasUpper = true;
  }
}

function boundsByQuantity(requirements: CanonicalRequirement[]): Map<string, Bound> {
  const map = new Map<string, Bound>();
  for (const req of requirements) {
    for (const p of semanticFrameOf(req).parameters) {
      if (!p.unit || !Number.isFinite(p.value)) continue;
      const key = quantityKey(p.parameter, p.unit);
      const bound = map.get(key) ?? emptyBound();
      applyOperator(bound, p.operator, p.value);
      map.set(key, bound);
    }
  }
  return map;
}

function outsideForeignLimit(req: CanonicalRequirement, requirements: CanonicalRequirement[]): boolean {
  const others = boundsByQuantity(requirements.filter((r) => r.id !== req.id));
  for (const p of semanticFrameOf(req).parameters) {
    if (!p.unit || !Number.isFinite(p.value)) continue;
    const foreign = others.get(quantityKey(p.parameter, p.unit));
    if (!foreign) continue;
    if (foreign.hasUpper && p.value > foreign.upper) return true;
    if (foreign.hasLower && p.value < foreign.lower) return true;
  }
  return false;
}

function scoreUnambiguous(req: CanonicalRequirement, dictionaries: EngineConfig["dictionaries"]): QualityScore {
  const text = req.normalized_text;
  const binding = hasBindingObligation(req);
  const vague = hasVagueWording(text, dictionaries);
  const weak = hasWeakModal(text, dictionaries.weak_modals);
  const passive = PASSIVE.test(text);
  const actor = Boolean(semanticFrameOf(req).actor);
  if (!binding) return 0;
  if (vague || weak || passive || !actor) return 1;
  return 2;
}

function scoreSingular(
  req: CanonicalRequirement,
  options: { maxWords: number; countAndOr: boolean }
): QualityScore {
  const text = req.normalized_text;
  const obligations = obligationCount(text);
  if (obligations >= 2 || /\band\/or\b/i.test(text)) return 0;
  const conjunctions = options.countAndOr ? countStandaloneConjunctions(text) : 0;
  const words = text.split(/\s+/).filter(Boolean).length;
  if ((conjunctions >= 2 && obligations >= 1) || words > options.maxWords || sentenceCount(text) > 1) return 1;
  return 2;
}

function percentExceeds100(text: string): boolean {
  for (const match of text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)) {
    if (Number(match[1]) > 100) return true;
  }
  return false;
}

function hasShallAndShallNot(text: string): boolean {
  if (!/\bshall\s+not\b/i.test(text) || !/\bshall\b/i.test(text)) return false;
  const notIdx = text.search(/\bshall\s+not\b/i);
  const shallIdx = text.search(/\bshall\b/i);
  return notIdx >= 0 && shallIdx >= 0 && Math.abs(notIdx - shallIdx) < 400;
}

function scoreSetConsistency(requirements: CanonicalRequirement[], findings: StructuredFinding[]): QualityScore {
  const direct = findings.some((finding) => DIRECT_CONFLICT.has(finding.issue_type));
  const localHard = requirements.some(
    (req) => percentExceeds100(req.normalized_text) || hasShallAndShallNot(req.normalized_text)
  );
  if (direct || localHard) return 0;
  if (findings.some((finding) => SOFT_CONFLICT.has(finding.issue_type))) return 1;
  return 2;
}

function scoreFeasible(
  req: CanonicalRequirement,
  requirements: CanonicalRequirement[],
  dictionaries: EngineConfig["dictionaries"]
): QualityScore {
  const text = `${req.normalized_text} ${req.source_text}`;
  if (UNBOUNDED.test(text) || ABSOLUTE.test(text) || outsideForeignLimit(req, requirements)) return 0;
  if (hasVagueWording(text, dictionaries)) return 1;
  return 2;
}

const OBSERVATION_VERB =
  /\b(display(?:s|ed|ing)?|show(?:s|n|ing)?|indicat(?:e|es|ed|ing)|illuminat(?:e|es|ed|ing)|extinguish(?:es|ed|ing)?|flash(?:es|ed|ing)?|annunciat(?:e|es|ed|ing)|present(?:s|ed|ing)?|sound(?:s|ed|ing)?|emit(?:s|ted|ting)?|blink(?:s|ed|ing)?|read(?:s|ing)?|compute(?:s|d)?|calculate(?:s|d)?|determine(?:s|d)?|measure(?:s|d)?|derive(?:s|d)?|estimate(?:s|d)?|detect(?:s|ed|ing)?|compare(?:s|d)?|monitor(?:s|ed|ing)?|track(?:s|ed|ing)?)\b\s*([^.!;?]{0,120})/i;

const OBSERVABLE_STATE =
  /\b(?:turns?|becomes?|remains?|(?:shall|must)\s+be|is)\s+([^.!;?]{1,80})/i;

const CRITERION_FILLER = new Set(["the", "a", "an", "to", "of", "for", "on", "in", "at", "by", "its", "their"]);

function describedCriterion(phrase: string, dictionaries: EngineConfig["dictionaries"]): boolean {
  const clipped = phrase.split(/\b(?:when|if|while|unless|during|where|and|or)\b/i)[0]?.trim() ?? "";
  if (!clipped || hasVagueWording(clipped, dictionaries)) return false;
  if (/^(?:capable|able|responsible)\b/i.test(clipped)) return false;
  if (/^(?:safety[\s-]*critical|asil(?:[\s-]*[a-d])?|sil(?:[\s-]*[1-4])?)$/i.test(clipped)) return false;
  const words = clipped.match(/[a-z0-9][\w-]*/gi) ?? [];
  return words.some((word) => !CRITERION_FILLER.has(word.toLowerCase()));
}

/**
 * Qualitative and observable: an observation verb or a stated condition,
 * followed by whatever words describe the criterion. Those words are not a fixed list.
 */
function hasObjectiveObservable(text: string, dictionaries: EngineConfig["dictionaries"]): boolean {
  const observation = text.match(OBSERVATION_VERB);
  if (observation) {
    const verb = observation[1]?.toLowerCase() ?? "";
    const selfContained = /^(?:illuminat|extinguish|flash|blink)/.test(verb);
    if (selfContained || describedCriterion(observation[2] ?? "", dictionaries)) return true;
  }
  const state = text.match(OBSERVABLE_STATE);
  return state ? describedCriterion(state[1] ?? "", dictionaries) : false;
}

function hasWeakObservable(text: string): boolean {
  return /\b(?:visible|displayed|shown|appearance|inspect(?:ed|ion)?|visual(?:ly)?\s+check)\b/i.test(text);
}

const EVENT_TRIGGER =
  /\b(?:upon|when|if|while|unless|after|before|once|during|in\s+the\s+event(?:\s+of)?)\b/i;

const NON_RESULT_VERB =
  /^(?:be|is|are|been|being|provide|support|ensure|facilitate|optimize|optimise|improve|enhance|handle|manage|process|perform|achieve|meet|comply|satisfy|consider|address|exist|have|include|contain)$/i;

/**
 * Binary functional event: [actor] shall [resulting state] [object] [trigger].
 * "The guidance system shall disengage automatic guidance upon operator override input."
 * The verb is not a fixed list. The object and the trigger must name something concrete.
 */
function hasBinaryFunctionalEvent(text: string, dictionaries: EngineConfig["dictionaries"]): boolean {
  const subject = text.split(/\b(?:shall|must)\b/i)[0] ?? "";
  if (!/[a-z]/i.test(subject)) return false;
  const trigger = text.match(
    /\b(?:upon|when|if|while|unless|after|before|once|during|in\s+the\s+event(?:\s+of)?)\b\s*([^.!;?]{0,80})/i
  );
  if (!trigger || !describedCriterion(trigger[1] ?? "", dictionaries)) return false;
  for (const event of text.matchAll(/\b(?:shall|must)\s+(?:not\s+)?([a-z]+)\s+([^.!;?]{1,180})/gi)) {
    if (NON_RESULT_VERB.test(event[1] ?? "")) continue;
    const objectPhrase = (event[2] ?? "").split(EVENT_TRIGGER)[0] ?? "";
    if (describedCriterion(objectPhrase, dictionaries)) return true;
  }
  return false;
}

function scoreVerifiable(req: CanonicalRequirement, dictionaries: EngineConfig["dictionaries"]): QualityScore {
  const frame = semanticFrameOf(req);
  const text = `${req.normalized_text} ${req.source_text}`;
  const withUnit = frame.parameters.some((p) => Number.isFinite(p.value) && Boolean(p.unit));
  if (withUnit || hasObjectiveObservable(text, dictionaries) || hasBinaryFunctionalEvent(text, dictionaries)) return 2;
  const bareNumber = frame.parameters.some((p) => Number.isFinite(p.value) && !p.unit);
  const referenced = frame.verification_signals.some((s) => s.kind === "referenced");
  if (bareNumber || referenced || hasWeakObservable(text)) return 1;
  return 0;
}

function gateStage(unambiguous: QualityScore, feasible: GatedScore, verifiable: GatedScore, singular: GatedScore): GateStage {
  if (unambiguous < 2) return "ambiguous";
  if (feasible !== 2) return "feasible";
  if (verifiable !== 2) return "verifiable";
  if (singular !== 2) return "singular";
  return "done";
}

function gatesPassed(row: GatedScore[]): number {
  let passed = 0;
  for (const cell of row) {
    if (cell !== 2) break;
    passed += 1;
  }
  return passed;
}

/** A candidate row is kept when it opens a later gate and every cell that was already 2 stays 2. */
export function rowAdvances(previous: GatedScore[], next: GatedScore[]): boolean {
  if (gatesPassed(next) <= gatesPassed(previous)) return false;
  const width = Math.max(previous.length, next.length);
  for (let i = 0; i < width; i += 1) {
    if (previous[i] === 2 && next[i] !== 2) return false;
  }
  return true;
}

export function assessQualityMatrix(
  requirements: CanonicalRequirement[],
  setLevelFindings: StructuredFinding[],
  safetyCriticalWeight: number,
  dictionaries: EngineConfig["dictionaries"],
  singular: { maxWords?: number; countAndOr?: boolean } = {}
): {
  scores: Map<string, QualityVector>;
  document: DocumentMaturity;
  /** R, n×4. Order: ambiguous, feasible, verifiable, singular. Null means withheld. */
  quality_matrix: GatedScore[][];
} {
  const omega = Number.isFinite(safetyCriticalWeight) && safetyCriticalWeight >= 1 ? safetyCriticalWeight : 1;
  const singularOptions = {
    maxWords: singular.maxWords ?? 60,
    countAndOr: singular.countAndOr !== false,
  };
  const scores = new Map<string, QualityVector>();
  const quality_matrix: GatedScore[][] = [];
  const maturities: number[] = [];

  for (const req of requirements) {
    const unambiguous = scoreUnambiguous(req, dictionaries);
    const feasible = unambiguous === 2 ? scoreFeasible(req, requirements, dictionaries) : null;
    const verifiable = feasible === 2 ? scoreVerifiable(req, dictionaries) : null;
    const singularScore = verifiable === 2 ? scoreSingular(req, singularOptions) : null;
    const row: GatedScore[] = [unambiguous, feasible, verifiable, singularScore];
    const passed = gatesPassed(row);
    const maturity = passed / GATE_COUNT;
    const safety_critical = isSafetyCritical(req);
    const vector: QualityVector = {
      unambiguous,
      feasible,
      verifiable,
      singular: singularScore,
      stage: gateStage(unambiguous, feasible, verifiable, singularScore),
      maturity,
      quality_score: Math.round(maturity * 10000) / 100,
      safety_critical,
      weight: safety_critical ? omega : 1,
    };
    scores.set(req.id, vector);
    quality_matrix.push(row);
    maturities.push(maturity);
  }

  const n = maturities.length;
  const meanMaturity = n === 0 ? 0 : maturities.reduce((sum, value) => sum + value, 0) / n;
  const consistency = scoreSetConsistency(requirements, setLevelFindings);
  const capped = consistency === 0 ? 0 : consistency === 1 ? Math.min(meanMaturity, 0.5) : meanMaturity;
  const document: DocumentMaturity = {
    consistency,
    mean_maturity: Math.round(meanMaturity * 10000) / 10000,
    system_maturity_index: Math.round(capped * 10000) / 100,
    safety_critical_weight: omega,
    safety_critical_count: requirements.filter((req) => isSafetyCritical(req)).length,
  };

  return { scores, document, quality_matrix };
}

