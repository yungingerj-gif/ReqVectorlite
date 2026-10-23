import { useEffect, useState } from "react";
import { useAnalysisStore } from "../store/useAnalysisStore";
import { suggestionFeedbackCompositeKey } from "../types/suggestionFeedback";

type Props = {
  requirementId: string;
  /** Stable id for this suggestion surface, e.g. rewrite-primary, finding-abc */
  sourceKey: string;
  originalSuggestion: string;
  /** Smaller buttons / spacing for nested finding rows */
  compact?: boolean;
};

export function SuggestionFeedbackBar({
  requirementId,
  sourceKey,
  originalSuggestion,
  compact,
}: Props) {
  const feedbackRunId = useAnalysisStore((s) => s.feedbackRunId);
  const suggestionFeedbackByKey = useAnalysisStore((s) => s.suggestionFeedbackByKey);
  const recordSuggestionFeedback = useAnalysisStore((s) => s.recordSuggestionFeedback);
  const acceptRewrite = useAnalysisStore((s) => s.acceptRewrite);
  const clearAcceptedRewrite = useAnalysisStore((s) => s.clearAcceptedRewrite);
  const acceptedRewrites = useAnalysisStore((s) => s.acceptedRewrites);

  const origTrim = originalSuggestion.trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(origTrim);

  useEffect(() => {
    setDraft(origTrim);
    setEditing(false);
  }, [origTrim]);

  if (!origTrim) return null;

  const key = feedbackRunId
    ? suggestionFeedbackCompositeKey(feedbackRunId, requirementId, sourceKey)
    : "";
  const entry = key ? suggestionFeedbackByKey[key] : undefined;

  const record = (verdict: "accepted" | "rejected" | "edited", finalText?: string) => {
    if (!feedbackRunId) return;
    recordSuggestionFeedback({
      runId: feedbackRunId,
      requirementId,
      sourceKey,
      verdict,
      originalSuggestion: origTrim,
      finalText,
    });
  };

  const handleAcceptOriginal = () => {
    if (!feedbackRunId) return;
    record("accepted", origTrim);
    acceptRewrite(requirementId, origTrim);
  };

  const handleReject = () => {
    if (!feedbackRunId) return;
    record("rejected");
    const acc = acceptedRewrites[requirementId]?.trim();
    if (acc === origTrim) clearAcceptedRewrite(requirementId);
  };

  const handleApplyEdit = () => {
    if (!feedbackRunId) return;
    const ft = draft.trim();
    if (!ft) return;
    record("edited", ft);
    acceptRewrite(requirementId, ft);
    setEditing(false);
  };

  const btnClass = compact ? "secondary-btn small" : "secondary-btn";

  return (
    <div className={`lv-suggestion-feedback${compact ? " lv-suggestion-feedback-compact" : ""}`}>
      <div className="lv-suggestion-feedback-label">Reviewer feedback</div>
      <div className="lv-suggestion-feedback-actions">
        <button
          type="button"
          className={btnClass}
          disabled={!feedbackRunId || editing}
          onClick={handleAcceptOriginal}
          title="Record acceptance and use this text for revised-source export"
        >
          Accept suggestion
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={!feedbackRunId || editing}
          onClick={handleReject}
          title="Record rejection (clears export if it matched this suggestion)"
        >
          Reject suggestion
        </button>
        <button
          type="button"
          className={btnClass}
          disabled={!feedbackRunId}
          onClick={() => {
            if (editing) {
              setDraft(origTrim);
              setEditing(false);
            } else {
              setDraft(acceptedRewrites[requirementId]?.trim() || origTrim);
              setEditing(true);
            }
          }}
        >
          {editing ? "Cancel edit" : "Edit suggestion"}
        </button>
      </div>
      {editing && (
        <div className="lv-suggestion-feedback-edit">
          <label className="lv-field">
            Edited text (for export when applied)
            <textarea
              className="lv-textarea"
              rows={compact ? 3 : 5}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck
            />
          </label>
          <button
            type="button"
            className="primary small"
            disabled={!draft.trim()}
            onClick={handleApplyEdit}
          >
            Apply edited suggestion for export
          </button>
        </div>
      )}
      {entry && (
        <>
          <p className="lv-suggestion-feedback-status" role="status">
            Logged: <strong>{entry.verdict}</strong>
            {entry.final_text && entry.verdict !== "rejected" ? (
              <>
                {" "}
                · final text {entry.final_text.length > 80 ? `${entry.final_text.slice(0, 80)}…` : entry.final_text}
              </>
            ) : null}
          </p>
        </>
      )}
      {!feedbackRunId && (
        <p className="lv-suggestion-feedback-warn">Run analysis to enable feedback capture.</p>
      )}
    </div>
  );
}
