import { useMemo, useState } from "react";
import { findingSeverityClass } from "../store/analysisUtils";
import type {
  CanonicalRequirement,
  LayeredAnalysisResult,
  PerRequirementResult,
  StructuredFinding,
} from "../types/layeredTypes";
import { useAnalysisStore } from "../store/useAnalysisStore";

const HIER_BLOCK = "contradiction.parent_child";
const INTRA_BLOCK = "contradiction.intra_document";

function normalizeSeverity(f: StructuredFinding): StructuredFinding["severity"] {
  const s = String(f.severity ?? "")
    .trim()
    .toLowerCase();
  if (s === "low" || s === "medium" || s === "high") return s;
  return "low";
}

/** Filters every row in this panel by engine severity (low / medium / high). */
function passesSetLevelSeverityFilter(
  f: StructuredFinding,
  filter: "all" | StructuredFinding["severity"]
): boolean {
  if (filter === "all") return true;
  return normalizeSeverity(f) === filter;
}

function childDocumentLabel(meta: LayeredAnalysisResult["meta"]): string {
  return meta.source_document?.trim() || "Child document (analyzed)";
}

function parentDocumentLabel(meta: LayeredAnalysisResult["meta"]): string {
  return meta.parent_source_document?.trim() || "Parent document";
}

/** Plain-language: what the engine is claiming (many paired findings are not “contradictions”). */
function findingIntentHint(issueType: string): string | null {
  const hints: Record<string, string> = {
    possible_overlap:
      "Not a logical contradiction. The checker found moderate word overlap between these two requirements so you can review related scope, partial duplication, or unclear allocation.",
    near_duplicate:
      "Not a logical contradiction. Text is very similar — often redundancy or copy-paste; merge or clarify only if appropriate.",
    possible_threshold_conflict:
      "Numeric limits may conflict for the same kind of quantity (heuristic). Check whether both values can hold together.",
    terminology_drift:
      "Similar topic but different words from the same synonym family (configured in the engine). Consistency check, not opposite meanings.",
    duplicate_requirement:
      "Same substantive text appears under more than one requirement ID.",
    same_intent_llm:
      "These two requirements state the same obligation or outcome (not just similar words). Review for redundancy or merge.",
    conflicting_absolute_statements:
      "Single requirement mixes strong prohibition with enabling language — review that one statement.",
    possible_missing_decomposition:
      "One long requirement may bundle several obligations — structural hint only.",
    "intra.numeric_conflict":
      "Intra-spec check: numeric bounds or limits may be incompatible.",
    "intra.behavioral_conflict":
      "Intra-spec check: opposite obligation polarity (e.g. required vs prohibited) with related wording.",
    "intra.condition_conflict":
      "Intra-spec check: overlapping conditions but opposing obligation sense.",
  };
  if (hints[issueType] != null) return hints[issueType]!;
  if (issueType.startsWith("intra.ai.")) {
    return "Review of a candidate pair — read the explanation; result may be overlap, refinement, or contradiction.";
  }
  if (issueType.startsWith("hierarchy.")) {
    return "Parent vs child document check — see explanation (refinement, relaxation, missing trace, etc.).";
  }
  return null;
}

function ComparisonScopeBanner(props: {
  blockId: string;
  childDocName: string;
  parentDocName: string;
}) {
  const { blockId, childDocName, parentDocName } = props;
  const cross = blockId === HIER_BLOCK;

  if (cross) {
    return (
      <div className="lv-comparison-scope lv-comparison-scope-cross" role="status">
        <strong className="lv-comparison-scope-title">Cross-document comparison</strong>
        <p className="lv-comparison-scope-detail">
          Requirements below come from <strong>two different documents</strong>: the child (analyzed) file{" "}
          <code className="lv-doc-name">{childDocName}</code> and the parent file{" "}
          <code className="lv-doc-name">{parentDocName}</code>.
        </p>
      </div>
    );
  }

  if (blockId === INTRA_BLOCK) {
    return (
      <div className="lv-comparison-scope lv-comparison-scope-same" role="status">
        <strong className="lv-comparison-scope-title">Same-document comparison</strong>
        <p className="lv-comparison-scope-detail">
          Every requirement here is from one file: <code className="lv-doc-name">{childDocName}</code>. This is the
          intra-spec contradiction pass (not parent vs child).
        </p>
      </div>
    );
  }

  return (
    <div className="lv-comparison-scope lv-comparison-scope-same" role="status">
      <strong className="lv-comparison-scope-title">Same-document comparison</strong>
      <p className="lv-comparison-scope-detail">
        All requirements here are from <code className="lv-doc-name">{childDocName}</code> (set-level cross-requirement
        checks: duplicates, thresholds, overlap, etc.).
      </p>
    </div>
  );
}

