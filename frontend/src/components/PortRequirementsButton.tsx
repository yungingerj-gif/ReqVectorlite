import { useNavigate } from "react-router-dom";
import { useAnalysisStore } from "../store/useAnalysisStore";

type Props = {
  /** After a successful port, open the traceability matrix. */
  goToMatrix?: boolean;
};

export function PortRequirementsButton({ goToMatrix = false }: Props) {
  const navigate = useNavigate();
  const analysisResult = useAnalysisStore((s) => s.analysisResult);
  const loading = useAnalysisStore((s) => s.loading);
  const traceabilityRows = useAnalysisStore((s) => s.traceabilityRows);
  const portRequirementsToTraceability = useAnalysisStore((s) => s.portRequirementsToTraceability);

  return (
    <button
      type="button"
      className="primary"
      disabled={!analysisResult || loading}
      onClick={() => {
        portRequirementsToTraceability();
        if (goToMatrix) navigate("/traceability");
      }}
    >
      {traceabilityRows ? "Port requirements again" : "Port requirements to traceability matrix"}
    </button>
  );
}
