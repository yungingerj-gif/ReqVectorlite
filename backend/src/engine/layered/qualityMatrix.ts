import { semanticFrameOf } from "./canonicalAccess";
import type { EngineConfig } from "./config";
import type {
  CanonicalRequirement,
  ComparisonOperator,
  DocumentMaturity,
  QualityScore,
  QualityVector,
  StructuredFinding,
} from "./types";

const COLUMNS = ["necessary", "unambiguous", "complete", "feasible", "verifiable"] as const;

const SAFETY_CRITICAL =
  /\b(safety[\s-]*critical|ASIL[\s-]*[A-D]|SIL[\s-]*[1-4])\b/i;

const NEED_CITATION =
  /\b(?:traces?\s+to|derived\s+from|satisfies|parent(?:\s+(?:id|requirement))?|stakeholder(?:\s+need)?|need(?:\s+id)?)\b[:\s-]*[A-Z]{1,12}[-_ ]?\d+(?:\.\d+)*|\b(?:NEED|STK|PARENT|SN)[-_ ]?\d+\b/i;

const DESIGN_PRESCRIPTIVE =
  /\b(algorithm|source code|programmed in|coded in|written in|implemented in|c\+\+|python|javascript|\bjava\b|part\s*number|\bp\/n\b|screen layout|button layout|gui widget)\b/i;

const UNBOUNDED = /\b(infinite|unlimited|zero\s+defect|100%\s+of\s+all)\b/i;
const ABSOLUTE = /\b(always|never|all\s+times|under\s+all\s+conditions)\b/i;
const OPEN_ENDED = /\betc\.?|and\s+so\s+on|and\s+more\b/i;
const CONDITIONAL = /\b(when|if|while|unless)\b/i;
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

const REF_ID =
  /\b(?:per|see|parent|satisfies|traces\s+to|derived\s+from)\s+([A-Z]{1,12}[-_ ]?\d+(?:\.\d+)*)/gi;

type Bound = {
  lower: number;
  upper: number;
  hasLower: boolean;
  hasUpper: boolean;
};

function minScore(values: QualityScore[]): QualityScore {
  return values.reduce((m, v) => (v < m ? v : m), 2 as QualityScore);
}

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