/** Same-document / generic: ids refer to the analyzed (child) document first. */
function lookupRequirement(
  id: string,
  parents: CanonicalRequirement[] | undefined,
  childRows: PerRequirementResult[]
): CanonicalRequirement | undefined {
  const c = childRows.find((r) => r.requirement.id === id)?.requirement;
  if (c) return c;
  return parents?.find((r) => r.id === id);
}

function lookupParentRequirement(
  id: string,
  parentById: Map<string, CanonicalRequirement>,
  parentReqs: CanonicalRequirement[] | undefined
): CanonicalRequirement | undefined {
  return parentById.get(id) ?? parentReqs?.find((r) => r.id === id);
}

function lookupChildRequirement(id: string, childRows: PerRequirementResult[]): CanonicalRequirement | undefined {
  return childRows.find((r) => r.requirement.id === id)?.requirement;
}

function describeSetFinding(f: StructuredFinding): string {
  return f.explanation || f.issue_type || f.block_id;
}

/** Resolve parent vs child ids for hierarchy findings (finding shape varies by issue_type). */
function hierarchyIds(f: StructuredFinding): { parentId?: string; childId?: string } {
  if (f.issue_type === "hierarchy.missing_child_allocation") {
    return { parentId: f.requirement_id };
  }
  if (f.issue_type === "hierarchy.orphan_child_requirement") {
    return { childId: f.requirement_id };
  }
  const rel = f.related_requirement_ids?.[0];
  return { childId: f.requirement_id, parentId: rel };
}

function RequirementSnippet(props: {
  label: string;
  id: string;
  text: string | undefined;
  missing?: boolean;
  documentHint?: string;
}) {
  const { label, id, text, missing, documentHint } = props;
  return (
    <div className="lv-req-snippet">
      <div className="lv-req-snippet-head">
        <span className="lv-req-snippet-label">{label}</span>
        <code className="lv-req-snippet-id">{id}</code>
      </div>
      {documentHint ? <p className="lv-req-snippet-doc-hint">{documentHint}</p> : null}
      {missing || !text ? (
        <p className="lv-req-snippet-missing">No matching requirement text in this analysis payload.</p>
      ) : (
        <div className="lv-req-snippet-scroll" tabIndex={0}>
          <p className="lv-req-snippet-text">{text}</p>
        </div>
      )}
    </div>
  );
}

