import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { formatDateTimeZh } from "../lib/format";
import { getUserFacingErrorMessage } from "../lib/errors";
import { getAgentRunnerOverview, getHealth, getOverviewSummary } from "../lib/api";
import type { AgentRunnerItem, AgentRunnerOverviewResponse, OverviewSummaryResponse, RequestState } from "../types";

export function OverviewPage() {
  const { accessToken, baseUrl, capabilities, profile } = useAuth();
  const [healthState, setHealthState] = useState<RequestState>("loading");
  const [healthSummary, setHealthSummary] = useState("正在同步工作区服务状态...");
  const [overviewSummary, setOverviewSummary] = useState<OverviewSummaryResponse["summary"] | null>(null);
  const [overviewHint, setOverviewHint] = useState("正在汇总资产、任务与审计摘要...");
  const [agentRunnerSummary, setAgentRunnerSummary] = useState<AgentRunnerOverviewResponse["summary"] | null>(null);
  const [agentRunnerItems, setAgentRunnerItems] = useState<AgentRunnerItem[]>([]);

  useEffect(() => {
    let active = true;

    async function syncHealth() {
      setHealthState("loading");
      setHealthSummary("正在同步工作区服务状态...");
      setOverviewHint("正在汇总资产、任务与审计摘要...");
      try {
        const [healthResponse, summaryResponse, runnerResponse] = await Promise.all([
          getHealth(baseUrl),
          accessToken ? getOverviewSummary(baseUrl, accessToken) : Promise.resolve(null),
          accessToken ? getAgentRunnerOverview(baseUrl, accessToken) : Promise.resolve(null),
        ]);
        if (!active) {
          return;
        }
        setHealthState(healthResponse.status === "ok" ? "success" : "error");
        setHealthSummary(
          healthResponse.status === "ok"
            ? `数据库与缓存状态正常，Agent 能力开关已完成装载。`
            : `服务处于降级状态，数据库为 ${healthResponse.checks.database.status}，缓存为 ${healthResponse.checks.cache.status}。`,
        );

        if (summaryResponse) {
          setOverviewSummary(summaryResponse.summary);
          setOverviewHint(
            `当前共纳管 ${summaryResponse.summary.servers.total} 台服务器、${summaryResponse.summary.automation.total} 个任务，近 24 小时新增 ${summaryResponse.summary.audit.last_24h} 条记录。`,
          );
        } else {
          setOverviewSummary(null);
          setOverviewHint("登录后可加载当前工作区的聚合统计信息。");
        }

        if (runnerResponse) {
          setAgentRunnerSummary(runnerResponse.summary);
          setAgentRunnerItems(runnerResponse.items);
        } else {
          setAgentRunnerSummary(null);
          setAgentRunnerItems([]);
        }
      } catch (error) {
        if (!active) {
          return;
        }
        setHealthState("error");
        setHealthSummary(getUserFacingErrorMessage(error));
        setOverviewHint(getUserFacingErrorMessage(error));
        setAgentRunnerSummary(null);
        setAgentRunnerItems([]);
      }
    }

    void syncHealth();
    return () => {
      active = false;
    };
  }, [accessToken, baseUrl]);

  const serviceLabel =
    healthState === "success" ? "服务在线" : healthState === "error" ? "降级运行" : "同步中";

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
            <span>工作区摘要</span>
            <strong>
              {overviewSummary ? `${overviewSummary.servers.total} 台资产 / ${overviewSummary.automation.total} 个任务` : "等待汇总"}
            </strong>
            <small>
              {overviewHint}
              {agentRunnerSummary ? ` 当前执行器通道 ${agentRunnerSummary.available}/${agentRunnerSummary.total} 可用。` : ""}
            </small>
          </BorderGlow>
        </div>

        <div className="summary-grid overview-summary-secondary">
          <BorderGlow as="article" className="summary-card">
            <span>服务器概况</span>
            <strong>
              {overviewSummary
                ? `${overviewSummary.servers.online} 在线 / ${overviewSummary.servers.maintenance} 维护`
                : "等待汇总"}
            </strong>
            <small>离线 {overviewSummary?.servers.offline ?? 0} 台，预分配 {overviewSummary?.servers.pre_allocated ?? 0} 台。</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>任务态势</span>
            <strong>
              {overviewSummary
                ? `${overviewSummary.automation.ready} 待执行 / ${overviewSummary.automation.awaiting_approval} 待审批`
                : "等待汇总"}
            </strong>
            <small>认领中 {overviewSummary?.automation.claimed ?? 0} 个，高风险待批 {overviewSummary?.automation.high_risk_pending ?? 0} 个。</small>
          </BorderGlow>
          <BorderGlow as="article" className="summary-card">
            <span>审计留痕</span>
            <strong>
              {overviewSummary ? `24h 内 ${overviewSummary.audit.last_24h} 条` : "等待汇总"}
            </strong>
            <small>其中安全事件 {overviewSummary?.audit.security_events_last_24h ?? 0} 条。</small>
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

      <BorderGlow as="section" className="panel panel-span-12">
        <div className="panel-heading">
          <h2>执行器通道</h2>
          <p>集中查看机器上报、任务认领与执行回报通道的配置状态，便于值班期间快速确认执行侧链路是否可用。</p>
        </div>

        <p className={`status ${healthState}`}>
          {agentRunnerSummary
            ? `当前共 ${agentRunnerSummary.total} 条执行器通道，其中 ${agentRunnerSummary.available} 条可用`
            : accessToken
              ? "当前未同步到执行器通道信息"
              : "登录后可查看执行器通道状态"}
        </p>

        {agentRunnerItems.length ? (
          <div className="query-result-grid query-result-grid-compact">
            {agentRunnerItems.map((item) => (
              <BorderGlow as="article" className="tool-result-card tool-result-card-compact" key={`${item.channel}-${item.key_id}`}>
                <div className="tool-result-header">
                  <div>
                    <h3>{getRunnerChannelLabel(item.channel)}</h3>
                    <div className="tool-result-meta">
                      <span className={`pill ${item.available ? "approved" : "neutral"}`}>
                        {item.available ? "可用" : "待配置"}
                      </span>
                      <span className="pill neutral">{item.key_id}</span>
                    </div>
                  </div>
                </div>
                <dl className="tool-result-list">
                  <div>
                    <dt>能力开关</dt>
                    <dd>{item.feature_enabled ? "已启用" : "未启用"}</dd>
                  </div>
                  <div>
                    <dt>密钥配置</dt>
                    <dd>{item.configured ? "已装载" : "未装载"}</dd>
                  </div>
                  <div>
                    <dt>活跃任务</dt>
                    <dd>{item.active_jobs}</dd>
                  </div>
                  <div>
                    <dt>最近活动</dt>
                    <dd>{item.last_seen_at ? formatDateTimeZh(item.last_seen_at) : "未记录"}</dd>
                  </div>
                  <div>
                    <dt>最近状态</dt>
                    <dd>{getRunnerStatusLabel(item.last_status)}</dd>
                  </div>
                </dl>
              </BorderGlow>
            ))}
          </div>
        ) : null}
      </BorderGlow>
    </main>
  );
}

function getRunnerChannelLabel(channel: AgentRunnerItem["channel"]) {
  const labels: Record<AgentRunnerItem["channel"], string> = {
    server_ingest: "机器上报",
    automation_claim: "任务认领",
    automation_report: "执行回报",
  };
  return labels[channel];
}

function getRunnerStatusLabel(status: string) {
  const labels: Record<string, string> = {
    ingested: "已接收上报",
    ingested_created: "已创建资产",
    ingested_updated: "已更新资产",
    claimed: "已完成认领",
    reported_completed: "已回报完成",
    reported_failed: "已回报失败",
  };
  return labels[status] || (status ? status : "未记录");
}
