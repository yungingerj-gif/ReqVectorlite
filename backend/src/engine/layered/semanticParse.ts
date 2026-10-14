import type {
  ComparisonOperator,
  ObligationVerb,
  RequirementParameter,
  RequirementSemanticFrame,
  ThresholdSpec,
} from "./types";

const UNIT_ALT =
  "ms|s|sec|secs|seconds|min|mins|h|hrs|hz|khz|mhz|%|percent|v|a|ma|w|kw|mw|n|kn|nm|lbf|pa|kpa|mpa|bar|psi|c|°c|deg|mm|cm|m|in|ft|kg|g|lb|rpm";

const ACTOR_CUES =
  "subsystem|system|software|hardware|controller|operator|user|vehicle|ecu|module|interface|component";

const OBLIGATION_RE = /\b(shall|must|should|may|could|might)\b/i;

const PARAM_STOP = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "of",
  "for",
  "with",
  "be",
  "is",
  "are",
  "shall",
  "must",
  "should",
  "may",
  "could",
  "might",
  "not",
  "than",
  "at",
  "no",
  "more",
  "less",
  "least",
  "most",
  "equal",
  "equals",
  "within",
  "between",
  "maximum",
  "minimum",
  "max",
  "min",
  "remain",
  "stay",
  "keep",
]);

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function canonicalUnit(raw: string): string {
  const u = raw.toLowerCase();
  if (u === "sec" || u === "secs" || u === "seconds") return "s";
  if (u === "mins") return "min";
  if (u === "hrs") return "h";
  if (u === "percent") return "%";
  return u;
}

function phraseToOperator(phrase: string): ComparisonOperator | undefined {
  const p = phrase.toLowerCase().replace(/\s+/g, " ").trim();
  if (
    /^(<=|≤|at most|no more than|less than or equal|not (?:to )?exceed(?:ed|ing)?|must not exceed|shall not exceed|maximum|max)$/.test(
      p
    )
  ) {
    return "<=";
  }
  if (/^(<|less than|below|under)$/.test(p)) return "<";
  if (
    /^(>=|≥|at least|no less than|greater than or equal|minimum|min)$/.test(p)
  ) {
    return ">=";
  }
  if (/^(>|greater than|more than|above|exceed(?:s|ing)?)$/.test(p)) return ">";
  if (/^(=|==|equal to|equals)$/.test(p)) return "=";
  if (/^within$/.test(p)) return "<=";
  return undefined;
}

function cleanParameterName(raw: string): string {
  let t = normalizeWhitespace(raw.toLowerCase());
  t = t.replace(/^(?:the|a|an)\s+/i, "");
  t = t.replace(/\b(shall|must|should|may|could|might|be|is|are|of|to)\b/gi, " ");
  t = normalizeWhitespace(t).replace(/[.,;:]+$/g, "");
  const words = t.split(" ").filter((w) => w.length > 0 && !PARAM_STOP.has(w));
  const slice = words.slice(-4).join(" ");
  return slice.slice(0, 80);
}

function subjectSpan(text: string): string {
  const m = text.match(/^([\s\S]*?)\b(shall|must|should|may|could|might)\b/i);
  return (m?.[1] ?? text).trim();
}

function guessActor(text: string): string | undefined {
  const span = subjectSpan(text);
  const m = span.match(
    new RegExp(`(?:^|\\b)(?:the\\s+)?(${ACTOR_CUES})\\b(?!-)`, "i")
  );
  return m?.[1]?.toLowerCase();
}

function guessObligation(text: string): ObligationVerb | undefined {
  const m = text.match(OBLIGATION_RE);
  return m?.[1] ? (m[1].toLowerCase() as ObligationVerb) : undefined;
}

function inferPolarity(
  text: string,
  obligation?: ObligationVerb
): RequirementSemanticFrame["polarity"] {
  const t = text.toLowerCase();
  if (/\bshall\s+not\b|\bmust\s+not\b|\bprohibited\b|\bnever\s+shall\b/.test(t)) {
    return "prohibited";
  }
  if (obligation === "shall" || obligation === "must") return "required";
  if (obligation === "should" || obligation === "may" || obligation === "could" || obligation === "might") {
    return "allowed";
  }
  return "unknown";
}

