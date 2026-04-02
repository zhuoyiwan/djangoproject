import { FormEvent, useEffect, useState } from "react";
import { contractHighlights, endpointGroups } from "./contract";
import { getCurrentUser, getHealth, getServers, login } from "./lib/api";
import type { PaginatedResponse, ServerQuery, ServerRecord, UserProfile } from "./types";

const STORAGE_KEY = "chatops-cmdb-access-token";
const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const initialQuery: ServerQuery = {
  search: "",
  ordering: "-updated_at",
  page: "1",
  page_size: "20",
  environment: "",
  lifecycle_status: "",
  source: "",
};

type RequestState = "idle" | "loading" | "success" | "error";

export default function App() {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [healthState, setHealthState] = useState<RequestState>("idle");
  const [healthSummary, setHealthSummary] = useState("Not checked yet.");
  const [authState, setAuthState] = useState<RequestState>("idle");
  const [authSummary, setAuthSummary] = useState("No active token loaded.");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [serverState, setServerState] = useState<RequestState>("idle");
  const [serverSummary, setServerSummary] = useState("Server query has not been run.");
  const [query, setQuery] = useState<ServerQuery>(initialQuery);
  const [serverPage, setServerPage] = useState<PaginatedResponse<ServerRecord> | null>(null);

  useEffect(() => {
    const savedToken = window.localStorage.getItem(STORAGE_KEY);
    if (savedToken) {
      setAccessToken(savedToken);
      setAuthSummary("Loaded access token from local storage.");
    }
  }, []);

  async function handleHealthCheck() {
    setHealthState("loading");
    setHealthSummary("Requesting /api/v1/health/ ...");
    try {
      const response = await getHealth(baseUrl);
      setHealthState("success");
      setHealthSummary(`Healthy response keys: ${Object.keys(response).join(", ") || "empty body"}.`);
    } catch (error) {
      setHealthState("error");
      setHealthSummary((error as Error).message);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthState("loading");
    setAuthSummary("Authenticating against documented JWT login endpoint ...");
    try {
      const tokens = await login(baseUrl, username, password);
      window.localStorage.setItem(STORAGE_KEY, tokens.access);
      setAccessToken(tokens.access);
      setAuthState("success");
      setAuthSummary("Login succeeded. Access token cached locally for follow-up API calls.");
      setPassword("");
    } catch (error) {
      setAuthState("error");
      setAuthSummary((error as Error).message);
    }
  }

  async function handleLoadProfile() {
    if (!accessToken) {
      setAuthState("error");
      setAuthSummary("Access token is required before calling /api/v1/auth/me/.");
      return;
    }
    setAuthState("loading");
    setAuthSummary("Loading current user profile ...");
    try {
      const response = await getCurrentUser(baseUrl, accessToken);
      setProfile(response);
      setAuthState("success");
      setAuthSummary(`Authenticated as ${response.username}.`);
    } catch (error) {
      setAuthState("error");
      setAuthSummary((error as Error).message);
    }
  }

  async function handleLoadServers() {
    if (!accessToken) {
      setServerState("error");
      setServerSummary("Login or paste an access token before querying CMDB servers.");
      return;
    }
    setServerState("loading");
    setServerSummary("Querying /api/v1/cmdb/servers/ with contract-aligned filters ...");
    try {
      const response = await getServers(baseUrl, accessToken, query);
      setServerPage(response);
      setServerState("success");
      setServerSummary(`Fetched ${response.results.length} servers out of ${response.count}.`);
    } catch (error) {
      setServerState("error");
      setServerSummary((error as Error).message);
    }
  }

  function updateQuery<K extends keyof ServerQuery>(key: K, value: ServerQuery[K]) {
    setQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleTokenPaste(value: string) {
    setAccessToken(value);
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, value);
      setAuthSummary("Access token updated locally.");
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
      setAuthSummary("Access token cleared.");
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Contract-first frontend bootstrap</p>
          <h1>ChatOps CMDB frontend is now aligned to the live backend contract.</h1>
          <p className="hero-copy">
            This workspace starts from the documented API surface, keeps JWT auth explicit,
            and gives the frontend teammate a clean place to verify health, auth, and CMDB data
            against the current backend.
          </p>
        </div>
        <div className="hero-card">
          <span>Current backend source of truth</span>
          <strong>docs/api/openapi.yaml</strong>
          <small>Filters, auth headers, and error envelopes mirror the backend docs.</small>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel panel-contract">
          <div className="panel-heading">
            <h2>Contract anchors</h2>
            <p>Derived from docs/api/conventions.md and docs/api/endpoints.md.</p>
          </div>
          <div className="highlight-grid">
            {contractHighlights.map((item) => (
              <article className="highlight-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
          <div className="endpoint-grid">
            {endpointGroups.map((group) => (
              <article className="endpoint-card" key={group.label}>
                <h3>{group.label}</h3>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Connection</h2>
            <p>Configure the backend base URL and probe the health endpoint.</p>
          </div>
          <label className="field">
            <span>API base URL</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </label>
          <div className="actions">
            <button onClick={handleHealthCheck} type="button">
              Check health
            </button>
          </div>
          <p className={`status ${healthState}`}>{healthSummary}</p>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Auth workspace</h2>
            <p>Use the documented JWT login flow or paste a token captured elsewhere.</p>
          </div>
          <form className="form-grid" onSubmit={handleLogin}>
            <label className="field">
              <span>Username</span>
              <input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
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
            <button type="submit">Login</button>
          </form>

          <label className="field">
            <span>Access token</span>
            <textarea
              rows={4}
              value={accessToken}
              onChange={(event) => handleTokenPaste(event.target.value)}
            />
          </label>

          <div className="actions">
            <button onClick={handleLoadProfile} type="button">
              Load current user
            </button>
            <button onClick={() => handleTokenPaste("")} type="button" className="button-ghost">
              Clear token
            </button>
          </div>

          <p className={`status ${authState}`}>{authSummary}</p>
          {profile ? (
            <dl className="profile-card">
              <div>
                <dt>ID</dt>
                <dd>{profile.id}</dd>
              </div>
              <div>
                <dt>Username</dt>
                <dd>{profile.username}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>{profile.email || "Not set"}</dd>
              </div>
              <div>
                <dt>Staff</dt>
                <dd>{profile.is_staff ? "yes" : "no"}</dd>
              </div>
            </dl>
          ) : null}
        </section>

        <section className="panel panel-wide">
          <div className="panel-heading">
            <h2>CMDB server explorer</h2>
            <p>Filters map to the documented query contract for /api/v1/cmdb/servers/.</p>
          </div>

          <div className="filter-grid">
            <label className="field">
              <span>Search</span>
              <input
                value={query.search || ""}
                onChange={(event) => updateQuery("search", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Ordering</span>
              <input
                value={query.ordering || ""}
                onChange={(event) => updateQuery("ordering", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Page</span>
              <input
                value={query.page || ""}
                onChange={(event) => updateQuery("page", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Page size</span>
              <input
                value={query.page_size || ""}
                onChange={(event) => updateQuery("page_size", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Environment</span>
              <select
                value={query.environment || ""}
                onChange={(event) => updateQuery("environment", event.target.value)}
              >
                <option value="">Any</option>
                <option value="dev">dev</option>
                <option value="test">test</option>
                <option value="prod">prod</option>
              </select>
            </label>
            <label className="field">
              <span>Lifecycle</span>
              <select
                value={query.lifecycle_status || ""}
                onChange={(event) => updateQuery("lifecycle_status", event.target.value)}
              >
                <option value="">Any</option>
                <option value="online">online</option>
                <option value="offline">offline</option>
                <option value="maintenance">maintenance</option>
                <option value="pre_allocated">pre_allocated</option>
              </select>
            </label>
            <label className="field">
              <span>Source</span>
              <select
                value={query.source || ""}
                onChange={(event) => updateQuery("source", event.target.value)}
              >
                <option value="">Any</option>
                <option value="manual">manual</option>
                <option value="agent">agent</option>
                <option value="api">api</option>
              </select>
            </label>
          </div>

          <div className="actions">
            <button onClick={handleLoadServers} type="button">
              Query servers
            </button>
          </div>

          <p className={`status ${serverState}`}>{serverSummary}</p>

          <div className="table-shell">
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Internal IP</th>
                  <th>Environment</th>
                  <th>Lifecycle</th>
                  <th>Source</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {serverPage?.results.length ? (
                  serverPage.results.map((server) => (
                    <tr key={server.id}>
                      <td>{server.hostname}</td>
                      <td>{server.internal_ip}</td>
                      <td>{server.environment}</td>
                      <td>{server.lifecycle_status}</td>
                      <td>{server.source}</td>
                      <td>{server.updated_at || "n/a"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6}>No server data loaded yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
