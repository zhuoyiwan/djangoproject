import { useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useResourceDetail } from "../hooks/useResourceDetail";
import { formatDateTime } from "../lib/format";
import { getAuditLog, getAuditLogs } from "../lib/api";
import type { AuditLogRecord, AuditQuery } from "../types";

const initialQuery: AuditQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "20",
};

export function AuditPage() {
  const { accessToken, baseUrl } = useAuth();
  const [query, setQuery] = useState<AuditQuery>(initialQuery);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const {
    page: auditPage,
    state: auditListState,
    summary: auditListSummary,
    refresh: refreshAuditLogs,
  } = usePaginatedResource<AuditLogRecord, AuditQuery>({
    accessToken,
    query,
    initialSummary: "读取操作记录列表。",
    missingTokenSummary: "请先登录后再查看操作记录。",
    loadingSummary: "正在加载操作记录...",
    successSummary: (response) => `已加载 ${response.results.length} 条记录，共 ${response.count} 条。`,
    fetcher: (token, activeQuery) => getAuditLogs(baseUrl, token, activeQuery),
  });
  const {
    item: selectedLog,
    state: auditDetailState,
    summary: auditDetailSummary,
  } = useResourceDetail<AuditLogRecord>({
    accessToken,
    resourceId: selectedLogId,
    initialSummary: "从列表中选择一条记录后查看详情。",
    missingTokenSummary: "请先登录后再查看记录详情。",
    loadingSummary: (id) => `正在加载记录 ${id}...`,
    successSummary: (response) => `已加载记录 ${response.id}。`,
    fetcher: (token, id) => getAuditLog(baseUrl, token, id),
  });

  function updateQuery<K extends keyof AuditQuery>(key: K, value: AuditQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8">
        <div className="panel-heading">
          <h2>操作记录</h2>
          <p>用最直接的方式查看近期系统动作，便于普通使用者回看发生过什么。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>关键词</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button
            onClick={async () => {
              const response = await refreshAuditLogs();
              if (response) {
                setSelectedLogId(response.results[0]?.id ?? null);
              }
            }}
            type="button"
          >
            刷新记录
          </button>
        </div>

        <p className={`status ${auditListState}`}>{auditListSummary}</p>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>动作</th>
                <th>对象</th>
                <th>执行人</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {auditPage?.results.length ? (
                auditPage.results.map((log) => (
                  <tr
                    className={log.id === selectedLog?.id ? "row-selected" : undefined}
                    key={log.id}
                    onClick={() => setSelectedLogId(log.id)}
                  >
                    <td>{log.action}</td>
                    <td>{log.target}</td>
                    <td>{log.actor_username || "system"}</td>
                    <td>{formatDateTime(log.created_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>当前没有加载到操作记录。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4">
        <div className="panel-heading">
          <h2>记录详情</h2>
          <p>保留动作、对象和附加信息，帮助理解这条记录的上下文。</p>
        </div>
        <p className={`status ${auditDetailState}`}>{auditDetailSummary}</p>

        {selectedLog ? (
          <div className="stack-grid">
            <BorderGlow as="article" className="summary-card">
              <span>动作</span>
              <strong>{selectedLog.action}</strong>
              <small>{selectedLog.target}</small>
            </BorderGlow>
            <BorderGlow as="article" className="summary-card">
              <span>执行人</span>
              <strong>{selectedLog.actor_username || "system"}</strong>
              <small>{formatDateTime(selectedLog.created_at)}</small>
            </BorderGlow>
            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>附加信息</h3>
              <pre className="json-block">{JSON.stringify(selectedLog.detail, null, 2)}</pre>
            </BorderGlow>
          </div>
        ) : (
          <p className="status idle">请先从列表中选择一条操作记录。</p>
        )}
      </BorderGlow>
    </main>
  );
}
