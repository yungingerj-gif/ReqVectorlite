import type { CanonicalRequirement, LayeredAnalysisResult } from "../types/layeredTypes";

export interface TraceabilityRow {
  id: string;
  statement: string;
  sourceParentIds: string;
  childDerivedIds: string;
  allocatedSystemElement: string;
  verificationMethod: string;
  verificationSuccessCriteria: string;
  verificationLevelPhase: string;
  verificationProcedureId: string;
  verificationResultStatus: string;
  owner: string;
  statusVersion: string;
}

export const TRACEABILITY_COLUMNS: Array<{ key: keyof TraceabilityRow; label: string; className?: string }> = [
  { key: "id", label: "Requirement ID" },
  { key: "statement", label: "Requirement statement", className: "lv-trace-statement" },
  { key: "sourceParentIds", label: "Source / Parent ID" },
  { key: "childDerivedIds", label: "Child / Derived Requirement IDs" },
  { key: "allocatedSystemElement", label: "Allocated system element" },
  { key: "verificationMethod", label: "Verification method" },
  { key: "verificationSuccessCriteria", label: "Verification success criteria", className: "lv-trace-criteria" },
  { key: "verificationLevelPhase", label: "Verification level / phase" },
  { key: "verificationProcedureId", label: "Verification procedure / test case ID" },
  { key: "verificationResultStatus", label: "Verification result / status" },
  { key: "owner", label: "Requirement owner" },
  { key: "statusVersion", label: "Requirement status / version" },
];

const EMPTY = "—";

const COLUMN_LABEL = new Map(TRACEABILITY_COLUMNS.map((column) => [column.key, column.label]));

/** Exact header phrases from a requirements table. Longer phrases are listed first. */
const HEADER_PHRASES: Array<[string, keyof TraceabilityRow]> = [
  ["requirement id", "id"],
  ["req id", "id"],
  ["object id", "id"],
  ["identifier", "id"],
  ["id", "id"],
  ["requirement statement", "statement"],
  ["requirement text", "statement"],
  ["requirement description", "statement"],
  ["statement", "statement"],
  ["description", "statement"],
  ["text", "statement"],
  ["requirement", "statement"],
  ["source / parent id", "sourceParentIds"],
  ["source parent id", "sourceParentIds"],
  ["parent requirement id", "sourceParentIds"],
  ["source requirement id", "sourceParentIds"],
  ["parent id", "sourceParentIds"],
  ["source id", "sourceParentIds"],
  ["parent", "sourceParentIds"],
  ["source", "sourceParentIds"],
  ["child / derived requirement ids", "childDerivedIds"],
  ["child derived requirement ids", "childDerivedIds"],
  ["derived requirement ids", "childDerivedIds"],
  ["child requirement ids", "childDerivedIds"],
  ["child ids", "childDerivedIds"],
  ["derived ids", "childDerivedIds"],
  ["child id", "childDerivedIds"],
  ["children", "childDerivedIds"],
  ["derived requirements", "childDerivedIds"],
  ["allocated system element", "allocatedSystemElement"],
  ["allocated element", "allocatedSystemElement"],
  ["system element", "allocatedSystemElement"],
  ["allocated to", "allocatedSystemElement"],
  ["allocation", "allocatedSystemElement"],
  ["verification method", "verificationMethod"],
  ["verification success criteria", "verificationSuccessCriteria"],
  ["success criteria", "verificationSuccessCriteria"],
  ["acceptance criteria", "verificationSuccessCriteria"],
  ["verification criteria", "verificationSuccessCriteria"],
  ["verification level / phase", "verificationLevelPhase"],
  ["verification level phase", "verificationLevelPhase"],
  ["verification level", "verificationLevelPhase"],
  ["verification phase", "verificationLevelPhase"],
  ["level / phase", "verificationLevelPhase"],
  ["verification procedure / test case id", "verificationProcedureId"],
  ["verification procedure", "verificationProcedureId"],
  ["test case id", "verificationProcedureId"],
  ["procedure id", "verificationProcedureId"],
  ["test case", "verificationProcedureId"],
  ["procedure", "verificationProcedureId"],
  ["verification result / status", "verificationResultStatus"],
  ["verification result status", "verificationResultStatus"],
  ["verification result", "verificationResultStatus"],
  ["verification status", "verificationResultStatus"],
  ["test result", "verificationResultStatus"],
  ["requirement owner", "owner"],
  ["owner", "owner"],
  ["requirement status / version", "statusVersion"],
  ["requirement status version", "statusVersion"],
  ["requirement status", "statusVersion"],
  ["status / version", "statusVersion"],
  ["status", "statusVersion"],
  ["version", "statusVersion"],
  ["revision", "statusVersion"],
];