function hasNeedCitation(text: string): boolean {
  return NEED_CITATION.test(text);
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

function scoreNecessary(req: CanonicalRequirement, documentHasNeeds: boolean): QualityScore {
  const text = `${req.normalized_text} ${req.source_text}`;
  if (DESIGN_PRESCRIPTIVE.test(text)) return 0;
  const cited = hasNeedCitation(text);
  if (documentHasNeeds && !cited) return 0;
  if (cited) return 2;
  return 1;
}

function scoreUnambiguous(req: CanonicalRequirement, dictionaries: EngineConfig["dictionaries"]): QualityScore {
  const text = req.normalized_text;
  const binding = hasBindingObligation(req);
  const vague = hasVagueWording(text, dictionaries);
  const weak = hasWeakModal(text, dictionaries.weak_modals);
  const passive = PASSIVE.test(text);
  const compound = obligationCount(text) >= 2 || /\band\/or\b/i.test(text);
  const manySentences = sentenceCount(text) > 1;
  const actor = Boolean(semanticFrameOf(req).actor);
  if (!binding || (vague && compound)) return 0;
  if (vague || weak || passive || compound || manySentences || !actor) return 1;
  return 2;
}

function scoreComplete(req: CanonicalRequirement): QualityScore {
  const frame = semanticFrameOf(req);
  const text = req.normalized_text;
  const binding = hasBindingObligation(req);
  const conditional = CONDITIONAL.test(text);
  const conditionStated = frame.conditions.length > 0 || frame.modes.length > 0 || frame.states.length > 0;
  if (!binding || (conditional && !conditionStated)) return 0;
  const actor = Boolean(frame.actor);
  const action = Boolean(frame.action && frame.action.length >= 3);
  const object = Boolean(frame.object && frame.object.length > 0);
  if (actor && action && object && (!conditional || conditionStated)) return 2;
  if (action) return 1;
  return 0;
}

function scoreFeasible(req: CanonicalRequirement, requirements: CanonicalRequirement[]): QualityScore {
  const text = req.normalized_text;
  if (UNBOUNDED.test(text) || outsideForeignLimit(req, requirements)) return 0;
  if (ABSOLUTE.test(text)) return 1;
  return 2;
}

function scoreVerifiable(req: CanonicalRequirement): QualityScore {
  const frame = semanticFrameOf(req);
  const withUnit = frame.parameters.some((p) => Number.isFinite(p.value) && Boolean(p.unit));
  if (withUnit) return 2;
  const bareNumber = frame.parameters.some((p) => Number.isFinite(p.value) && !p.unit);
  const referenced = frame.verification_signals.some((s) => s.kind === "referenced");
  if (bareNumber || referenced) return 1;
  return 0;
}

function rowVector(
  scores: Omit<QualityVector, "maturity" | "quality_score" | "safety_critical" | "weight">
): QualityScore[] {
  return COLUMNS.map((key) => scores[key]);
}

/** q_i = (sum_j Q_ij / (2 * sum_j W_ij)) * 100. A fully met row is 100. */
export function requirementQualityScore(qRow: number[], wRow: number[]): number {
  let sumQ = 0;
  let sumW = 0;
  for (let j = 0; j < COLUMNS.length; j++) {
    sumQ += qRow[j] ?? 0;
    sumW += wRow[j] ?? 1;
  }
  if (sumW <= 0) return 0;
  const percentage = (sumQ / (2 * sumW)) * 100;
  return Math.round(percentage * 100) / 100;
}

/** d = (1/n) sum r_i. Column means of R, in attribute order. */
export function defectProfile(raw: number[][]): number[] {
  const n = raw.length;
  if (n === 0) return COLUMNS.map(() => 0);
  return COLUMNS.map((_, column) => {
    let sum = 0;
    for (const row of raw) sum += row[column] ?? 0;
    return Math.round((sum / n) * 100) / 100;
  });
}

function referencedIds(text: string): string[] {
  const ids: string[] = [];
  for (const match of text.matchAll(REF_ID)) {
    if (match[1]) ids.push(match[1].replace(/\s+/g, "-").toUpperCase());
  }
  return ids;
}

function normalizeReqId(id: string): string {
  return id.replace(/\s+/g, "").replace(/_/g, "-").toUpperCase();
}

function scoreDocumentCompleteness(requirements: CanonicalRequirement[]): QualityScore {
  const known = new Set(requirements.map((r) => normalizeReqId(r.id)));
  let dangling = false;
  for (const req of requirements) {
    for (const ref of referencedIds(`${req.normalized_text} ${req.source_text}`)) {
      if (!known.has(normalizeReqId(ref))) dangling = true;
    }
  }
  if (dangling) return 0;
  const cited = requirements.filter((r) => hasNeedCitation(`${r.normalized_text} ${r.source_text}`));
  if (cited.length > 0 && cited.length < requirements.length) return 1;
  return 2;
}

function scoreDocumentConsistency(findings: StructuredFinding[]): QualityScore {
  const types = new Set(findings.map((f) => f.issue_type));
  for (const t of types) {
    if (DIRECT_CONFLICT.has(t)) return 0;
  }
  for (const t of types) {
    if (SOFT_CONFLICT.has(t)) return 1;
  }
  return 2;
}

function groupIsOpen(requirements: CanonicalRequirement[], key: string): boolean {
  return requirements.some((req) => {
    if (!OPEN_ENDED.test(req.normalized_text)) return false;
    return semanticFrameOf(req).parameters.some(
      (p) => p.unit && quantityKey(p.parameter, p.unit) === key
    );
  });
}

function scoreDocumentBounded(requirements: CanonicalRequirement[]): QualityScore {
  const groups = new Map<string, { hasLower: boolean; hasUpper: boolean }>();
  for (const req of requirements) {
    for (const p of semanticFrameOf(req).parameters) {
      if (!p.unit || !Number.isFinite(p.value)) continue;
      const key = quantityKey(p.parameter, p.unit);
      const g = groups.get(key) ?? { hasLower: false, hasUpper: false };
      if (p.operator === ">" || p.operator === ">=" || p.operator === "=") g.hasLower = true;
      if (p.operator === "<" || p.operator === "<=" || p.operator === "=") g.hasUpper = true;
      groups.set(key, g);
    }
  }
  if (groups.size === 0) return 2;
  let oneSided = false;
  for (const [key, g] of groups) {
    if (groupIsOpen(requirements, key)) return 0;
    if (!g.hasLower || !g.hasUpper) oneSided = true;
  }
  return oneSided ? 1 : 2;
}

function requirementOutsideJoint(req: CanonicalRequirement, joint: Map<string, Bound>): boolean {
  for (const p of semanticFrameOf(req).parameters) {
    if (!p.unit || !Number.isFinite(p.value)) continue;
    const bound = joint.get(quantityKey(p.parameter, p.unit));
    if (!bound) continue;
    if (bound.hasUpper && p.value > bound.upper) return true;
    if (bound.hasLower && p.value < bound.lower) return true;
  }
  return false;
}

function scoreDocumentFeasible(requirements: CanonicalRequirement[], bounded: QualityScore): QualityScore {
  const joint = boundsByQuantity(requirements);
  for (const bound of joint.values()) {
    if (bound.hasLower && bound.hasUpper && bound.lower > bound.upper) return 0;
  }
  if (requirements.some((req) => isSafetyCritical(req) && requirementOutsideJoint(req, joint))) return 0;
  if (bounded === 0) return 0;
  if (bounded === 1) return 1;
  return joint.size === 0 ? 2 : 2;
}

/**
 * W is n×5, aligned with R.
 * A safety-critical row carries ω on feasible and verifiable. Every other cell is 1.
 */
export function weightMatrixFor(requirementWeights: number[]): number[][] {
  return requirementWeights.map((weight) => [1, 1, 1, weight, weight]);
}

/** Q = R × W, cell by cell. Both matrices are n×5. */
export function weightedEvaluationMatrix(raw: number[][], weights: number[][]): number[][] {
  return raw.map((row, i) =>
    row.map((value, j) => {
      const weight = weights[i]?.[j] ?? 1;
      return Math.round(value * weight * 1000) / 1000;
    })
  );
}

/** Column mean of Q divided by the matching column of W. Stays on the 0–2 scale. */
function columnMeanFromProduct(weighted: number[][], weights: number[][], column: number): number {
  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < weighted.length; i++) {
    numerator += weighted[i]?.[column] ?? 0;
    denominator += weights[i]?.[column] ?? 1;
  }
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 100) / 100;
}

