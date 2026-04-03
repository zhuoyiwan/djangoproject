import { useMemo, useState } from "react";
import { useAuth } from "../app/auth";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useResourceDetail } from "../hooks/useResourceDetail";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import { getAuditLog, getAuditLogs, getAuditToolQuery } from "../lib/api";
import type {
  AuditLogRecord,
  AuditQuery,
  AuditToolQuery,
  AuditToolQueryResponse,
  RequestState,
  ToolQuerySummary,
} from "../types";

const initialQuery: AuditQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "20",
};

const initialToolQuery: AuditToolQuery = {
  q: "",
  action: "",
  target: "",
  actor_username: "",
  detail_reason: "",
  detail_path: "",
  detail_status_code: "",
  limit: "6",
};

export function AuditPage() {
  const { accessToken, baseUrl } = useAuth();
  const [query, setQuery] = useState<AuditQuery>(initialQuery);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [toolQuery, setToolQuery] = useState<AuditToolQuery>(initialToolQuery);
  const [toolQueryState, setToolQueryState] = useState<RequestState>("idle");
  const [toolQuerySummaryText, setToolQuerySummaryText] = useState("为审计 Tool Query 选择至少一个过滤条件后查询。");
  const [toolQueryResponse, setToolQueryResponse] = useState<AuditToolQueryResponse | null>(null);
  const {
    page: auditPage,
    state: auditListState,
    summary: auditListSummary,
    refresh: refreshAuditLogs,
  } = usePaginatedResource<AuditLogRecord, AuditQuery>({
    accessToken,
    query,
    initialSummary: "读取审计日志列表，查看近期写入与安全事件。",
    missingTokenSummary: "请先登录后再查询审计日志。",
    loadingSummary: "正在加载审计轨迹...",
    successSummary: (response) => `已加载 ${response.results.length} 条审计日志，共 ${response.count} 条。`,
    fetcher: (token, activeQuery) => getAuditLogs(baseUrl, token, activeQuery),
  });
  const {
    item: selectedLog,
    state: auditDetailState,
    summary: auditDetailSummary,
  } = useResourceDetail<AuditLogRecord>({
    accessToken,
    resourceId: selectedLogId,
    initialSummary: "从列表中选择一条日志后查看详情。",
    missingTokenSummary: "请先登录后再查看审计详情。",
    loadingSummary: (id) => `正在加载审计日志 ${id}...`,
    successSummary: (response) => `已加载审计日志 ${response.id}。`,
    fetcher: (token, id) => getAuditLog(baseUrl, token, id),
  });

  function updateQuery<K extends keyof AuditQuery>(key: K, value: AuditQuery[K]) {
    setQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateToolQuery<K extends keyof AuditToolQuery>(key: K, value: AuditToolQuery[K]) {
    setToolQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetToolQuery() {
    setToolQuery(initialToolQuery);
    setToolQueryResponse(null);
    setToolQueryState("idle");
    setToolQuerySummaryText("为审计 Tool Query 选择至少一个过滤条件后查询。");
  }

  async function handleToolQuerySearch() {
    if (!accessToken) {
      setToolQueryState("error");
      setToolQuerySummaryText("请先登录后再使用审计 Tool Query。");
      return;
    }
    if (!hasRequiredFilter(toolQuery, ["limit"])) {
      setToolQueryState("error");
      setToolQuerySummaryText("审计 Tool Query 至少需要一个过滤条件。");
      return;
    }
    setToolQueryState("loading");
    setToolQuerySummaryText("正在读取审计 Tool Query 结果...");
    try {
      const response = await getAuditToolQuery(baseUrl, accessToken, toolQuery);
      setToolQueryResponse(response);
      setToolQueryState("success");
      setToolQuerySummaryText(buildQuerySummary(response.summary, "Audit Tool Query"));
    } catch (error) {
      setToolQueryState("error");
      setToolQuerySummaryText(getUserFacingErrorMessage(error));
    }
  }

  const activeToolTags = useMemo(
    () =>
      [
        toolQuery.q ? `自由查询：${toolQuery.q}` : null,
        toolQuery.action ? `动作：${toolQuery.action}` : null,
        toolQuery.target ? `目标：${toolQuery.target}` : null,
        toolQuery.actor_username ? `执行人：${toolQuery.actor_username}` : null,
        toolQuery.detail_reason ? `原因：${toolQuery.detail_reason}` : null,
        toolQuery.detail_path ? `路径：${toolQuery.detail_path}` : null,
        toolQuery.detail_status_code ? `状态码：${toolQuery.detail_status_code}` : null,
      ].filter(Boolean) as string[],
    [toolQuery],
  );

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>审计日志</h2>
          <p>按分页列表查看近期写入、审批和安全事件，快速定位需要进一步审阅的条目。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>关键词</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
          <label className="field">
            <span>排序</span>
            <input value={query.ordering || ""} onChange={(event) => updateQuery("ordering", event.target.value)} />
          </label>
          <label className="field">
            <span>页码</span>
            <input value={query.page || ""} onChange={(event) => updateQuery("page", event.target.value)} />
          </label>
          <label className="field">
            <span>每页数量</span>
            <input value={query.page_size || ""} onChange={(event) => updateQuery("page_size", event.target.value)} />
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
            刷新日志
          </button>
        </div>

        <p className={`status ${auditListState}`}>{auditListSummary}</p>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>动作</th>
                <th>目标</th>
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
                  <td colSpan={4}>当前没有加载到审计日志。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>选中日志</h2>
          <p>查看单条日志的动作、目标和结构化 detail 载荷。</p>
        </div>
        <p className={`status ${auditDetailState}`}>{auditDetailSummary}</p>

        {selectedLog ? (
          <div className="stack-grid">
            <article className="summary-card">
              <span>动作</span>
              <strong>{selectedLog.action}</strong>
              <small>{selectedLog.target}</small>
            </article>
            <article className="summary-card">
              <span>执行人</span>
              <strong>{selectedLog.actor_username || "system"}</strong>
              <small>{formatDateTime(selectedLog.created_at)}</small>
            </article>
            <article className="highlight-card compact-card">
              <h3>Detail 载荷</h3>
              <pre className="json-block">{JSON.stringify(selectedLog.detail, null, 2)}</pre>
            </article>
          </div>
        ) : (
          <p className="status idle">请先从列表中选择一条审计日志。</p>
        )}
      </section>

      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>Audit Tool Query</h2>
          <p>对齐文档中的只读标准化查询接口，适合按动作、路径、状态码和安全原因快速检索。</p>
        </div>

        <div className="filter-grid automation-filter-grid">
          <label className="field">
            <span>自由查询</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>动作</span>
            <input value={toolQuery.action || ""} onChange={(event) => updateToolQuery("action", event.target.value)} />
          </label>
          <label className="field">
            <span>目标</span>
            <input value={toolQuery.target || ""} onChange={(event) => updateToolQuery("target", event.target.value)} />
          </label>
          <label className="field">
            <span>执行人</span>
            <input
              value={toolQuery.actor_username || ""}
              onChange={(event) => updateToolQuery("actor_username", event.target.value)}
            />
          </label>
          <label className="field">
            <span>原因</span>
            <input
              value={toolQuery.detail_reason || ""}
              onChange={(event) => updateToolQuery("detail_reason", event.target.value)}
            />
          </label>
          <label className="field">
            <span>路径</span>
            <input value={toolQuery.detail_path || ""} onChange={(event) => updateToolQuery("detail_path", event.target.value)} />
          </label>
          <label className="field">
            <span>状态码</span>
            <input
              value={toolQuery.detail_status_code || ""}
              onChange={(event) => updateToolQuery("detail_status_code", event.target.value)}
            />
          </label>
          <label className="field">
            <span>返回上限</span>
            <input value={toolQuery.limit || ""} onChange={(event) => updateToolQuery("limit", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleToolQuerySearch()} type="button">
            查询 Tool Query
          </button>
          <button className="button-ghost" onClick={resetToolQuery} type="button">
            重置条件
          </button>
        </div>

        {activeToolTags.length ? (
          <div className="filter-chip-row">
            {activeToolTags.map((tag) => (
              <span className="filter-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className={`status ${toolQueryState}`}>{toolQuerySummaryText}</p>

        {toolQueryResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">命中 {toolQueryResponse.summary.returned} 条</span>
              <span className="filter-chip">截断：{toolQueryResponse.summary.truncated ? "是" : "否"}</span>
              <span className="filter-chip">请求 ID：{toolQueryResponse.request_id || "未返回"}</span>
            </div>
            <div className="query-result-grid">
              {toolQueryResponse.items.map((item) => (
                <article className="tool-result-card" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <span className="eyebrow">Audit / Tool Query</span>
                      <h3>{item.action}</h3>
                    </div>
                    <span className="pill neutral">{item.actor_username || "system"}</span>
                  </div>
                  <div className="tool-result-meta">
                    <span className="filter-chip">{item.target}</span>
                    <span className="filter-chip">{formatDateTime(item.created_at)}</span>
                  </div>
                  <div className="payload-preview">
                    <span>Detail 载荷</span>
                    <pre className="json-block">{JSON.stringify(item.detail, null, 2)}</pre>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="status idle">Audit Tool Query 结果会在这里展示。</p>
        )}
      </section>
    </main>
  );
}

function hasRequiredFilter(query: Record<string, string | undefined>, ignoredKeys: string[]) {
  return Object.entries(query).some(([key, value]) => !ignoredKeys.includes(key) && Boolean(value));
}

function buildQuerySummary(summary: ToolQuerySummary, label: string) {
  return `${label} 返回 ${summary.returned} 条结果${summary.truncated ? "，已按上限截断。" : "。"} `;
}
