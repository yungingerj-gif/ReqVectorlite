import { useMemo, useState } from "react";
import { checkRewriteAdvances } from "../api/layeredApi";
import type { StructuredFinding } from "../types/layeredTypes";
import { useAnalysisStore } from "../store/useAnalysisStore";

type Props = {
  requirementId: string;
  findings: StructuredFinding[];
};

export function RewritePanel({ requirementId, findings }: Props) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [gateNote, setGateNote] = useState<string | null>(null);
  const acceptedText = useAnalysisStore((s) => s.acceptedRewrites[requirementId]);
  const clearAcceptedRewrite = useAnalysisStore((s) => s.clearAcceptedRewrite);
  const acceptRewrite = useAnalysisStore((s) => s.acceptRewrite);
  const analysisResult = useAnalysisStore((s) => s.analysisResult);

  const primary = useMemo(() => {
    const fromFinding = findings.find((f) => f.suggested_rewrite?.trim());
    return fromFinding?.suggested_rewrite?.trim() ?? "";
  }, [findings]);

  const accept = async () => {
    const current =
      analysisResult?.requirements.find((row) => row.requirement.id === requirementId)?.requirement.source_text ??
      "";
    if (!current.trim()) {
      setGateNote("Run analysis before accepting a rewrite.");
      return;
    }
    const peerTexts = (analysisResult?.requirements ?? [])
      .filter((row) => row.requirement.id !== requirementId)
      .map((row) => row.requirement.source_text);
    setChecking(true);
    setGateNote(null);
    try {
      const check = await checkRewriteAdvances({ currentText: current, candidateText: primary, peerTexts });
      if (!check.advances) {
        setGateNote(check.reason);
        return;
      }
      acceptRewrite(requirementId, primary);
    } catch (error) {
      setGateNote(error instanceof Error ? error.message : "Could not check the rewrite.");
    } finally {
      setChecking(false);
    }
  };

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
        A suggestion is kept only when it passes a later gate and every gate that was already 2 stays 2.
        Accepted text is applied when you use <strong>Download revised source</strong> on Requirement Review.
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
          <button type="button" className="primary small" disabled={checking} onClick={() => void accept()}>
            {checking ? "Checking gates…" : "Accept suggestion"}
          </button>
          <button type="button" className="secondary-btn" onClick={() => void copy(primary)}>
            Copy rewrite
          </button>
          {copied && <span className="lv-copied">Copied</span>}
        </div>
        {gateNote && (
          <p className="lv-suggestion-feedback-warn" role="status">
            {gateNote}
          </p>
        )}
      </div>
    </div>
  );
}
