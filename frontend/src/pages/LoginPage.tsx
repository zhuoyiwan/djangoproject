import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../app/auth";

export function LoginPage() {
  const { accessToken, authState, authSummary, loginWithPassword, refreshProfile, setTokenManually } = useAuth();
  const [username, setUsername] = useState("frontenddemo");
  const [password, setPassword] = useState("FrontendDemo123!");
  const [tokenDraft, setTokenDraft] = useState(accessToken);
  const navigate = useNavigate();
  const location = useLocation();
  const nextPath = typeof location.state?.from === "string" ? location.state.from : "/overview";

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await loginWithPassword(username, password);
      navigate(nextPath, { replace: true });
    } catch {
      return;
    }
  }

  async function handleTokenValidation() {
    setTokenManually(tokenDraft);
    try {
      await refreshProfile(tokenDraft);
      navigate("/overview", { replace: true });
    } catch {
      return;
    }
  }

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-7">
        <div className="panel-heading">
          <h2>Authentication workspace</h2>
          <p>
            Sign in against the live backend or paste an existing access token. The default demo
            credentials match the local integration seed.
          </p>
        </div>

        <form className="form-grid" onSubmit={handleLogin}>
          <label className="field">
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button type="submit">Sign in</button>
        </form>

        <label className="field stacked-field">
          <span>Access token</span>
          <textarea
            rows={5}
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
          />
        </label>

        <div className="actions">
          <button type="button" onClick={() => void handleTokenValidation()}>
            Validate token
          </button>
          <button type="button" className="button-ghost" onClick={() => setTokenDraft("")}>
            Clear draft
          </button>
        </div>

        <p className={`status ${authState}`}>{authSummary}</p>
      </section>

      <section className="panel panel-span-5">
        <div className="panel-heading">
          <h2>Local demo path</h2>
          <p>The current repository already exposes a ready-to-test local integration account.</p>
        </div>

        <dl className="profile-card">
          <div>
            <dt>Username</dt>
            <dd>frontenddemo</dd>
          </div>
          <div>
            <dt>Password</dt>
            <dd>FrontendDemo123!</dd>
          </div>
          <div>
            <dt>Next route</dt>
            <dd>{nextPath}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}