function extractConditions(text: string): string[] {
  const out: string[] = [];
  const when = text.match(/\bwhen\b[^.]+/gi);
  const ifClause = text.match(/\bif\b[^.]+/gi);
  const unless = text.match(/\bunless\b[^.]+/gi);
  for (const x of [...(when ?? []), ...(ifClause ?? []), ...(unless ?? [])]) {
    const t = normalizeWhitespace(x);
    if (t.length > 3) out.push(t);
  }
  return out;
}

function guessAction(text: string): string | undefined {
  const shall = text.match(/\b(?:shall|must)\b\s+(.+?)(?:\.|$)/i);
  if (shall?.[1]) return shall[1].trim().slice(0, 300);
  const weak = text.match(/\b(?:should|may|could|might)\b\s+(.+?)(?:\.|$)/i);
  if (weak?.[1]) return weak[1].trim().slice(0, 300);
  return undefined;
}

function guessObject(text: string, action?: string): string | undefined {
  const afterShall = text.match(/\b(?:shall|must|should|may)\s+(.{3,120}?)(?:\.|;|$)/i);
  const chunk = afterShall?.[1]?.trim() ?? text.slice(0, 120);
  if (action && chunk.toLowerCase().startsWith(action.toLowerCase().slice(0, 8))) {
    return chunk.slice(Math.min(action.length, chunk.length)).trim().slice(0, 200) || undefined;
  }
  return chunk.slice(0, 200) || undefined;
}

