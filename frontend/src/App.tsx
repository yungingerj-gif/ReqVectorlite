import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/AppLayout";
import { ConfigPage } from "./pages/Config";
import { DashboardPage } from "./pages/Dashboard";
import { ReportsPage } from "./pages/Reports";
import { ReviewPage } from "./pages/Review";
import { TraceabilityPage } from "./pages/Traceability";
import { RequirementsTool } from "./ui/RequirementsTool";
import { DomainConstraintsPage } from "./pages/DomainConstraints";

export function App() {
  return (
    <div className="lv-app-root">
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/legacy" element={<Navigate to="/review" replace />} />
            <Route path="/traceability" element={<TraceabilityPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/ai-training" element={<Navigate to="/review" replace />} />
            <Route path="/domain-constraints" element={<DomainConstraintsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
          </Route>
          <Route
            path="/classic"
            element={
              <div className="app-root lv-classic-wrap">
                <RequirementsTool />
              </div>
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
