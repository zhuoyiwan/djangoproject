import { useEffect, useState } from "react";
import { BorderGlow } from "../components/BorderGlow";
import { useAuth } from "../app/auth";
import { getContractWorkbench } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import type { ContractWorkbenchResponse, RequestState } from "../types";

const ENDPOINT_GROUP_COPY: Record<
  string,
  {
    eyebrow: string;
    description: string;
    actionLabel: string;
    modalDescription: string;
  }
> = {
  "认证": {
    eyebrow: "身份认证",
    description: "集中查看登录、令牌刷新、登出与密码相关接口，便于快速核对会话链路与接入方式。",
    actionLabel: "查看认证接口清单",
    modalDescription: "以下为当前环境实际开放的认证接口，可用于登录链路联调、令牌流转核对与安全验证。",
  },
  "用户": {
    eyebrow: "账号治理",
    description: "统一查看用户资料、角色分配与管理接口，便于对齐账号字段、权限边界和管理流程。",
    actionLabel: "查看用户接口清单",
    modalDescription: "以下为当前环境实际开放的用户管理接口，适合用于账号治理、角色配置与资料联调。",
  },
  "CMDB": {
    eyebrow: "配置资产",
    description: "聚合机房、服务器与工具查询相关接口，便于资产台账、查询能力和录入流程联调。",
    actionLabel: "查看 CMDB 接口清单",
    modalDescription: "以下为当前环境实际开放的 CMDB 接口，适合用于资产查询、录入、更新和工具检索联调。",
  },
  "审计": {
    eyebrow: "审计追踪",
    description: "统一查看审计检索、详情与导出相关接口，便于核对留痕策略和操作追踪链路。",
    actionLabel: "查看审计接口清单",
    modalDescription: "以下为当前环境实际开放的审计接口，可用于审计查询、事件追踪与合规留痕联调。",
  },
  "自动化": {
    eyebrow: "自动化编排",
    description: "集中展示作业、审批、执行和时间线相关接口，便于端到端核对自动化流程状态。",
    actionLabel: "查看自动化接口清单",
    modalDescription: "以下为当前环境实际开放的自动化接口，适合用于作业编排、审批流、执行流与回传链路联调。",
  },
  "平台协作": {
    eyebrow: "平台协作",
    description: "统一查看代理接入、任务认领和状态上报相关接口，便于协作链路与平台集成核对。",
    actionLabel: "查看协作接口清单",
    modalDescription: "以下为当前环境实际开放的平台协作接口，可用于代理接入、任务认领和状态回传联调。",
  },
  "权限敏感路由": {
    eyebrow: "权限校验",
    description: "聚合需要重点核对权限的关键接口，便于上线前完成角色访问边界与风险回归检查。",
    actionLabel: "查看敏感路由清单",
    modalDescription: "以下为当前环境识别出的权限敏感接口，建议用于角色校验、访问边界确认和上线前风险复核。",
  },
};

function getEndpointGroupCopy(label: string) {
  return (
    ENDPOINT_GROUP_COPY[label] ?? {
      eyebrow: "接口资源",
      description: "查看当前分组下的接口清单，便于在联调阶段快速核对字段、权限和调用边界。",
      actionLabel: "查看接口清单",
      modalDescription: "以下为当前环境实际开放的接口清单，可用于联调核对与调用边界确认。",
    }
  );
}