function pushParam(out: RequirementParameter[], seen: Set<string>, p: RequirementParameter): void {
  const unitKey = p.unit?.toLowerCase() ?? "";
  const key = `${p.parameter}|${p.operator}|${p.value}|${unitKey}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(p);
}

function parameterFromLeftContext(left: string, fallback: string): string {
  const cleaned = cleanParameterName(left);
  if (cleaned.length >= 2) return cleaned;
  return fallback;
}

/**
 * One parser for measurable claims. Rules must not re-scan the sentence for numbers/units.
 */
export function parseRequirementParameters(text: string): RequirementParameter[] {
  const out: RequirementParameter[] = [];
  const seen = new Set<string>();
  const used = new Set<string>();

  const markSpan = (start: number, end: number) => {
    used.add(`${start}:${end}`);
  };

  const betweenRe = new RegExp(
    `\\bbetween\\s+(\\d+(?:\\.\\d+)?)\\s+and\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})\\b`,
    "gi"
  );
  for (const m of text.matchAll(betweenRe)) {
    const index = m.index ?? 0;
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    const unit = canonicalUnit(String(m[3]));
    const left = text.slice(Math.max(0, index - 80), index);
    const parameter = parameterFromLeftContext(left, "range");
    const span = m[0];
    pushParam(out, seen, {
      parameter,
      operator: ">=",
      value: lo,
      unit,
      evidence_span: span,
    });
    pushParam(out, seen, {
      parameter,
      operator: "<=",
      value: hi,
      unit,
      evidence_span: span,
    });
    markSpan(index, index + span.length);
  }

  const maxMinNameRe = new RegExp(
    `\\b(maximum|max|minimum|min)\\s+([a-z][a-z0-9][a-z0-9\\s-]{0,40}?)\\s*(?:shall|must|should)?\\s*(?:be|of|is|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})\\b`,
    "gi"
  );
  for (const m of text.matchAll(maxMinNameRe)) {
    const index = m.index ?? 0;
    const span = m[0];
    if (used.has(`${index}:${index + span.length}`)) continue;
    const op = phraseToOperator(String(m[1])) ?? (String(m[1]).toLowerCase().startsWith("max") ? "<=" : ">=");
    const parameter = cleanParameterName(String(m[2])) || "metric";
    pushParam(out, seen, {
      parameter,
      operator: op,
      value: Number(m[3]),
      unit: canonicalUnit(String(m[4])),
      evidence_span: span,
    });
    markSpan(index, index + span.length);
  }

  const notExceedRe = new RegExp(
    `\\b([a-z][a-z0-9][a-z0-9\\s-]{1,40}?)\\s+(?:shall|must|should)?\\s*(?:not\\s+(?:to\\s+)?exceed|not\\s+exceed(?:ing)?)\\s+(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})\\b`,
    "gi"
  );
  for (const m of text.matchAll(notExceedRe)) {
    const index = m.index ?? 0;
    const span = m[0];
    pushParam(out, seen, {
      parameter: cleanParameterName(String(m[1])) || "metric",
      operator: "<=",
      value: Number(m[2]),
      unit: canonicalUnit(String(m[3])),
      evidence_span: span,
    });
    markSpan(index, index + span.length);
  }

  const opNumRe = new RegExp(
    `\\b(at\\s+least|at\\s+most|no\\s+more\\s+than|no\\s+less\\s+than|less\\s+than|greater\\s+than|more\\s+than|within|<=|>=|<|>)\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})\\b`,
    "gi"
  );
  for (const m of text.matchAll(opNumRe)) {
    const index = m.index ?? 0;
    const span = m[0];
    const op = phraseToOperator(String(m[1]));
    if (!op) continue;
    const left = text.slice(Math.max(0, index - 90), index);
    const parameter = parameterFromLeftContext(left, "metric");
    pushParam(out, seen, {
      parameter,
      operator: op,
      value: Number(m[2]),
      unit: canonicalUnit(String(m[3])),
      evidence_span: span,
    });
    markSpan(index, index + span.length);
  }

  const symbolicRe = new RegExp(
    `\\b([a-z][a-z0-9][a-z0-9\\s-]{1,40}?)\\s*(<=|>=|<|>|=)\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})\\b`,
    "gi"
  );
  for (const m of text.matchAll(symbolicRe)) {
    const index = m.index ?? 0;
    const span = m[0];
    pushParam(out, seen, {
      parameter: cleanParameterName(String(m[1])) || "metric",
      operator: m[2] as ComparisonOperator,
      value: Number(m[3]),
      unit: canonicalUnit(String(m[4])),
      evidence_span: span,
    });
    markSpan(index, index + span.length);
  }

  const bareNumRe = new RegExp(`\\b(\\d+(?:\\.\\d+)?)\\s*(${UNIT_ALT})\\b`, "gi");
  for (const m of text.matchAll(bareNumRe)) {
    const index = m.index ?? 0;
    const span = m[0];
    const covered = [...used].some((k) => {
      const [a, b] = k.split(":").map(Number);
      return index >= a! && index < b!;
    });
    if (covered) continue;
    const left = text.slice(Math.max(0, index - 90), index);
    const fromMax = left.match(/\b(maximum|max|minimum|min)\s*$/i);
    let operator: ComparisonOperator = "=";
    if (fromMax) {
      operator = phraseToOperator(fromMax[1]!) ?? "=";
    } else if (/\bnot\s+exceed/i.test(left)) {
      operator = "<=";
    }
    const parameter = parameterFromLeftContext(left.replace(/\b(maximum|max|minimum|min)\s*$/i, ""), "metric");
    pushParam(out, seen, {
      parameter,
      operator,
      value: Number(m[1]),
      unit: canonicalUnit(String(m[2])),
      evidence_span: span,
    });
  }

  return out;
}

export function parametersToThresholdSpecs(parameters: RequirementParameter[]): ThresholdSpec[] {
  return parameters.map((p) => {
    const t: ThresholdSpec = { value: String(p.value), comparator: p.operator };
    if (p.unit) t.unit = p.unit;
    return t;
  });
}

/**
 * Single L0 semantic parse of one requirement statement.
 */
export function parseRequirementSemanticFrame(text: string): RequirementSemanticFrame {
  const normalized = normalizeWhitespace(text);
  const obligation = guessObligation(normalized);
  const actor = guessActor(normalized);
  const action = guessAction(normalized);
  const object = guessObject(normalized, action);
  const conditions = extractConditions(normalized);
  const parameters = parseRequirementParameters(normalized);
  const polarity = inferPolarity(normalized, obligation);

  const frame: RequirementSemanticFrame = {
    conditions,
    parameters,
    polarity,
  };
  if (actor) frame.actor = actor;
  if (action) frame.action = action;
  if (object) frame.object = object;
  if (obligation) frame.obligation = obligation;
  return frame;
}
