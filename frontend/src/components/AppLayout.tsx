import { useRef } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAnalysisStore } from "../store/useAnalysisStore";

const nav = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/review", label: "Requirement Review" },
  { to: "/traceability", label: "Traceability Matrix" },
  { to: "/config", label: "Config Profiles" },
  { to: "/domain-constraints", label: "Domain constraints" },
  { to: "/reports", label: "Reports" },
];

export function AppLayout() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const profile = useAnalysisStore((s) => s.profile);
  const runUpload = useAnalysisStore((s) => s.runUpload);
  const loading = useAnalysisStore((s) => s.loading);
  const clearAnalysis = useAnalysisStore((s) => s.clearAnalysis);

  return (
    <div className="lv-shell">
      <aside className="lv-sidebar">
        <div className="lv-sidebar-brand">
          <span className="lv-brand-title">ReqVector</span>
          <span className="lv-brand-sub">Rules-only spec review</span>
        </div>
        <nav className="lv-nav">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `lv-nav-link ${isActive ? "active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/classic" className="lv-nav-link lv-nav-classic">
          Classic analyze (legacy UI)
        </NavLink>
      </aside>
      <div className="lv-main-col">
        <header className="lv-header">
          <div className="lv-header-actions">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.csv,.pdf,.docx,.xlsx,.xls"
              className="lv-file-input-hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void runUpload(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="secondary-btn"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
            >
              Import spec
            </button>
            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                clearAnalysis();
                navigate("/review");
              }}
            >
              New analysis
            </button>
            <label className="lv-header-profile">
              Profile
              <select value={profile} disabled>
                <option value="default_active_spec">default_active_spec</option>
              </select>
            </label>
          </div>
        </header>
        <main className="lv-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
