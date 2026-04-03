import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { getUserFacingErrorMessage } from "../lib/errors";
import { getHealth } from "../lib/api";
import type { RequestState } from "../types";

export function OverviewPage() {
  const { baseUrl, profile } = useAuth();
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
          <p>把登录状态、服务可用性和常用入口放在同一屏，进入系统后可以立刻开始日常操作。</p>
        </div>

        <div className="summary-grid">
          <BorderGlow as="article" className="summary-card">
            <span>当前身份</span>
            <strong>{profile?.display_name || profile?.username || "未登录"}</strong>
            <small>{profile?.email || "登录后可查看完整个人信息。"}</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>服务状态</span>
            <strong>{serviceLabel}</strong>
            <small>{healthSummary}</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>今日入口</span>
            <strong>资源、任务、记录</strong>
            <small>从下方入口直接进入对应页面。</small>
          </BorderGlow>
        </div>

        <div className="actions">
          <Link className="button-link" to="/servers">
            查看服务器
          </Link>
          <Link className="button-link" to="/automation">
            查看任务
          </Link>
          <Link className="button-link" to="/audit">
            查看记录
          </Link>
        </div>
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4">
        <div className="panel-heading">
          <h2>使用指引</h2>
          <p>首页只保留最常用的使用路径，避免把联调和系统内部概念暴露给普通使用者。</p>
        </div>

        <div className="stack-grid">
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>先看资源</h3>
            <p>服务器页适合快速浏览当前资产与机器状态。</p>
          </BorderGlow>
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>再提任务</h3>
            <p>自动化页聚焦任务创建、进度查看和结果跟踪。</p>
          </BorderGlow>
          <BorderGlow as="article" className="highlight-card compact-card">
            <h3>最后回看记录</h3>
            <p>操作记录页可以帮助回溯近期系统内的重要变化。</p>
          </BorderGlow>
        </div>
      </BorderGlow>
    </main>
  );
}
