import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { getUserFacingErrorMessage } from "../lib/errors";
import { getHealth } from "../lib/api";
import type { RequestState } from "../types";

export function OverviewPage() {
  const { baseUrl, capabilities, profile } = useAuth();
  const [healthState, setHealthState] = useState<RequestState>("loading");
  const [healthSummary, setHealthSummary] = useState("正在同步工作区服务状态...");

  useEffect(() => {
    let active = true;

    async function syncHealth() {
      setHealthState("loading");
      setHealthSummary("正在同步工作区服务状态...");
      try {
        const response = await getHealth(baseUrl);
        if (!active) {
          return;
        }
        setHealthState("success");
        setHealthSummary(`工作区服务正常，已返回 ${Object.keys(response).length} 个状态字段。`);
      } catch (error) {
        if (!active) {
          return;
        }
        setHealthState("error");
        setHealthSummary(getUserFacingErrorMessage(error));
      }
    }

    void syncHealth();
    return () => {
      active = false;
    };
  }, [baseUrl]);

  const serviceLabel =
    healthState === "success" ? "服务在线" : healthState === "error" ? "连接异常" : "同步中";

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8">
        <div className="panel-heading">
          <h2>工作台总览</h2>
          <p>集中呈现当前身份、平台服务状态与核心业务入口，便于进入系统后快速建立上下文并开展当日运维工作。</p>
        </div>

        <div className="summary-grid">
          <BorderGlow as="article" className="summary-card">
            <span>当前账号</span>
            <strong>{profile?.display_name || profile?.username || "未登录"}</strong>
            <small>{profile?.email || "完成登录后，可查看当前账号信息及对应访问权限。"}</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>平台状态</span>
            <strong>{serviceLabel}</strong>
            <small>{healthSummary}</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>常用入口</span>
            <strong>资源、任务、记录</strong>
            <small>从常用入口快速进入核心页面，持续处理当日运维事项。</small>
          </BorderGlow>
        </div>

        <div className="actions">
          <Link className="button-link" to="/servers">
            查看服务器
          </Link>
          <Link className="button-link" to="/automation">
            查看任务
          </Link>
          {capabilities.canReadAudit ? (
            <Link className="button-link" to="/audit">
              查看记录
            </Link>
          ) : null}
        </div>
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4">
        <div className="panel-heading">
          <h2>使用指引</h2>
          <p>建议按照资源核查、任务流转、记录追溯的顺序使用平台功能，以便在统一界面内完成日常操作闭环。</p>
        </div>

        <div className="stack-grid">
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>资源核查</h3>
            <p>优先进入服务器页面，快速确认资产分布、主机状态与当前可用资源概况。</p>
          </BorderGlow>
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>任务流转</h3>
            <p>在自动化页面发起任务、跟踪执行进度，并统一查看处理结果与反馈信息。</p>
          </BorderGlow>
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>记录追溯</h3>
            <p>通过记录页面回看关键操作留痕，支持对近期变更、处理过程与结果进行复核。</p>
          </BorderGlow>
        </div>
      </BorderGlow>
    </main>
  );
}
