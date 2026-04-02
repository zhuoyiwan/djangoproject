import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";

export function AppLayout() {
  const { accessToken, authSummary, baseUrl, profile, refreshProfile, setBaseUrl, signOut } = useAuth();

  return (
    <div className="app-shell">
      <header className="workspace-header">
        <div className="workspace-brand">
          <p className="eyebrow">ChatOps CMDB frontend</p>
          <h1>Operator workspace</h1>
          <p className="hero-copy">
            A routed frontend shell for health checks, authenticated CMDB browsing, and API
            contract collaboration against the live Django backend.
          </p>
        </div>

        <div className="workspace-status">
          <div className="hero-card">
            <span>Backend target</span>
            <label className="inline-field">
              <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
            </label>
            <small>{authSummary}</small>
          </div>
          <div className="hero-card">
            <span>Active identity</span>
            <strong>{profile?.display_name || profile?.username || "Guest mode"}</strong>
            <small>{profile?.email || (accessToken ? "Token loaded" : "No token loaded")}</small>
          </div>
        </div>
      </header>

      <nav className="workspace-nav">
        <NavLink to="/overview" className={({ isActive }) => navClassName(isActive)}>
          Overview
        </NavLink>
        <NavLink to="/servers" className={({ isActive }) => navClassName(isActive)}>
          CMDB
        </NavLink>
        <NavLink to="/automation" className={({ isActive }) => navClassName(isActive)}>
          Automation
        </NavLink>
        <NavLink to="/audit" className={({ isActive }) => navClassName(isActive)}>
          Audit
        </NavLink>
        <NavLink to="/contract" className={({ isActive }) => navClassName(isActive)}>
          Contract
        </NavLink>
        {!accessToken ? (
          <NavLink to="/login" className={({ isActive }) => navClassName(isActive)}>
            Login
          </NavLink>
        ) : null}
        <div className="nav-spacer" />
        {accessToken ? (
          <>
            <button className="button-ghost" onClick={() => void refreshProfile()} type="button">
              Refresh profile
            </button>
            <button className="button-ghost" onClick={signOut} type="button">
              Sign out
            </button>
          </>
        ) : null}
      </nav>

      <Outlet />
    </div>
  );
}

function navClassName(isActive: boolean) {
  return isActive ? "nav-link active" : "nav-link";
}