export function ContractPage() {
  const { accessToken, baseUrl } = useAuth();
  const [state, setState] = useState<RequestState>("loading");
  const [summary, setSummary] = useState("正在同步契约工作台");
  const [workbench, setWorkbench] = useState<ContractWorkbenchResponse | null>(null);
  const [activeEndpointGroupLabel, setActiveEndpointGroupLabel] = useState<string | null>(null);
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

  const docs = workbench?.docs ?? null;
  const schemaUrl = docs ? `${normalizedBaseUrl}${docs.schema_path}` : null;
  const swaggerUrl = docs ? `${normalizedBaseUrl}${docs.swagger_path}` : null;
  const redocUrl = docs ? `${normalizedBaseUrl}${docs.redoc_path}` : null;
  const highlights = workbench?.highlights ?? [];
  const endpointGroups = workbench?.endpoint_groups ?? [];
  const hasWorkbenchPayload = Boolean(workbench && (highlights.length || endpointGroups.length || docs));
  const activeEndpointGroup = endpointGroups.find((group) => group.label === activeEndpointGroupLabel) ?? null;
  const activeEndpointGroupCopy = activeEndpointGroup ? getEndpointGroupCopy(activeEndpointGroup.label) : null;

  useEffect(() => {
    if (!activeEndpointGroupLabel) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setActiveEndpointGroupLabel(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeEndpointGroupLabel]);

  return (
    <>
      <main className="workspace-grid">
        <BorderGlow as="section" className="panel panel-span-12">
          <div className="panel-heading">
            <h2>后端契约工作台</h2>
            <p>把当前后端文档中的关键约束、只读查询面和角色敏感路由集中展示，减少前端联调时的契约漂移。</p>
          </div>

          <div className="summary-grid">
            <BorderGlow as="article" className="summary-card">
              <span>当前接入地址</span>
              <strong className="contract-break-text">{normalizedBaseUrl}</strong>
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

          {docs ? (
            <div className="actions contract-entry-actions">
              <a className="button-link" href={swaggerUrl || undefined} rel="noreferrer" target="_blank">
                打开 Swagger
              </a>
              <a className="button-link" href={redocUrl || undefined} rel="noreferrer" target="_blank">
                打开 Redoc
              </a>
              <a className="button-link button-link-ghost" href={schemaUrl || undefined} rel="noreferrer" target="_blank">
                查看 Schema JSON
              </a>
            </div>
          ) : null}

          <div className="highlight-grid">
            {highlights.map((item) => (
              <BorderGlow as="article" className="highlight-card" key={item.title}>
                <h3>{item.title}</h3>
                {item.title === "文档入口" && docs ? (
                  <>
                    <p>当前环境已完成接口文档注册，可从以下入口快速访问对应文档能力。</p>
                    <div className="contract-doc-paths">
                      <span className="contract-doc-chip">Schema {docs.schema_path}</span>
                      <span className="contract-doc-chip">Swagger {docs.swagger_path}</span>
                      <span className="contract-doc-chip">Redoc {docs.redoc_path}</span>
                    </div>
                  </>
                ) : (
                  <p>{item.body}</p>
                )}
              </BorderGlow>
            ))}
          </div>

          <div className="endpoint-grid">
            {endpointGroups.map((group) => (
              <BorderGlow as="article" className="endpoint-card endpoint-button-card" key={group.label}>
                <button
                  type="button"
                  className="endpoint-entry-button"
                  onClick={() => setActiveEndpointGroupLabel(group.label)}
                >
                  <div className="endpoint-card-header">
                    <div className="endpoint-card-copy">
                      <span className="endpoint-card-eyebrow">{getEndpointGroupCopy(group.label).eyebrow}</span>
                      <h3>{group.label}</h3>
                    </div>
                    <span className="endpoint-card-count">{group.items.length} 条</span>
                  </div>
                  <p className="endpoint-card-description">{getEndpointGroupCopy(group.label).description}</p>
                  <span className="endpoint-card-action">{getEndpointGroupCopy(group.label).actionLabel}</span>
                </button>
              </BorderGlow>
            ))}
          </div>

          {state === "success" && !hasWorkbenchPayload ? (
            <BorderGlow as="article" className="highlight-card compact-card contract-entry-card">
              <h3>暂无契约数据</h3>
              <p className="contract-break-text">当前服务尚未返回可展示的契约要点或接口资源，请先检查后端契约工作台接口输出。</p>
            </BorderGlow>
          ) : null}

          {docs ? (
            <BorderGlow as="article" className="highlight-card compact-card contract-entry-card">
              <h3>联调入口</h3>
              <p className="contract-break-text">当前页面已直接承接服务端返回的 Schema、Swagger 与 Redoc 入口，可作为接口核对与联调协作的统一起点。</p>
            </BorderGlow>
          ) : null}
        </BorderGlow>
      </main>

      {activeEndpointGroup ? (
        <div
          className="auth-modal-backdrop"
          role="presentation"
          onClick={() => setActiveEndpointGroupLabel(null)}
        >
          <BorderGlow
            as="section"
            className="panel auth-modal-card contract-endpoint-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="contract-modal-header">
              <div className="panel-heading">
                <h2>{activeEndpointGroup.label}</h2>
                <p>{activeEndpointGroupCopy?.modalDescription}</p>
              </div>
              <span className="endpoint-card-count contract-modal-count">{activeEndpointGroup.items.length} 条</span>
            </div>

            <div className="contract-modal-list-wrap">
              <ul className="contract-modal-list">
                {activeEndpointGroup.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className="actions contract-modal-actions">
              <button
                type="button"
                className="button-ghost"
                onClick={() => setActiveEndpointGroupLabel(null)}
              >
                关闭
              </button>
            </div>
          </BorderGlow>
        </div>
      ) : null}
    </>
  );
}
