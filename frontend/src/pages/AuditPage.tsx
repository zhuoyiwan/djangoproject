import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { getAuditLog, getAuditLogs } from "../lib/api";
import type { AuditLogRecord, AuditQuery, PaginatedResponse, RequestState } from "../types";

const initialQuery: AuditQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "20",
};

export function AuditPage() {
  const { accessToken, baseUrl } = useAuth();
  const [query, setQuery] = useState<AuditQuery>(initialQuery);
  const [auditState, setAuditState] = useState<RequestState>("idle");
  const [auditSummary, setAuditSummary] = useState("Load audit logs to review write-side activity.");
  const [auditPage, setAuditPage] = useState<PaginatedResponse<AuditLogRecord> | null>(null);
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  useEffect(() => {
    if (!accessToken || auditPage) {
      return;
    }
    void handleLoadAuditLogs();
  }, [accessToken]);

  async function handleLoadAuditLogs() {
    if (!accessToken) {
      setAuditState("error");
      setAuditSummary("Login is required before querying audit logs.");
      return;
    }
    setAuditState("loading");
    setAuditSummary("Loading audit trail ...");
    try {
      const response = await getAuditLogs(baseUrl, accessToken, query);
      setAuditPage(response);
      const first = response.results[0] || null;
      setSelectedLog(first);
      if (first) {
        const detail = await getAuditLog(baseUrl, accessToken, first.id);
        setSelectedLog(detail);
      }
      setAuditState("success");
      setAuditSummary(`Fetched ${response.results.length} audit rows out of ${response.count}.`);
    } catch (error) {
      setAuditState("error");
      setAuditSummary((error as Error).message);
    }
  }

  async function handleSelectLog(logId: number) {
    if (!accessToken) {
      return;
    }
    setAuditState("loading");
    setAuditSummary(`Loading audit log ${logId} ...`);
    try {
      const response = await getAuditLog(baseUrl, accessToken, logId);
      setSelectedLog(response);
      setAuditState("success");
      setAuditSummary(`Loaded audit log ${response.id}.`);
    } catch (error) {
      setAuditState("error");
      setAuditSummary((error as Error).message);
    }
  }

  function updateQuery<K extends keyof AuditQuery>(key: K, value: AuditQuery[K]) {
    setQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>Audit trail</h2>
          <p>Review recent write-side activity and inspect normalized audit detail payloads.</p>
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
        </div>

        <div className="actions">
          <button onClick={() => void handleLoadAuditLogs()} type="button">
            Refresh audit logs
          </button>
        </div>

        <p className={`status ${auditState}`}>{auditSummary}</p>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Target</th>
                <th>Actor</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {auditPage?.results.length ? (
                auditPage.results.map((log) => (
                  <tr
                    className={log.id === selectedLog?.id ? "row-selected" : undefined}
                    key={log.id}
                    onClick={() => void handleSelectLog(log.id)}
                  >
                    <td>{log.action}</td>
                    <td>{log.target}</td>
                    <td>{log.actor_username || "system"}</td>
                    <td>{formatDateTime(log.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>No audit logs loaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>Selected audit log</h2>
          <p>Inspect the actor, target, and structured detail payload for a single entry.</p>
        </div>

        {selectedLog ? (
          <div className="stack-grid">
            <article className="summary-card">
              <span>Action</span>
              <strong>{selectedLog.action}</strong>
              <small>{selectedLog.target}</small>
            </article>
            <article className="summary-card">
              <span>Actor</span>
              <strong>{selectedLog.actor_username || "system"}</strong>
              <small>{formatDateTime(selectedLog.created_at)}</small>
            </article>
            <article className="highlight-card compact-card">
              <h3>Detail</h3>
              <pre className="json-block">{JSON.stringify(selectedLog.detail, null, 2)}</pre>
            </article>
          </div>
        ) : (
          <p className="status idle">Select an audit row after loading the list.</p>
        )}
      </section>
    </main>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
