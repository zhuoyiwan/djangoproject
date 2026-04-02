import { useState } from "react";
import { useAuth } from "../app/auth";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { getServers } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { ServerQuery, ServerRecord } from "../types";

const initialQuery: ServerQuery = {
  search: "",
  ordering: "-updated_at",
  page: "1",
  page_size: "20",
  environment: "",
  lifecycle_status: "",
  source: "",
};

export function ServersPage() {
  const { accessToken, baseUrl } = useAuth();
  const [query, setQuery] = useState<ServerQuery>(initialQuery);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const {
    page: serverPage,
    state: serverState,
    summary: serverSummary,
    refresh: refreshServers,
  } = usePaginatedResource<ServerRecord, ServerQuery>({
    accessToken,
    query,
    initialSummary: "Load the current CMDB dataset from the backend.",
    missingTokenSummary: "Login is required before querying CMDB servers.",
    loadingSummary: "Querying live CMDB data ...",
    successSummary: (response) => `Fetched ${response.results.length} server rows out of ${response.count}.`,
    fetcher: (token, activeQuery) => getServers(baseUrl, token, activeQuery),
  });

  function updateQuery<K extends keyof ServerQuery>(key: K, value: ServerQuery[K]) {
    setQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const selectedServer =
    serverPage?.results.find((server) => server.id === selectedServerId) || serverPage?.results[0] || null;

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>CMDB explorer</h2>
          <p>Use the documented filters to browse the live server inventory and inspect a selected row.</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>Search</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
          <label className="field">
            <span>Ordering</span>
            <input value={query.ordering || ""} onChange={(event) => updateQuery("ordering", event.target.value)} />
          </label>
          <label className="field">
            <span>Page</span>
            <input value={query.page || ""} onChange={(event) => updateQuery("page", event.target.value)} />
          </label>
          <label className="field">
            <span>Page size</span>
            <input value={query.page_size || ""} onChange={(event) => updateQuery("page_size", event.target.value)} />
          </label>
          <label className="field">
            <span>Environment</span>
            <select value={query.environment || ""} onChange={(event) => updateQuery("environment", event.target.value)}>
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
            <select value={query.source || ""} onChange={(event) => updateQuery("source", event.target.value)}>
              <option value="">Any</option>
              <option value="manual">manual</option>
              <option value="agent">agent</option>
              <option value="api">api</option>
            </select>
          </label>
        </div>

        <div className="actions">
          <button
            onClick={async () => {
              const response = await refreshServers();
              if (response) {
                setSelectedServerId(response.results[0]?.id ?? null);
              }
            }}
            type="button"
          >
            Refresh list
          </button>
        </div>

        <p className={`status ${serverState}`}>{serverSummary}</p>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Hostname</th>
                <th>Internal IP</th>
                <th>IDC</th>
                <th>OS</th>
                <th>Environment</th>
                <th>Lifecycle</th>
                <th>Source</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {serverPage?.results.length ? (
                serverPage.results.map((server) => (
                  <tr
                    className={server.id === selectedServer?.id ? "row-selected" : undefined}
                    key={server.id}
                    onClick={() => setSelectedServerId(server.id)}
                  >
                    <td>{server.hostname}</td>
                    <td>{server.internal_ip}</td>
                    <td>{server.idc_name || "n/a"}</td>
                    <td>{server.os_version}</td>
                    <td>{server.environment}</td>
                    <td>{server.lifecycle_status}</td>
                    <td>{server.source}</td>
                    <td>{formatDateTime(server.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No server data loaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>Selected server</h2>
          <p>Click a row to inspect the live serializer payload in a frontend-friendly form.</p>
        </div>

        {selectedServer ? (
          <>
            <dl className="profile-card detail-card">
              <div>
                <dt>Hostname</dt>
                <dd>{selectedServer.hostname}</dd>
              </div>
              <div>
                <dt>IDC</dt>
                <dd>{selectedServer.idc_name}</dd>
              </div>
              <div>
                <dt>Internal IP</dt>
                <dd>{selectedServer.internal_ip}</dd>
              </div>
              <div>
                <dt>External IP</dt>
                <dd>{selectedServer.external_ip || "n/a"}</dd>
              </div>
              <div>
                <dt>CPU</dt>
                <dd>{selectedServer.cpu_cores} cores</dd>
              </div>
              <div>
                <dt>Memory</dt>
                <dd>{selectedServer.memory_gb} GB</dd>
              </div>
              <div>
                <dt>Last seen</dt>
                <dd>{formatDateTime(selectedServer.last_seen_at)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(selectedServer.updated_at)}</dd>
              </div>
            </dl>

            <article className="highlight-card compact-card">
              <h3>Disk summary</h3>
              <p>{selectedServer.disk_summary || "No disk summary provided."}</p>
            </article>

            <article className="highlight-card compact-card">
              <h3>Metadata</h3>
              <pre className="json-block">{JSON.stringify(selectedServer.metadata, null, 2)}</pre>
            </article>
          </>
        ) : (
          <p className="status idle">Select a server row after loading the list.</p>
        )}
      </section>
    </main>
  );
}