export function SetLevelFindings() {
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const parentReqs = analysisResult?.parent_requirements;
  const childRows = analysisResult?.requirements ?? [];
  const [severityFilter, setSeverityFilter] = useState<"all" | StructuredFinding["severity"]>("all");

  const parentById = useMemo(
    () => new Map((parentReqs ?? []).map((r) => [r.id, r])),
    [parentReqs]
  );

  if (!analysisResult || analysisResult.set_level_findings.length === 0) return null;

  const list = analysisResult.set_level_findings;
  const visibleList = useMemo(
    () => list.filter((f) => passesSetLevelSeverityFilter(f, severityFilter)),
    [list, severityFilter]
  );
  const cx = analysisResult.meta.contradiction;
  const meta = analysisResult.meta;
  const childDocName = childDocumentLabel(meta);
  const parentDocName = parentDocumentLabel(meta);

  return (
    <section className="lv-panel">
      <h2 className="lv-h2">Set-level and cross-checking</h2>
      <p className="lv-muted">
        Set-level checks include duplicates, numeric hints, <strong>topic overlap</strong>, and optional contradiction
        passes — two requirements shown together are <strong>not always opposite or wrong</strong>; read the issue type
        and explanation. Document names show which file each row came from.
      </p>
      <p className="lv-muted lv-doc-global">
        <strong>Child (analyzed) document:</strong> <code className="lv-doc-name">{childDocName}</code>
        {meta.parent_source_document || cx?.hierarchy_enabled ? (
          <>
            {" "}
            · <strong>Parent document:</strong> <code className="lv-doc-name">{parentDocName}</code>
          </>
        ) : null}
      </p>
      {cx?.parent_extraction_failed && (
        <p className="error lv-banner-warn">
          A parent file was uploaded but no text could be extracted from it, so parent–child analysis was skipped. Try
          .txt, or export the parent spec as text from your tool.
        </p>
      )}
      {cx?.hierarchy_enabled && parentReqs && parentReqs.length > 0 && (
        <p className="lv-muted lv-hierarchy-meta">
          Parent–child pass ran on <code className="lv-doc-name">{parentDocName}</code> vs{" "}
          <code className="lv-doc-name">{childDocName}</code>: {parentReqs.length} parent requirement(s),{" "}
          {cx.hierarchy_pairs_examined} pair(s) examined.
        </p>
      )}
      <div className="lv-contradiction-severity-filter">
        <label className="lv-field lv-contradiction-severity-field">
          Finding severity
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as "all" | StructuredFinding["severity"])}
            aria-label="Filter set-level and contradiction findings by severity"
          >
            <option value="all">All severities</option>
            <option value="low">Low only</option>
            <option value="medium">Medium only</option>
            <option value="high">High only</option>
          </select>
        </label>
        <p className="lv-muted lv-contradiction-severity-hint">
          Hides rows whose severity does not match (cross-requirement, intra-doc, and parent–child findings all use the
          same low / medium / high scale).
        </p>
        {severityFilter !== "all" ? (
          <p className="lv-muted lv-contradiction-severity-count">
            Showing {visibleList.length} of {list.length} finding(s) with severity &quot;{severityFilter}&quot;.
          </p>
        ) : null}
      </div>
      {severityFilter !== "all" && visibleList.length === 0 && list.length > 0 ? (
        <p className="lv-muted">No findings at this severity. Choose &quot;All severities&quot; to see the full list.</p>
      ) : null}
      <ul className="lv-setlevel-list">
        {visibleList.map((f) => {
          const intentHint = findingIntentHint(f.issue_type);
          return (
          <li key={f.finding_id} className={`lv-setlevel-item ${findingSeverityClass(f.severity)}`}>
            <div className="lv-setlevel-head">
              <span className={findingSeverityClass(f.severity)}>{f.severity}</span>
              <span className="lv-finding-attr">{f.attribute}</span>
              <span className="lv-finding-block">{f.block_id}</span>
              <span className="lv-finding-issue">{f.issue_type}</span>
            </div>
            <p className="lv-setlevel-explain">{describeSetFinding(f)}</p>
            {intentHint ? <p className="lv-finding-intent-hint">{intentHint}</p> : null}
            <ComparisonScopeBanner
              blockId={f.block_id}
              childDocName={childDocName}
              parentDocName={parentDocName}
            />
            {f.block_id === HIER_BLOCK ? (
              <HierarchyFindingBody
                f={f}
                parentById={parentById}
                childRows={childRows}
                parentReqs={parentReqs}
                childDocName={childDocName}
                parentDocName={parentDocName}
              />
            ) : (
              <GenericRelatedBody
                f={f}
                parentReqs={parentReqs}
                childRows={childRows}
                childDocName={childDocName}
              />
            )}
            {f.evidence_span && (
              <details className="lv-evidence-details">
                <summary className="lv-evidence-summary">
                  <span className="lv-evidence-summary-label">Evidence</span>
                  <span className="lv-evidence-chevron" aria-hidden />
                </summary>
                <div className="lv-evidence-scroll">
                  <p className="lv-evidence">{f.evidence_span}</p>
                </div>
              </details>
            )}
          </li>
          );
        })}
      </ul>
    </section>
  );
}

