import type {
  LayeredAnalysisResult,
  PerRequirementResult,
  StructuredFinding,
} from "../types/layeredTypes";

export type SeverityFilter = "all" | "low" | "medium" | "high";

export type RowFilter = {
  profile: string;
  severity: SeverityFilter;
  type: string;
};

export type TableSortColumn =
  | "id"
  | "text"
  | "type"
  | "unambiguous"
  | "complete"
  | "verifiable"
  | "singular"
  | "consistent_correct"
  | "overall"
  | "topIssue";

export function severityRank(s: StructuredFinding["severity"]): number {
  if (s === "high") return 0;
  if (s === "medium") return 1;
  return 2;
}

export function topFinding(findings: StructuredFinding[]): StructuredFinding | null {
  if (findings.length === 0) return null;
  return [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity))[0] ?? null;
}

export function scoreBadgeClass(score: number): "score-high" | "score-mid" | "score-low" {
  if (score >= 85) return "score-high";
  if (score >= 60) return "score-mid";
  return "score-low";
}

export function findingSeverityClass(sev: StructuredFinding["severity"]): string {
  if (sev === "high") return "finding-sev-high";
  if (sev === "medium") return "finding-sev-medium";
  return "finding-sev-low";
}

export function filterVisibleRequirements(
  result: LayeredAnalysisResult | null,
  f: RowFilter
): PerRequirementResult[] {
  if (!result) return [];
  if (f.profile !== "all" && result.meta.profile !== f.profile) return [];
  return result.requirements.filter((row) => {
    const { requirement, findings } = row;
    if (f.type !== "all" && requirement.type !== f.type) return false;
    if (f.severity === "all") return true;
    return findings.some((x) => x.severity === f.severity);
  });
}

export function sortRequirementRows(
  rows: PerRequirementResult[],
  column: TableSortColumn,
  direction: "asc" | "desc"
): PerRequirementResult[] {
  const dir = direction === "asc" ? 1 : -1;
  const tf = (findings: StructuredFinding[]) => topFinding(findings);

  return [...rows].sort((a, b) => {
    const ra = a.requirement;
    const rb = b.requirement;
    let cmp = 0;
    switch (column) {
      case "id":
        cmp = ra.id.localeCompare(rb.id);
        break;
      case "text":
        cmp = ra.normalized_text.localeCompare(rb.normalized_text);
        break;
      case "type":
        cmp = ra.type.localeCompare(rb.type);
        break;
      case "unambiguous":
        cmp = a.scores.unambiguous - b.scores.unambiguous;
        break;
      case "complete":
        cmp = a.scores.complete - b.scores.complete;
        break;
      case "verifiable":
        cmp = a.scores.verifiable - b.scores.verifiable;
        break;
      case "singular":
        cmp = a.scores.singular - b.scores.singular;
        break;
      case "consistent_correct":
        cmp = a.scores.consistent_correct - b.scores.consistent_correct;
        break;
      case "overall":
        cmp = a.scores.overall - b.scores.overall;
        break;
      case "topIssue": {
        const fa = tf(a.findings);
        const fb = tf(b.findings);
        const rankA = fa ? severityRank(fa.severity) : 99;
        const rankB = fb ? severityRank(fb.severity) : 99;
        cmp = rankA - rankB;
        if (cmp === 0) {
          cmp = (fa?.explanation ?? "").localeCompare(fb?.explanation ?? "");
        }
        break;
      }
      default:
        cmp = 0;
    }
    return cmp * dir;
  });
}
