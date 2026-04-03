import { useMemo, useState } from "react";
import { useAuth } from "../app/auth";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { getServers, getServerToolQuery } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type {
  RequestState,
  ServerQuery,
  ServerRecord,
  ServerToolQuery,
  ServerToolQueryResponse,
  ToolQuerySummary,
} from "../types";

const initialQuery: ServerQuery = {
  search: "",
  ordering: "-updated_at",
  page: "1",
  page_size: "20",
  environment: "",
  lifecycle_status: "",
  source: "",
};

const initialToolQuery: ServerToolQuery = {
  q: "",
  hostname: "",
  internal_ip: "",
  environment: "",
  lifecycle_status: "",
  idc_code: "",
  limit: "6",
};

export function ServersPage() {
  const { accessToken, baseUrl } = useAuth();
  const [query, setQuery] = useState<ServerQuery>(initialQuery);
  const [selectedServerId, setSelectedServerId] = useState<number | null>(null);
  const [toolQuery, setToolQuery] = useState<ServerToolQuery>(initialToolQuery);
  const [toolQueryState, setToolQueryState] = useState<RequestState>("idle");
  const [toolQuerySummaryText, setToolQuerySummaryText] = useState("为服务器 Tool Query 选择至少一个过滤条件后查询。");
  const [toolQueryResponse, setToolQueryResponse] = useState<ServerToolQueryResponse | null>(null);
  const {
    page: serverPage,
    state: serverState,
    summary: serverSummary,
    refresh: refreshServers,
  } = usePaginatedResource<ServerRecord, ServerQuery>({
    accessToken,
    query,
    initialSummary: "读取当前 CMDB 服务器列表。",
    missingTokenSummary: "请先登录后再查询 CMDB 服务器。",
    loadingSummary: "正在查询实时 CMDB 数据...",
    successSummary: (response) => `已加载 ${response.results.length} 台服务器，共 ${response.count} 台。`,
    fetcher: (token, activeQuery) => getServers(baseUrl, token, activeQuery),
  });

  function updateQuery<K extends keyof ServerQuery>(key: K, value: ServerQuery[K]) {
    setQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateToolQuery<K extends keyof ServerToolQuery>(key: K, value: ServerToolQuery[K]) {
    setToolQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetToolQuery() {
    setToolQuery(initialToolQuery);
    setToolQueryResponse(null);
    setToolQueryState("idle");
    setToolQuerySummaryText("为服务器 Tool Query 选择至少一个过滤条件后查询。");
  }

  async function handleToolQuerySearch() {
    if (!accessToken) {
      setToolQueryState("error");
      setToolQuerySummaryText("请先登录后再使用服务器 Tool Query。");
      return;
    }
    if (!hasRequiredFilter(toolQuery, ["limit"])) {
      setToolQueryState("error");
      setToolQuerySummaryText("服务器 Tool Query 至少需要一个过滤条件。");
      return;
    }
    setToolQueryState("loading");
    setToolQuerySummaryText("正在读取服务器 Tool Query 结果...");
    try {
      const response = await getServerToolQuery(baseUrl, accessToken, toolQuery);
      setToolQueryResponse(response);
      setToolQueryState("success");
      setToolQuerySummaryText(buildQuerySummary(response.summary, "Server Tool Query"));
    } catch (error) {
      setToolQueryState("error");
      setToolQuerySummaryText((error as Error).message);
    }
  }

  const selectedServer =
    serverPage?.results.find((server) => server.id === selectedServerId) || serverPage?.results[0] || null;

  const activeToolTags = useMemo(
    () =>
      [
        toolQuery.q ? `自由查询：${toolQuery.q}` : null,
        toolQuery.hostname ? `主机名：${toolQuery.hostname}` : null,
        toolQuery.internal_ip ? `内网 IP：${toolQuery.internal_ip}` : null,
        toolQuery.environment ? `环境：${toolQuery.environment}` : null,
        toolQuery.lifecycle_status ? `生命周期：${toolQuery.lifecycle_status}` : null,
        toolQuery.idc_code ? `IDC：${toolQuery.idc_code}` : null,
      ].filter(Boolean) as string[],
    [toolQuery],
  );

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>服务器资产</h2>
          <p>按文档中的标准列表过滤实时浏览 CMDB 服务器，并从右侧查看选中资产详情。</p>
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
          <label className="field">
            <span>环境</span>
            <select value={query.environment || ""} onChange={(event) => updateQuery("environment", event.target.value)}>
              <option value="">全部</option>
              <option value="dev">dev</option>
              <option value="test">test</option>
              <option value="prod">prod</option>
            </select>
          </label>
          <label className="field">
            <span>生命周期</span>
            <select
              value={query.lifecycle_status || ""}
              onChange={(event) => updateQuery("lifecycle_status", event.target.value)}
            >
              <option value="">全部</option>
              <option value="online">online</option>
              <option value="offline">offline</option>
              <option value="maintenance">maintenance</option>
              <option value="pre_allocated">pre_allocated</option>
            </select>
          </label>
          <label className="field">
            <span>来源</span>
            <select value={query.source || ""} onChange={(event) => updateQuery("source", event.target.value)}>
              <option value="">全部</option>
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
            刷新列表
          </button>
        </div>

        <p className={`status ${serverState}`}>{serverSummary}</p>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>主机名</th>
                <th>内网 IP</th>
                <th>IDC</th>
                <th>系统</th>
                <th>环境</th>
                <th>生命周期</th>
                <th>来源</th>
                <th>更新时间</th>
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
                    <td>{server.idc_name || "未记录"}</td>
                    <td>{server.os_version}</td>
                    <td>{server.environment}</td>
                    <td>{server.lifecycle_status}</td>
                    <td>{server.source}</td>
                    <td>{formatDateTime(server.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>当前没有加载到服务器数据。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>选中服务器</h2>
          <p>查看当前资产的核心容量、网络与元数据字段。</p>
        </div>

        {selectedServer ? (
          <>
            <dl className="profile-card detail-card">
              <div>
                <dt>主机名</dt>
                <dd>{selectedServer.hostname}</dd>
              </div>
              <div>
                <dt>IDC</dt>
                <dd>{selectedServer.idc_name || "未记录"}</dd>
              </div>
              <div>
                <dt>内网 IP</dt>
                <dd>{selectedServer.internal_ip}</dd>
              </div>
              <div>
                <dt>外网 IP</dt>
                <dd>{selectedServer.external_ip || "未记录"}</dd>
              </div>
              <div>
                <dt>CPU</dt>
                <dd>{selectedServer.cpu_cores} cores</dd>
              </div>
              <div>
                <dt>内存</dt>
                <dd>{selectedServer.memory_gb} GB</dd>
              </div>
              <div>
                <dt>最近心跳</dt>
                <dd>{formatDateTime(selectedServer.last_seen_at)}</dd>
              </div>
              <div>
                <dt>更新时间</dt>
                <dd>{formatDateTime(selectedServer.updated_at)}</dd>
              </div>
            </dl>

            <article className="highlight-card compact-card">
              <h3>磁盘摘要</h3>
              <p>{selectedServer.disk_summary || "暂未提供磁盘摘要。"}</p>
            </article>

            <article className="highlight-card compact-card">
              <h3>元数据</h3>
              <pre className="json-block">{JSON.stringify(selectedServer.metadata, null, 2)}</pre>
            </article>
          </>
        ) : (
          <p className="status idle">请先从列表中选择一台服务器。</p>
        )}
      </section>

      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>Server Tool Query</h2>
          <p>对齐文档中的 `servers/tool-query` 只读接口，适合按主机名、IP、环境、生命周期与 IDC 精准检索。</p>
        </div>

        <div className="filter-grid automation-filter-grid">
          <label className="field">
            <span>自由查询</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>主机名</span>
            <input value={toolQuery.hostname || ""} onChange={(event) => updateToolQuery("hostname", event.target.value)} />
          </label>
          <label className="field">
            <span>内网 IP</span>
            <input
              value={toolQuery.internal_ip || ""}
              onChange={(event) => updateToolQuery("internal_ip", event.target.value)}
            />
          </label>
          <label className="field">
            <span>环境</span>
            <select
              value={toolQuery.environment || ""}
              onChange={(event) => updateToolQuery("environment", event.target.value as ServerToolQuery["environment"])}
            >
              <option value="">全部</option>
              <option value="dev">dev</option>
              <option value="test">test</option>
              <option value="prod">prod</option>
            </select>
          </label>
          <label className="field">
            <span>生命周期</span>
            <select
              value={toolQuery.lifecycle_status || ""}
              onChange={(event) =>
                updateToolQuery("lifecycle_status", event.target.value as ServerToolQuery["lifecycle_status"])
              }
            >
              <option value="">全部</option>
              <option value="online">online</option>
              <option value="offline">offline</option>
              <option value="maintenance">maintenance</option>
              <option value="pre_allocated">pre_allocated</option>
            </select>
          </label>
          <label className="field">
            <span>IDC Code</span>
            <input value={toolQuery.idc_code || ""} onChange={(event) => updateToolQuery("idc_code", event.target.value)} />
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
                      <span className="eyebrow">CMDB / Tool Query</span>
                      <h3>{item.hostname}</h3>
                    </div>
                    <span className="pill neutral">{item.environment}</span>
                  </div>
                  <div className="tool-result-meta">
                    <span className="filter-chip">{item.lifecycle_status}</span>
                    <span className="filter-chip">{item.source}</span>
                    <span className="filter-chip">{item.idc_code || "未记录 IDC"}</span>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>内网 IP</dt>
                      <dd>{item.internal_ip}</dd>
                    </div>
                    <div>
                      <dt>外网 IP</dt>
                      <dd>{item.external_ip || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>操作系统</dt>
                      <dd>{item.os_version}</dd>
                    </div>
                    <div>
                      <dt>IDC 名称</dt>
                      <dd>{item.idc_name || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>最近心跳</dt>
                      <dd>{formatDateTime(item.last_seen_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="status idle">Server Tool Query 结果会在这里展示。</p>
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