function HierarchyFindingBody(props: {
  f: StructuredFinding;
  parentById: Map<string, CanonicalRequirement>;
  childRows: PerRequirementResult[];
  parentReqs: CanonicalRequirement[] | undefined;
  childDocName: string;
  parentDocName: string;
}) {
  const { f, parentById, childRows, parentReqs, childDocName, parentDocName } = props;
  const { parentId, childId } = hierarchyIds(f);

  // Parent vs child must resolve in their own document only — shared IDs across specs would otherwise
  // always hit the parent list first and hide the real child row.
  const parentReq =
    parentId !== undefined && parentId.length > 0
      ? lookupParentRequirement(parentId, parentById, parentReqs)
      : undefined;
  const childReq =
    childId !== undefined && childId.length > 0 ? lookupChildRequirement(childId, childRows) : undefined;

  const showChildPlaceholderMissingAllocation =
    f.issue_type === "hierarchy.missing_child_allocation" && parentId && !childId;
  const showParentPlaceholderOrphan =
    f.issue_type === "hierarchy.orphan_child_requirement" && childId && !parentId;

  const childSnippetText =
    showChildPlaceholderMissingAllocation && !childReq
      ? "No child requirement in the analyzed document was linked to this parent row for this finding."
      : childReq?.source_text ?? childReq?.normalized_text;
  const parentSnippetText =
    showParentPlaceholderOrphan && !parentReq
      ? "No parent requirement in the parent document was linked to this child row for this finding."
      : parentReq?.source_text ?? parentReq?.normalized_text;

  return (
    <div className="lv-req-pair-grid">
      {(childId || showChildPlaceholderMissingAllocation) && (
        <RequirementSnippet
          label="Child requirement"
          id={childId ?? "—"}
          text={childSnippetText}
          missing={Boolean(childId) && !childReq && !showChildPlaceholderMissingAllocation}
          documentHint={
            showChildPlaceholderMissingAllocation
              ? `No requirement in "${childDocName}" was traced or similarity-matched to this parent row (see explanation above).`
              : `Source: child document "${childDocName}" (same as the main requirements table).`
          }
        />
      )}
      {(parentId || showParentPlaceholderOrphan) && (
        <RequirementSnippet
          label="Parent requirement"
          id={parentId ?? "—"}
          text={parentSnippetText}
          missing={Boolean(parentId) && !parentReq && !showParentPlaceholderOrphan}
          documentHint={
            showParentPlaceholderOrphan
              ? `No requirement in "${parentDocName}" was linked or matched to this child row (see explanation above).`
              : `Source: parent document "${parentDocName}".`
          }
        />
      )}
    </div>
  );
}

function GenericRelatedBody(props: {
  f: StructuredFinding;
  parentReqs: CanonicalRequirement[] | undefined;
  childRows: PerRequirementResult[];
  childDocName: string;
}) {
  const { f, parentReqs, childRows, childDocName } = props;
  const primary = lookupRequirement(f.requirement_id, parentReqs, childRows);
  const related = f.related_requirement_ids ?? [];
  const sameDocHint = `Source: "${childDocName}" — same document for all requirements in the main table.`;

  return (
    <>
      <div className="lv-req-pair-grid">
        <RequirementSnippet
          label="Requirement (first in this pair)"
          id={f.requirement_id}
          text={primary?.source_text ?? primary?.normalized_text}
          missing={!primary}
          documentHint={sameDocHint}
        />
        {related.map((rid) => {
          const r = lookupRequirement(rid, parentReqs, childRows);
          return (
            <RequirementSnippet
              key={rid}
              label="Paired requirement"
              id={rid}
              text={r?.source_text ?? r?.normalized_text}
              missing={!r}
              documentHint={sameDocHint}
            />
          );
        })}
      </div>
      {related.length === 0 && !primary && (
        <p className="lv-related-ids">
          <strong>Requirement ID:</strong> <code>{f.requirement_id}</code>
        </p>
      )}
    </>
  );
}
