import { useMemo, useState } from "react";
import type { StructuredFinding } from "../types/layeredTypes";
import { useAnalysisStore } from "../store/useAnalysisStore";

type Props = {
  requirementId: string;
  findings: StructuredFinding[];
};

export function RewritePanel({ requirementId, findings }: Props) {
  const [copied, setCopied] = useState(false);
  const acceptedText = useAnalysisStore((s) => s.acceptedRewrites[requirementId]);
  const clearAcceptedRewrite = useAnalysisStore((s) => s.clearAcceptedRewrite);

  const primary = useMemo(() => {
    const fromFinding = findings.find((f) => f.suggested_rewrite?.trim());
    return fromFinding?.suggested_rewrite?.trim() ?? "";
  }, [findings]);

  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!primary) {
    return (
      <div className="lv-subpanel">
        <h3 className="lv-h3">Suggested rewrite</h3>
        <p className="lv-muted">No rule-based rewrite suggestion for this requirement.</p>
      </div>
    );
  }

  return (
    <div className="lv-subpanel">
      <h3 className="lv-h3">Suggested rewrite</h3>
      <p className="lv-muted">
        Suggestions come from deterministic rule blocks. Accepted text is applied when you use{" "}
        <strong>Download revised source</strong> on Requirement Review.
      </p>
      {acceptedText != null && acceptedText !== "" && (
        <div className="lv-accepted-banner">
          <strong>Accepted for export</strong>
          <p className="lv-accepted-snippet">
            {acceptedText.length > 200 ? `${acceptedText.slice(0, 200)}…` : acceptedText}
          </p>
          <button type="button" className="secondary-btn small" onClick={() => clearAcceptedRewrite(requirementId)}>
            Clear acceptance
          </button>
        </div>
      )}
      <div className="lv-rewrite-primary">
        <div className="lv-rewrite-label">Primary suggestion</div>
        <blockquote className="lv-rewrite-quote">{primary}</blockquote>
        <div className="lv-rewrite-actions">
          <button type="button" className="secondary-btn" onClick={() => void copy(primary)}>
            Copy rewrite
          </button>
          {copied && <span className="lv-copied">Copied</span>}
        </div>
      </div>
    </div>
  );
}
