import { Link } from "react-router-dom";
import { useMemo, useState } from "react";
import { useAuth } from "../app/auth";
import { contractHighlights } from "../contract";
import { getUserFacingErrorMessage } from "../lib/errors";
import { getHealth, getIDCToolQuery } from "../lib/api";
import type { IDCToolQuery, IDCToolQueryResponse, RequestState, ToolQuerySummary } from "../types";

const initialIDCToolQuery: IDCToolQuery = {
  q: "",
  code: "",
  name: "",
  location: "",
  status: "",
  limit: "4",
};

export function OverviewPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const [healthState, setHealthState] = useState<RequestState>("idle");
  const [healthSummary, setHealthSummary] = useState("当前会话尚未执行健康探测。");
  const [idcToolQuery, setIdcToolQuery] = useState<IDCToolQuery>(initialIDCToolQuery);
  const [idcToolState, setIdcToolState] = useState<RequestState>("idle");
  const [idcToolSummary, setIdcToolSummary] = useState("为 IDC Tool Query 选择至少一个过滤条件后查询。");
  const [idcToolResponse, setIdcToolResponse] = useState<IDCToolQueryResponse | null>(null);

  async function handleHealthCheck() {
    setHealthState("loading");
    setHealthSummary("正在检查后端健康状态...");
    try {
      const response = await getHealth(baseUrl);
      setHealthState("success");
      setHealthSummary(`后端健康检查通过，返回字段：${Object.keys(response).join("、")}。`);
    } catch (error) {
      setHealthState("error");
      setHealthSummary(getUserFacingErrorMessage(error));
    }
  }

  function updateIDCToolQuery<K extends keyof IDCToolQuery>(key: K, value: IDCToolQuery[K]) {
    setIdcToolQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function resetIDCToolQuery() {
    setIdcToolQuery(initialIDCToolQuery);
    setIdcToolResponse(null);
    setIdcToolState("idle");
    setIdcToolSummary("为 IDC Tool Query 选择至少一个过滤条件后查询。");
  }

  async function handleIDCToolQuery() {
    if (!accessToken) {
      setIdcToolState("error");
      setIdcToolSummary("请先登录后再使用 IDC Tool Query。");
      return;
    }
    if (!hasRequiredFilter(idcToolQuery, ["limit"])) {
      setIdcToolState("error");
      setIdcToolSummary("IDC Tool Query 至少需要一个过滤条件。");
      return;
    }
    setIdcToolState("loading");
    setIdcToolSummary("正在读取 IDC Tool Query 结果...");
    try {
      const response = await getIDCToolQuery(baseUrl, accessToken, idcToolQuery);
      setIdcToolResponse(response);
      setIdcToolState("success");
      setIdcToolSummary(buildQuerySummary(response.summary, "IDC Tool Query"));
    } catch (error) {
      setIdcToolState("error");
      setIdcToolSummary(getUserFacingErrorMessage(error));
    }
  }

  const activeIDCTags = useMemo(
    () =>
      [
        idcToolQuery.q ? `自由查询：${idcToolQuery.q}` : null,
        idcToolQuery.code ? `编码：${idcToolQuery.code}` : null,
        idcToolQuery.name ? `名称：${idcToolQuery.name}` : null,
        idcToolQuery.location ? `地域：${idcToolQuery.location}` : null,
        idcToolQuery.status ? `状态：${getIDCStatusLabel(idcToolQuery.status)}` : null,
      ].filter(Boolean) as string[],
    [idcToolQuery],
  );

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>工作台总览</h2>
          <p>把当前后端契约、登录身份和常用读接口入口放在同一屏，作为前端同步工作的起点。</p>
        </div>

        <div className="summary-grid">
          <article className="summary-card">
            <span>当前身份</span>
            <strong>{profile?.display_name || profile?.username}</strong>
            <small>{profile?.email || "未设置邮箱"}</small>
          </article>
          <article className="summary-card">
            <span>后端地址</span>
            <strong>{baseUrl}</strong>
            <small>可在头部配置区随时切换。</small>
          </article>
          <article className="summary-card">
            <span>主数据入口</span>
            <strong>/api/v1/cmdb/servers/</strong>
            <small>认证后默认可读。</small>
          </article>
        </div>

        <div className="actions">
          <button onClick={() => void handleHealthCheck()} type="button">
            探测健康
          </button>
          <Link className="button-link" to="/servers">
            打开服务器页
          </Link>
          <Link className="button-link" to="/automation">
            打开自动化页
          </Link>
          <Link className="button-link" to="/audit">
            打开审计页
          </Link>
          <Link className="button-link button-link-ghost" to="/contract">
            查看契约页
          </Link>
        </div>

        <p className={`status ${healthState}`}>{healthSummary}</p>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>契约提醒</h2>
          <p>保留最容易在前端联调中发生漂移的几条约束。</p>
        </div>

        <div className="stack-grid">
          {contractHighlights.slice(0, 4).map((item) => (
            <article className="highlight-card compact-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>IDC Tool Query</h2>
          <p>对齐文档中的 `GET /api/v1/cmdb/idcs/tool-query/`，适合在首页快速验证 IDC 只读查询面是否工作正常。</p>
        </div>

        <div className="filter-grid automation-filter-grid">
          <label className="field">
            <span>自由查询</span>
            <input value={idcToolQuery.q || ""} onChange={(event) => updateIDCToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>编码</span>
            <input value={idcToolQuery.code || ""} onChange={(event) => updateIDCToolQuery("code", event.target.value)} />
          </label>
          <label className="field">
            <span>名称</span>
            <input value={idcToolQuery.name || ""} onChange={(event) => updateIDCToolQuery("name", event.target.value)} />
          </label>
          <label className="field">
            <span>地域</span>
            <input
              value={idcToolQuery.location || ""}
              onChange={(event) => updateIDCToolQuery("location", event.target.value)}
            />
          </label>
          <label className="field">
            <span>状态</span>
            <select
              value={idcToolQuery.status || ""}
              onChange={(event) => updateIDCToolQuery("status", event.target.value as IDCToolQuery["status"])}
            >
              <option value="">全部</option>
              <option value="active">active</option>
              <option value="maintenance">maintenance</option>
              <option value="inactive">inactive</option>
            </select>
          </label>
          <label className="field">
            <span>返回上限</span>
            <input value={idcToolQuery.limit || ""} onChange={(event) => updateIDCToolQuery("limit", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleIDCToolQuery()} type="button">
            查询 IDC Tool Query
          </button>
          <button className="button-ghost" onClick={resetIDCToolQuery} type="button">
            重置条件
          </button>
        </div>

        {activeIDCTags.length ? (
          <div className="filter-chip-row">
            {activeIDCTags.map((tag) => (
              <span className="filter-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className={`status ${idcToolState}`}>{idcToolSummary}</p>

        {idcToolResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">命中 {idcToolResponse.summary.returned} 条</span>
              <span className="filter-chip">截断：{idcToolResponse.summary.truncated ? "是" : "否"}</span>
              <span className="filter-chip">请求 ID：{idcToolResponse.request_id || "未返回"}</span>
            </div>
            <div className="query-result-grid">
              {idcToolResponse.items.map((item) => (
                <article className="tool-result-card" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <span className="eyebrow">CMDB / IDC Tool Query</span>
                      <h3>{item.name}</h3>
                    </div>
                    <span className="pill neutral">{getIDCStatusLabel(item.status)}</span>
                  </div>
                  <div className="tool-result-meta">
                    <span className="filter-chip">{item.code}</span>
                    <span className="filter-chip">{item.location}</span>
                  </div>
                  <div className="payload-preview">
                    <span>说明</span>
                    <p>{item.description || "暂未提供 IDC 说明。"}</p>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="status idle">IDC Tool Query 结果会在这里展示。</p>
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

function getIDCStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: "活跃",
    maintenance: "维护中",
    inactive: "停用",
  };
  return labels[status] || status;
}
