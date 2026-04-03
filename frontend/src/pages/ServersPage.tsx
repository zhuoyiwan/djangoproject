import { useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
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
    initialSummary: "读取当前 CMDB 服务器列表。",
    missingTokenSummary: "请先登录后再查询 CMDB 服务器。",
    loadingSummary: "正在查询实时 CMDB 数据...",
    successSummary: (response) => `已加载 ${response.results.length} 台服务器，共 ${response.count} 台。`,
    fetcher: (token, activeQuery) => getServers(baseUrl, token, activeQuery),
  });

  function updateQuery<K extends keyof ServerQuery>(key: K, value: ServerQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  const selectedServer =
    serverPage?.results.find((server) => server.id === selectedServerId) || serverPage?.results[0] || null;

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8">
        <div className="panel-heading">
          <h2>服务器资产</h2>
          <p>用更直接的方式浏览现有机器，普通使用者只需要搜索、筛选和查看关键信息即可。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>关键词</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
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
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4">
        <div className="panel-heading">
          <h2>选中服务器</h2>
          <p>右侧只展示日常最常看的关键信息，避免被原始结构化字段干扰。</p>
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

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>磁盘摘要</h3>
              <p>{selectedServer.disk_summary || "暂未提供磁盘摘要。"}</p>
            </BorderGlow>
          </>
        ) : (
          <p className="status idle">请先从列表中选择一台服务器。</p>
        )}
      </BorderGlow>
    </main>
  );
}
