import { useEffect, useState } from "react";
import { BorderGlow } from "../components/BorderGlow";
import { useAuth } from "../app/auth";
import { getContractWorkbench } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import type { ContractWorkbenchResponse, RequestState } from "../types";

export function ContractPage() {
  const { accessToken, baseUrl } = useAuth();
  const [state, setState] = useState<RequestState>("loading");
  const [summary, setSummary] = useState("正在同步契约工作台");
  const [workbench, setWorkbench] = useState<ContractWorkbenchResponse | null>(null);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  useEffect(() => {
    if (!accessToken) {
      setState("error");
      setSummary("请先登录后再访问契约工作台");
      setWorkbench(null);
      return;
    }

    let active = true;
    async function loadWorkbench() {
      setState("loading");
      setSummary("正在同步契约工作台");
      try {
        const response = await getContractWorkbench(baseUrl, accessToken);
        if (!active) {
          return;
        }
        setWorkbench(response);
        setState("success");
        setSummary(`已同步 ${response.highlights.length} 条契约要点与 ${response.endpoint_groups.length} 组接口资源`);
      } catch (error) {
        if (!active) {
          return;
        }
        setWorkbench(null);
        setState("error");
        setSummary(getUserFacingErrorMessage(error));
      }
    }

    void loadWorkbench();
    return () => {
      active = false;
    };
  }, [accessToken, baseUrl]);

  const schemaUrl = `${normalizedBaseUrl}${workbench?.docs.schema_path || "/api/schema/"}`;
  const swaggerUrl = `${normalizedBaseUrl}${workbench?.docs.swagger_path || "/api/docs/"}`;
  const redocUrl = `${normalizedBaseUrl}${workbench?.docs.redoc_path || "/api/redoc/"}`;

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-12">
        <div className="panel-heading">
          <h2>后端契约工作台</h2>
          <p>把当前后端文档中的关键约束、只读查询面和角色敏感路由集中展示，减少前端联调时的契约漂移。</p>
        </div>

        <div className="summary-grid">
          <BorderGlow as="article" className="summary-card">
            <span>当前接入地址</span>
            <strong>{normalizedBaseUrl}</strong>
            <small>契约页中的在线文档入口会直接基于当前服务地址打开</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>联调提示</span>
            <strong>先看契约，再调接口</strong>
            <small>建议先核对 Schema 与权限边界，再进入具体模块验证请求与返回形状</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>契约状态</span>
            <strong>{state === "success" ? "已同步" : state === "error" ? "同步失败" : "同步中"}</strong>
            <small>{summary}</small>
          </BorderGlow>
        </div>

        <p className={`status ${state}`}>{summary}</p>

        <div className="actions contract-entry-actions">
          <a className="button-link" href={swaggerUrl} rel="noreferrer" target="_blank">
            打开 Swagger
          </a>
          <a className="button-link" href={redocUrl} rel="noreferrer" target="_blank">
            打开 Redoc
          </a>
          <a className="button-link button-link-ghost" href={schemaUrl} rel="noreferrer" target="_blank">
            查看 Schema JSON
          </a>
        </div>

        <div className="highlight-grid">
          {(workbench?.highlights || []).map((item) => (
            <BorderGlow as="article" className="highlight-card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </BorderGlow>
          ))}
        </div>

        <div className="endpoint-grid">
          {(workbench?.endpoint_groups || []).map((group) => (
            <BorderGlow as="article" className="endpoint-card" key={group.label}>
              <h3>{group.label}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </BorderGlow>
          ))}
        </div>

        <BorderGlow as="article" className="highlight-card compact-card contract-entry-card">
          <h3>联调入口</h3>
          <p>当前页面已承接在线 Schema、Swagger 与 Redoc 入口，可作为接口核对与联调协作的统一起点。</p>
        </BorderGlow>
      </BorderGlow>
    </main>
  );
}