const OTHER_KEYS = TRACEABILITY_COLUMNS.map((column) => column.key).filter(
  (key) => key !== "id" && key !== "statement"
);

export interface PortedTraceability {
  rows: TraceabilityRow[];
  /** Column labels that existed as fields in the uploaded or pasted document. */
  definedColumnLabels: string[];
}

function normalizeHeader(label: string): string {
  return label
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[.]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/:$/, "");
}

function normalizeId(raw: string): string {
  return raw.replace(/\s+/g, "").replace(/_/g, "-").toUpperCase();
}

function normalizeStatement(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * ID at the start of a statement, including forms the analyzer does not mark explicit
 * (single-letter keys, hierarchical numbers, "Requirement ID:" labels).
 */
const LEADING_REQUIREMENT_ID =
  /^\s*\[?\s*(?:(?:requirement|req)\.?\s*(?:id|identifier|number|no|#)?\s*[:.)-]?\s*)?([A-Z]{1,12}(?:[-_][A-Z0-9]+){0,4}[-_ ]?\d{1,8}(?:[.-]\d{1,6}){0,6}|\d+\.\d+(?:\.\d+){0,6})\s*\]?\s*(?:[:.)\]-]+\s*|\s+)(.+)$/i;

export function peelLeadingRequirementId(statement: string): { id: string; statement: string } | null {
  const withoutBullet = statement.replace(/^\s*(?:[-*•]+|\(\d+\)|\d+[.)])\s+/, "");
  const match = withoutBullet.match(LEADING_REQUIREMENT_ID);
  const id = match?.[1]?.trim();
  const rest = match?.[2]?.trim();
  if (!id || !rest) return null;
  return { id: id.replace(/\s+/g, " "), statement: rest };
}

function headerKey(label: string): keyof TraceabilityRow | null {
  const normalized = normalizeHeader(label);
  if (!normalized) return null;
  for (const [phrase, key] of HEADER_PHRASES) {
    if (normalized === phrase) return key;
  }
  return null;
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? "";
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function mapHeaders(cells: string[]): Map<number, keyof TraceabilityRow> {
  const mapping = new Map<number, keyof TraceabilityRow>();
  const used = new Set<keyof TraceabilityRow>();
  cells.forEach((cell, index) => {
    const key = headerKey(cell);
    if (!key || used.has(key)) return;
    used.add(key);
    mapping.set(index, key);
  });
  return mapping;
}

interface ParsedTable {
  defined: Set<keyof TraceabilityRow>;
  rows: Array<Partial<Record<keyof TraceabilityRow, string>>>;
}

function parseDocumentTable(text: string): ParsedTable | null {
  const lines = text.split(/\r?\n/);
  const nonEmpty = lines.filter((line) => line.trim());
  const delimiter = nonEmpty.some((line) => line.includes("\t")) ? "\t" : ",";
  if (delimiter === "," && !nonEmpty.some((line) => line.includes(","))) return null;

  let headerIndex = -1;
  let mapping = new Map<number, keyof TraceabilityRow>();
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    if (delimiter === "\t" && !line.includes("\t")) continue;
    if (delimiter === "," && !line.includes(",")) continue;
    const cells = parseDelimitedLine(line, delimiter);
    if (cells.filter(Boolean).length < 2) continue;
    const candidate = mapHeaders(cells);
    if (candidate.size < 2) continue;
    const candidateKeys = new Set(candidate.values());
    if (!candidateKeys.has("id") && !candidateKeys.has("statement")) continue;
    headerIndex = i;
    mapping = candidate;
    break;
  }
  if (headerIndex < 0) return null;

  const defined = new Set<keyof TraceabilityRow>();
  for (const key of mapping.values()) defined.add(key);

  const rows: ParsedTable["rows"] = [];
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) continue;
    const cells = parseDelimitedLine(line, delimiter);
    if (cells.every((cell) => !cell.trim())) continue;
    const row: Partial<Record<keyof TraceabilityRow, string>> = {};
    for (const [index, key] of mapping) {
      const value = cells[index]?.trim() ?? "";
      if (value) row[key] = value;
    }
    if (Object.keys(row).length === 0) continue;
    rows.push(row);
  }
  return { defined, rows };
}

function blankRow(): TraceabilityRow {
  return {
    id: EMPTY,
    statement: EMPTY,
    sourceParentIds: EMPTY,
    childDerivedIds: EMPTY,
    allocatedSystemElement: EMPTY,
    verificationMethod: EMPTY,
    verificationSuccessCriteria: EMPTY,
    verificationLevelPhase: EMPTY,
    verificationProcedureId: EMPTY,
    verificationResultStatus: EMPTY,
    owner: EMPTY,
    statusVersion: EMPTY,
  };
}

function findDocumentRow(
  requirement: CanonicalRequirement,
  table: ParsedTable | null
): Partial<Record<keyof TraceabilityRow, string>> | undefined {
  if (!table) return undefined;
  const idKey = normalizeId(requirement.id);
  const statementKey = normalizeStatement(requirement.source_text);
  if (requirement.explicit_id) {
    const byId = table.rows.find((row) => row.id && normalizeId(row.id) === idKey);
    if (byId) return byId;
  }
  if (!statementKey) return undefined;
  return table.rows.find((row) => row.statement && normalizeStatement(row.statement) === statementKey);
}

export function portRequirementsToMatrix(
  result: LayeredAnalysisResult,
  documentText: string
): PortedTraceability {
  const table = parseDocumentTable(documentText);
  const defined = new Set<keyof TraceabilityRow>(table?.defined ?? []);
  defined.add("statement");

  const rows = result.requirements.map((row) => {
    const requirement = row.requirement;
    const traced = blankRow();
    const source = findDocumentRow(requirement, table);
    const documentId = source?.id?.trim() ?? "";
    const documentStatement = source?.statement?.trim() ?? "";
    let id = documentId || (requirement.explicit_id ? requirement.id : "");
    let statement = documentStatement || requirement.source_text.trim();
    const peeled = peelLeadingRequirementId(statement);
    if (peeled) {
      const sameAsId = id.length > 0 && normalizeId(id).replace(/-/g, "") === normalizeId(peeled.id).replace(/-/g, "");
      if (!id) {
        id = peeled.id;
        statement = peeled.statement;
      } else if (sameAsId) {
        statement = peeled.statement;
      }
    }
    statement = statement.replace(/^\s*\]\s*/, "").replace(/\s*\[\s*$/, "").trim();
    traced.id = id || EMPTY;
    traced.statement = statement || EMPTY;

    for (const key of OTHER_KEYS) {
      if (!table?.defined.has(key)) continue;
      const value = source?.[key]?.trim();
      if (value) traced[key] = value;
    }
    return traced;
  });

  if (rows.some((row) => row.id !== EMPTY)) defined.add("id");

  const definedColumnLabels = TRACEABILITY_COLUMNS.filter((column) => defined.has(column.key)).map(
    (column) => COLUMN_LABEL.get(column.key) ?? column.label
  );

  return { rows, definedColumnLabels };
}
