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
  | "feasible"
  | "verifiable"
  | "singular"
  | "maturity"
  | "stage"
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

export function scoreBadgeClass(score: number | null): "score-high" | "score-mid" | "score-low" | "score-withheld" {
  if (score == null) return "score-withheld";
  if (score >= 2) return "score-high";
  if (score >= 1) return "score-mid";
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
      case "feasible":
        cmp = (a.scores.feasible ?? -1) - (b.scores.feasible ?? -1);
        break;
      case "verifiable":
        cmp = (a.scores.verifiable ?? -1) - (b.scores.verifiable ?? -1);
        break;
      case "singular":
        cmp = (a.scores.singular ?? -1) - (b.scores.singular ?? -1);
        break;
      case "maturity":
        cmp = a.scores.maturity - b.scores.maturity;
        break;
      case "stage":
        cmp = a.scores.stage.localeCompare(b.scores.stage);
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