export function assessQualityMatrix(
  requirements: CanonicalRequirement[],
  setLevelFindings: StructuredFinding[],
  safetyCriticalWeight: number,
  dictionaries: EngineConfig["dictionaries"]
): {
  scores: Map<string, QualityVector>;
  document: DocumentMaturity;
  /** R, n×5 raw scores. */
  quality_matrix: number[][];
  /** W, n×5. ω on feasible and verifiable for safety-critical rows. */
  weight_matrix: number[][];
  /** Q = R × W. */
  weighted_evaluation_matrix: number[][];
} {
  const omega = Number.isFinite(safetyCriticalWeight) && safetyCriticalWeight >= 1 ? safetyCriticalWeight : 1;
  const documentHasNeeds = requirements.some((r) => hasNeedCitation(`${r.normalized_text} ${r.source_text}`));
  const scores = new Map<string, QualityVector>();
  const quality_matrix: number[][] = [];
  const weights: number[] = [];

  for (const req of requirements) {
    const cells = {
      necessary: scoreNecessary(req, documentHasNeeds),
      unambiguous: scoreUnambiguous(req, dictionaries),
      complete: scoreComplete(req),
      feasible: scoreFeasible(req, requirements),
      verifiable: scoreVerifiable(req),
    };
    const safety_critical = isSafetyCritical(req);
    const weight = safety_critical ? omega : 1;
    const vector: QualityVector = {
      ...cells,
      maturity: minScore(rowVector(cells)),
      quality_score: 0,
      safety_critical,
      weight,
    };
    scores.set(req.id, vector);
    quality_matrix.push(rowVector(cells));
    weights.push(weight);
  }

  const weight_matrix = weightMatrixFor(weights);
  const weighted_evaluation_matrix = weightedEvaluationMatrix(quality_matrix, weight_matrix);
  const requirementQualityScores = requirements.map((req, index) => {
    const qualityScore = requirementQualityScore(
      weighted_evaluation_matrix[index] ?? [],
      weight_matrix[index] ?? []
    );
    const vector = scores.get(req.id);
    if (vector) vector.quality_score = qualityScore;
    return qualityScore;
  });
  const n = requirementQualityScores.length;
  const systemMaturityIndex =
    n === 0
      ? 0
      : Math.round((requirementQualityScores.reduce((sum, score) => sum + score, 0) / n) * 100) / 100;
  const profile = defectProfile(quality_matrix);
  const completeness = scoreDocumentCompleteness(requirements);
  const consistency = scoreDocumentConsistency(setLevelFindings);
  const bounded = scoreDocumentBounded(requirements);
  const feasible = scoreDocumentFeasible(requirements, bounded);
  const documentScores: QualityScore[] = [completeness, consistency, bounded, feasible];

  const document: DocumentMaturity = {
    completeness,
    consistency,
    bounded,
    feasible,
    maturity: minScore(documentScores),
    weighted_feasibility: columnMeanFromProduct(weighted_evaluation_matrix, weight_matrix, 3),
    weighted_verifiability: columnMeanFromProduct(weighted_evaluation_matrix, weight_matrix, 4),
    safety_critical_weight: omega,
    safety_critical_count: requirements.filter((r) => isSafetyCritical(r)).length,
    system_maturity_index: systemMaturityIndex,
    defect_profile: profile,
  };

  return { scores, document, quality_matrix, weight_matrix, weighted_evaluation_matrix };
}

