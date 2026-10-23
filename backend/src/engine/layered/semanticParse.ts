import type {
  CanonicalRequirement,
  ComparisonOperator,
  ObligationVerb,
  RequirementParameter,
  RequirementSemanticFrame,
  ThresholdSpec,
  VerificationSignal,
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
  const seen = new Set<string>();
  const when = text.match(/\bwhen\b[^.]+/gi);
  const ifClause = text.match(/\bif\b[^.]+/gi);
  const unless = text.match(/\bunless\b[^.]+/gi);
  const whileClause = text.match(/\bwhile\b[^.]+/gi);
  for (const x of [...(when ?? []), ...(ifClause ?? []), ...(unless ?? []), ...(whileClause ?? [])]) {
    const t = normalizeWhitespace(x);
    const key = t.toLowerCase();
    if (t.length > 3 && !seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}

const MODE_NAMES =
  "reverse|forward|startup|start-up|shutdown|shut-down|idle|cruise|limp(?:-home)?|failsafe|fail-safe|degraded|emergency|manual|automatic|autonomous|parked|drive|charging|maintenance|normal|sleep|wake|run|standby";

function extractModes(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const n = normalizeWhitespace(raw.toLowerCase()).replace(/-/g, " ");
    if (n.length < 2 || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  const modePhrase = text.matchAll(
    new RegExp(
      `\\b(?:in|during|under|into)\\s+(?:the\\s+)?(${MODE_NAMES})(?:\\s+(?:mode|operation|operations))?\\b`,
      "gi"
    )
  );
  for (const m of modePhrase) add(m[1]!);
  const namedMode = text.matchAll(/\b([a-z][a-z0-9-]+)\s+mode\b/gi);
  for (const m of namedMode) add(`${m[1]} mode`);
  return out;
}

const STATE_NAMES =
  "powered\\s+on|powered\\s+off|power-on|power-off|armed|disarmed|enabled|disabled|active|inactive|standby|ready|fault|faulted|error|locked|unlocked|engaged|disengaged|open|closed|connected|disconnected";

function extractStates(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const n = normalizeWhitespace(raw.toLowerCase());
    if (n.length < 2 || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  const inState = text.matchAll(
    new RegExp(`\\b(?:in|when|while)\\s+(?:the\\s+)?(${STATE_NAMES})(?:\\s+state)?\\b`, "gi")
  );
  for (const m of inState) add(m[1]!);
  const stateNoun = text.matchAll(/\b([a-z][a-z0-9-]+)\s+state\b/gi);
  for (const m of stateNoun) add(`${m[1]} state`);
  return out;
}

function extractVerificationSignals(
  text: string,
  parameters: RequirementParameter[]
): VerificationSignal[] {
  const out: VerificationSignal[] = [];
  const seen = new Set<string>();
  const add = (sig: VerificationSignal) => {
    const key = `${sig.kind}|${sig.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(sig);
  };

  const verifiedBy = text.matchAll(
    /\b(?:verif(?:y|ied|ication)|demonstrat(?:e|ed)|validat(?:e|ed)|confirm(?:ed)?)\s+(?:by|via|through|using|against)\s+([^.;]{3,80})/gi
  );
  for (const m of verifiedBy) {
    add({
      kind: "test",
      name: normalizeWhitespace(m[1]!),
      evidence_span: m[0],
    });
  }

  const measuredBy = text.matchAll(
    /\b(?:measur(?:e|ed|ement)|as\s+indicated|as\s+reported)\s+(?:by|via|at|using|from)\s+([^.;]{3,80})/gi
  );
  for (const m of measuredBy) {
    add({
      kind: "measurement",
      name: normalizeWhitespace(m[1]!),
      evidence_span: m[0],
    });
  }

  const inspect = text.matchAll(/\b(inspect(?:ed|ion)?|visual(?:ly)?\s+check)\b/gi);
  for (const m of inspect) {
    add({ kind: "inspection", name: normalizeWhitespace(m[0]), evidence_span: m[0] });
  }

  const visual = text.matchAll(
    /\b(illuminat(?:e|es|ed|ion)|visible|displayed|shown|appearance|telltale|\bleds?\b|warning\s+(?:lamp|light)|indicator\s+(?:lamp|light)|status\s+(?:lamp|light)|\blamp\b|\bicon\b|on[\s-]screen|colour(?:ed)?|colored|turns?\s+(?:red|green|amber|yellow|blue|white)|(?:shall|must)\s+be\s+(?:red|green|amber|yellow|blue|white))\b/gi
  );
  for (const m of visual) {
    add({ kind: "observable", name: normalizeWhitespace(m[0]), evidence_span: m[0] });
  }

  const referenced = text.matchAll(
    /\b(?:within\s+(?:the\s+)?(?:defined\s+|specified\s+|stated\s+|documented\s+)?tolerance(?:s)?(?:\s+(?:of|from|in|per)\s+[^.;]{2,80})?|tolerance(?:s)?\s+(?:specified|defined|given|stated|documented|provided|listed)\s+(?:in|by|per|on)\s+[^.;]{2,80}|(?:as|when)\s+(?:specified|defined|stated|documented|required)\s+(?:in|by|per|on)\s+[^.;]{2,80}|in\s+accordance\s+with\s+[^.;]{2,80}|according\s+to\s+[^.;]{2,80}|per\s+(?:the\s+)?(?:applicable\s+)?(?:ICD|SRS|IRS|standard|specification|drawing|table|document|datasheet|requirement|parent)[^.;]{0,60}|(?:refer(?:red|ence)?\s+to|see)\s+(?:requirement|document|table|section|spec(?:ification)?|drawing|ICD|SRS)[^.;]{0,60}|(?:defined|specified)\s+(?:outside(?:\s+of)?\s+this\s+requirement|elsewhere)|outside(?:\s+of)?\s+this\s+requirement|(?:another|external|parent|source)\s+(?:requirement|specification|document)|as\s+(?:given|listed|shown)\s+in\s+[^.;]{2,80})\b/gi
  );
  for (const m of referenced) {
    add({
      kind: "referenced",
      name: normalizeWhitespace(m[0]).slice(0, 160),
      evidence_span: m[0],
    });
  }

  const analysis = text.matchAll(/\b(analysis|analyzed|by\s+analysis|calculation)\b/gi);
  for (const m of analysis) {
    add({ kind: "analysis", name: normalizeWhitespace(m[0]), evidence_span: m[0] });
  }

  const observables = text.matchAll(
    /\b((?:CAN|LIN|ethernet)\s+signal|[a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*)?\s+sensor|[a-z][a-z0-9-]*(?:sensor|transducer|telemetry|diagnostic)|BIT|built-in\s+test|acceptance\s+test|test\s+case)\b/gi
  );
  for (const m of observables) {
    add({ kind: "observable", name: normalizeWhitespace(m[0]), evidence_span: m[0] });
  }

  for (const p of parameters) {
    const label = `${p.parameter} ${p.operator} ${p.value}${p.unit ? ` ${p.unit}` : ""}`;
    const sig: VerificationSignal = { kind: "measurement", name: label };
    if (p.evidence_span) sig.evidence_span = p.evidence_span;
    add(sig);
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function guessAction(text: string): string | undefined {
  const m = text.match(
    /\b(?:shall|must|should|may|could|might)\s+((?:not\s+)?[a-z]+(?:\/[a-z]+)?)\b/i
  );
  if (m?.[1]) return normalizeWhitespace(m[1].toLowerCase());
  return undefined;
}

const OBJECT_PARTICLES = new Set(["off", "on", "out", "up", "down", "back", "over", "away"]);
const OBJECT_LEADING_PREP = new Set(["to", "of", "for", "with", "on", "in", "into", "onto"]);
const OBJECT_END_PREP = new Set(["to", "from", "for", "into", "onto"]);
const OBJECT_CONDITION = new Set(["when", "if", "unless", "while", "during"]);
const OBJECT_BOUND = new Set(["within", "between"]);

/**
 * Object: the specific entity, item, or parameter being acted upon by the
 * system or subject. Not the subject/actor, not the action verb, not the
 * numeric bound, and not the condition/mode clause.
 */
function guessObject(
  text: string,
  action?: string,
  parameters?: RequirementParameter[],
  actor?: string
): string | undefined {
  const fromAction = cleanObjectPhrase(objectSpanAfterAction(text, action), action, actor);
  if (fromAction) return fromAction;

  if (parameters) {
    for (const p of parameters) {
      const fromParam = cleanObjectPhrase(p.parameter, action, actor);
      if (fromParam && fromParam !== "metric") return fromParam;
    }
  }
  return undefined;
}

function objectSpanAfterAction(text: string, action?: string): string | undefined {
  if (!action) return undefined;
  const m = text.match(
    new RegExp(
      `\\b(?:shall|must|should|may|could|might)\\s+${escapeRe(action)}\\s+(.+)$`,
      "i"
    )
  );
  if (!m?.[1]) return undefined;

  const tokens = normalizeWhitespace(m[1]).split(" ");
  let i = 0;
  while (i < tokens.length && OBJECT_PARTICLES.has(tokens[i]!.toLowerCase())) i += 1;
  while (i < tokens.length && OBJECT_LEADING_PREP.has(tokens[i]!.toLowerCase())) i += 1;

  const kept: string[] = [];
  for (; i < tokens.length; i += 1) {
    const raw = tokens[i]!;
    const w = raw.toLowerCase().replace(/[.,;:]+$/g, "");
    if (!w) break;
    if (OBJECT_CONDITION.has(w) || OBJECT_BOUND.has(w)) break;
    if (w === "at" && /^(least|most)$/i.test(tokens[i + 1] ?? "")) break;
    if (OBJECT_END_PREP.has(w) && kept.length > 0) break;
    if (/\d/.test(w)) break;
    if (/^(as|using|via|by)$/i.test(w) && kept.length > 0) break;
    kept.push(w);
  }
  return kept.length > 0 ? kept.join(" ") : undefined;
}

function cleanObjectPhrase(
  raw: string | undefined,
  action?: string,
  actor?: string
): string | undefined {
  if (!raw) return undefined;
  let t = normalizeWhitespace(raw.toLowerCase());
  t = t.replace(/^(?:the|a|an)\s+/i, "");
  if (actor) t = t.replace(new RegExp(`\\b${escapeRe(actor)}\\b`, "gi"), " ");
  if (action) {
    for (const part of action.split(/\s+/)) {
      if (!part || part === "not") continue;
      t = t.replace(new RegExp(`\\b${escapeRe(part)}\\b`, "gi"), " ");
    }
  }
  t = normalizeWhitespace(t).replace(/[.,;:]+$/g, "");
  t = t.replace(/^(?:the|a|an|to|of|for|with)\s+/i, "").replace(/\s+(?:to|of|for|with)$/i, "");
  if (t.length < 2) return undefined;
  if (/^\d/.test(t) || t === "metric") return undefined;
  return t.slice(0, 200);
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
 *
 * text → semanticParse → RequirementSemanticFrame
 */
export function parseRequirementSemanticFrame(text: string): RequirementSemanticFrame {
  const normalized = normalizeWhitespace(text);
  const obligation = guessObligation(normalized);
  const actor = guessActor(normalized);
  const parameters = parseRequirementParameters(normalized);
  const action = guessAction(normalized);
  const object = guessObject(normalized, action, parameters, actor);
  const conditions = extractConditions(normalized);
  const modes = extractModes(normalized);
  const states = extractStates(normalized);
  const verification_signals = extractVerificationSignals(normalized, parameters);
  const polarity = inferPolarity(normalized, obligation);

  const frame: RequirementSemanticFrame = {
    conditions,
    modes,
    states,
    parameters,
    verification_signals,
    polarity,
  };
  if (actor) frame.actor = actor;
  if (action) frame.action = action;
  if (object) frame.object = object;
  if (obligation) frame.obligation = obligation;
  return frame;
}

/**
 * Copies the L0 frame onto a CanonicalRequirement so identity fields and semantics stay in sync.
 */
export function applySemanticFrameToCanonical(
  req: CanonicalRequirement,
  frame: RequirementSemanticFrame
): CanonicalRequirement {
  req.semantics = frame;
  req.polarity = frame.polarity;
  req.conditions = frame.conditions;
  req.modes = frame.modes;
  req.states = frame.states;
  req.parameters = frame.parameters;
  req.verification_signals = frame.verification_signals;
  if (frame.actor !== undefined) req.actor = frame.actor;
  else delete req.actor;
  if (frame.action !== undefined) req.action = frame.action;
  else delete req.action;
  if (frame.object !== undefined) req.object = frame.object;
  else delete req.object;
  if (frame.obligation !== undefined) req.obligation = frame.obligation;
  else delete req.obligation;
  if (frame.parameters.length > 0) {
    req.thresholds = parametersToThresholdSpecs(frame.parameters);
  } else {
    delete req.thresholds;
  }
  return req;
}
