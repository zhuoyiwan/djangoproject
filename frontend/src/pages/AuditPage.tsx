import { useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect } from "../components/GlassSelect";
import { PaginationControls } from "../components/PaginationControls";
import { useHashSectionScroll } from "../hooks/useHashSectionScroll";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { useResourceDetail } from "../hooks/useResourceDetail";
import { formatDateTime } from "../lib/format";
import { buildCsvFilename, downloadCsv } from "../lib/export";
import { getAuditLog, getAuditLogs, getAuditToolQuery } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import type { AuditLogRecord, AuditQuery, AuditToolQuery, AuditToolQueryResponse, RequestState } from "../types";

const initialQuery: AuditQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "20",
};

const orderingOptions = [
  { value: "-created_at", label: "最新记录" },
  { value: "action", label: "动作 A-Z" },
  { value: "target", label: "对象 A-Z" },
];

const initialToolQuery: AuditToolQuery = {
  q: "",
  action: "",
  target: "",
  actor_username: "",
  detail_path: "",
  detail_reason: "",
  detail_status_code: "",
  limit: "5",
};

export function AuditPage() {
  const { accessToken, baseUrl, capabilities, capabilityState } = useAuth();
  useHashSectionScroll();
  const [query, setQuery] = useState<AuditQuery>(initialQuery);
  const [toolQuery, setToolQuery] = useState<AuditToolQuery>(initialToolQuery);
  const [toolState, setToolState] = useState<RequestState>("idle");
  const [toolSummary, setToolSummary] = useState("支持按动作、对象、执行人、访问路径与原因关键词检索关键操作留痕。");
  const [toolResponse, setToolResponse] = useState<AuditToolQueryResponse | null>(null);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const auditEnabled = Boolean(accessToken && capabilities.canReadAudit);
  const auditAccessToken = auditEnabled ? accessToken : "";
  const {
    page: auditPage,
    state: auditListState,
    summary: auditListSummary,
    refresh: refreshAuditLogs,
  } = usePaginatedResource<AuditLogRecord, AuditQuery>({
    accessToken: auditAccessToken,
    query,
    initialSummary: "读取操作记录列表，查看近期关键操作留痕。",
    missingTokenSummary: accessToken ? "当前账号未开通操作记录访问权限。" : "请先登录后再访问操作记录。",
    loadingSummary: "正在同步操作记录...",
    successSummary: (response) => `已加载 ${response.results.length} 条记录，共 ${response.count} 条。`,
    fetcher: (token, activeQuery) => getAuditLogs(baseUrl, token, activeQuery),
  });
  const {
    item: selectedLog,
    state: auditDetailState,
    summary: auditDetailSummary,
  } = useResourceDetail<AuditLogRecord>({
    accessToken: auditAccessToken,
    resourceId: selectedLogId,
    initialSummary: "请从左侧选择目标记录，以查看完整留痕详情与业务上下文。",
    missingTokenSummary: accessToken ? "当前账号未开通操作记录访问权限。" : "请先登录后再查看记录详情。",
    loadingSummary: (id) => `正在加载记录 ${id} 的详细信息...`,
    successSummary: (response) => `已加载记录 ${response.id} 的详细信息。`,
    fetcher: (token, id) => getAuditLog(baseUrl, token, id),
  });

  function updateQuery<K extends keyof AuditQuery>(key: K, value: AuditQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  function updateToolQuery<K extends keyof AuditToolQuery>(key: K, value: AuditToolQuery[K]) {
    setToolQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleToolQuery() {
    if (!auditEnabled) {
      setToolState("error");
      setToolSummary("当前账号未开通操作记录访问权限。");
      return;
    }

    const activeQuery = Object.fromEntries(
      Object.entries(toolQuery).filter(([, value]) => Boolean(value)),
    ) as AuditToolQuery;

    setToolState("loading");
    setToolSummary("正在执行高级记录检索...");
    try {
      const response = await getAuditToolQuery(baseUrl, auditAccessToken, activeQuery);
      setToolResponse(response);
      setToolState("success");
      setToolSummary(`已返回 ${response.summary.returned} 条记录，共命中 ${response.summary.count} 条。`);
    } catch (error) {
      setToolResponse(null);
      setToolState("error");
      setToolSummary(getUserFacingErrorMessage(error));
    }
  }

  const currentPage = Number(query.page || "1");
  const pageSize = Number(query.page_size || "20");

  function handleExportAudit() {
    if (!auditPage?.results.length) {
      return;
    }

    downloadCsv(
      buildCsvFilename("操作记录明细"),
      [
        { key: "action", label: "动作" },
        { key: "target", label: "对象" },
        { key: "actor_username", label: "执行人" },
        { key: "created_at", label: "时间" },
      ],
      auditPage.results,
    );
  }

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8" id="audit-records">
        <div className="panel-heading">
          <h2>操作记录</h2>
          <p>集中查看近期关键操作留痕，支持按关键词检索，便于回溯平台内已发生的业务动作与处理过程。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>关键词</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
          <div className="field">
            <span>排序方式</span>
            <GlassSelect
              options={orderingOptions}
              value={query.ordering || "-created_at"}
              onChange={(value) => updateQuery("ordering", value)}
            />
          </div>
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
          <button className="button-ghost" onClick={handleExportAudit} type="button">
            导出当前页
          </button>
        </div>

        <p className={`status ${auditListState}`}>{auditListSummary}</p>

        {capabilityState === "loading" && accessToken ? (
          <p className="status loading">正在校验当前账号的记录访问权限...</p>
        ) : !auditEnabled && accessToken ? (
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>记录访问未开通</h3>
            <p>当前账号尚未配置操作记录查看权限。如需查看审计与安全留痕，请联系平台管理员为当前账号开通相应访问能力。</p>
          </BorderGlow>
        ) : (
          <>
            <div className="table-shell">
              <table className="audit-log-table">
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
                      <td colSpan={4}>当前暂无可展示的操作记录。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <PaginationControls
              currentPage={currentPage}
              onPageChange={(page) => updateQuery("page", String(page))}
              onPageSizeChange={(size) => {
                updateQuery("page_size", String(size));
              }}
              page={auditPage}
              pageSize={pageSize}
            />
          </>
        )}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4 panel-fit-content">
        <div className="panel-heading">
          <h2>记录详情</h2>
          <p>展示当前记录的动作对象、执行主体与附加信息，帮助快速理解该条留痕对应的业务上下文。</p>
        </div>
        <p className={`status ${auditDetailState}`}>{auditDetailSummary}</p>

        {!auditEnabled && accessToken ? (
          <p className="status idle">当前账号未开通记录访问权限，无法查看留痕详情。</p>
        ) : selectedLog ? (
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
        ) : null}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12" id="audit-advanced-query">
        <div className="panel-heading">
          <h2>高级记录查询</h2>
          <p>面向审计复盘、安全排查与责任追踪场景，可通过动作、对象、执行人、访问路径与原因关键词快速定位目标留痕。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>综合关键词</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>动作</span>
            <input value={toolQuery.action || ""} onChange={(event) => updateToolQuery("action", event.target.value)} />
          </label>
          <label className="field">
            <span>对象</span>
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
            <span>访问路径</span>
            <input
              value={toolQuery.detail_path || ""}
              onChange={(event) => updateToolQuery("detail_path", event.target.value)}
            />
          </label>
          <label className="field">
            <span>原因关键词</span>
            <input
              value={toolQuery.detail_reason || ""}
              onChange={(event) => updateToolQuery("detail_reason", event.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleToolQuery()} type="button">
            执行查询
          </button>
          <button
            className="button-ghost"
            onClick={() => {
              setToolQuery(initialToolQuery);
              setToolResponse(null);
              setToolState("idle");
              setToolSummary("支持按动作、对象、执行人、访问路径与原因关键词检索关键操作留痕。");
            }}
            type="button"
          >
            重置条件
          </button>
        </div>

        <p className={`status ${toolState}`}>{toolSummary}</p>

        {toolResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">返回 {toolResponse.summary.returned} 条</span>
              <span className="filter-chip">命中 {toolResponse.summary.count} 条</span>
              {toolResponse.summary.truncated ? <span className="filter-chip">结果已截断</span> : null}
            </div>
            <div className="query-result-grid query-result-grid-compact">
              {toolResponse.items.map((item) => (
                <BorderGlow as="article" className="tool-result-card tool-result-card-compact" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{item.action}</h3>
                      <div className="tool-result-meta">
                        <span className="pill neutral">记录 #{item.id}</span>
                        <span className="pill neutral">{item.actor_username || "system"}</span>
                      </div>
                    </div>
                    <button
                      className="button-ghost"
                      onClick={() => setSelectedLogId(item.id)}
                      type="button"
                    >
                      查看详情
                    </button>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>对象</dt>
                      <dd>{item.target}</dd>
                    </div>
                    <div>
                      <dt>时间</dt>
                      <dd>{formatDateTime(item.created_at)}</dd>
                    </div>
                  </dl>
                </BorderGlow>
              ))}
            </div>
          </>
        ) : null}
      </BorderGlow>
    </main>
  );
}
