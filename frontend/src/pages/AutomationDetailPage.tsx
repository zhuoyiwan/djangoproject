import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "../app/auth";
import { useResourceDetail } from "../hooks/useResourceDetail";
import {
  approveJob,
  cancelJob,
  claimJob,
  completeJob,
  failJob,
  getJob,
  markReadyJob,
  rejectJob,
  requeueJob,
} from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import type { JobRecord } from "../types";

export function AutomationDetailPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const { jobId } = useParams();
  const [comment, setComment] = useState("已在详情页完成复核。");
  const [agentKeyId, setAgentKeyId] = useState("");
  const numericJobId = jobId ? Number(jobId) : null;
  const {
    item: job,
    setItem: setJob,
    setState: setDetailState,
    state: detailState,
    setSummary: setDetailSummary,
    summary: detailSummary,
    refresh: refreshJob,
  } = useResourceDetail<JobRecord>({
    accessToken,
    resourceId: numericJobId,
    initialSummary: "选择一条任务后查看审批与执行详情。",
    missingTokenSummary: "请先登录后再查看自动化任务详情。",
    loadingSummary: (id) => `正在加载自动化任务 ${id} 的详情...`,
    successSummary: (response) => `已加载任务 ${response.name}，当前审批状态为 ${getApprovalLabel(response.approval_status)}。`,
    fetcher: (token, id) => getJob(baseUrl, token, id),
  });

  async function handleAction(
    action: "approve" | "reject" | "mark-ready" | "claim" | "complete" | "fail" | "cancel" | "requeue",
  ) {
    if (!accessToken || !job) {
      return;
    }
    setDetailState("loading");
    setDetailSummary(`正在处理 ${job.name} 的 ${action} 操作...`);
    try {
      const response =
        action === "approve"
          ? await approveJob(baseUrl, accessToken, job.id, comment)
          : action === "reject"
            ? await rejectJob(baseUrl, accessToken, job.id, comment)
            : action === "mark-ready"
              ? await markReadyJob(baseUrl, accessToken, job.id, comment)
              : action === "claim"
                ? await claimJob(baseUrl, accessToken, job.id, comment, agentKeyId.trim() || undefined)
                : action === "complete"
                  ? await completeJob(baseUrl, accessToken, job.id, comment)
                  : action === "fail"
                    ? await failJob(baseUrl, accessToken, job.id, comment)
                    : action === "cancel"
                      ? await cancelJob(baseUrl, accessToken, job.id, comment)
                      : await requeueJob(baseUrl, accessToken, job.id, comment);
      setJob(response);
      setDetailState("success");
      setDetailSummary(`任务 ${response.name} 已更新为 ${getStatusLabel(response.status)}。`);
    } catch (error) {
      setDetailState("error");
      setDetailSummary(getUserFacingErrorMessage(error));
    }
  }

  const canAct =
    job &&
    job.approval_status === "pending" &&
    job.approval_requested_by !== profile?.id;
  const canMarkReady =
    job &&
    job.status === "draft" &&
    ((job.risk_level === "high" && job.approval_status === "approved") ||
      (job.risk_level !== "high" && job.approval_status === "not_required"));
  const canClaim = job && job.status === "ready";
  const canComplete = job && job.status === "claimed";
  const canCancel = job && (job.status === "ready" || job.status === "claimed");
  const canRequeue = job && (job.status === "claimed" || job.status === "failed");

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>自动化任务详情</h2>
          <p>围绕审批、执行状态、执行结果和运行器绑定信息，对单条任务进行完整审阅。</p>
        </div>
        <div className="actions">
          <Link className="button-link button-link-ghost" to="/automation">
            返回自动化列表
          </Link>
          <button onClick={() => void refreshJob()} type="button">
            刷新详情
          </button>
        </div>
        <p className={`status ${detailState}`}>{detailSummary}</p>
      </section>

      <section className="panel panel-span-8">
        {job ? (
          <div className="detail-shell">
            <div className="summary-grid">
              <article className="summary-card">
                <span>任务名称</span>
                <strong>{job.name}</strong>
                <small>执行状态：{getStatusLabel(job.status)}</small>
              </article>
              <article className="summary-card">
                <span>风险与审批</span>
                <strong>{getRiskLabel(job.risk_level)}</strong>
                <small>审批状态：{getApprovalLabel(job.approval_status)}</small>
              </article>
              <article className="summary-card">
                <span>申请人</span>
                <strong>{job.approval_requested_by_username || "未记录"}</strong>
                <small>
                  申请时间：{job.approval_requested_at ? formatDateTime(job.approval_requested_at) : "未记录"}
                </small>
              </article>
              <article className="summary-card">
                <span>更新信息</span>
                <strong>{formatDateTime(job.updated_at)}</strong>
                <small>创建于：{formatDateTime(job.created_at)}</small>
              </article>
              <article className="summary-card">
                <span>运行器绑定</span>
                <strong>{job.assigned_agent_key_id || "未绑定"}</strong>
                <small>最近上报：{job.last_reported_by_agent_key || "未记录"}</small>
              </article>
            </div>

            <article className="highlight-card compact-card">
              <h3>任务载荷</h3>
              <pre className="json-block">{JSON.stringify(job.payload, null, 2)}</pre>
            </article>

            <article className="highlight-card compact-card">
              <h3>执行轨迹</h3>
              <dl className="profile-card">
                <div>
                  <dt>就绪人</dt>
                  <dd>{job.ready_by_username || "未记录"}</dd>
                </div>
                <div>
                  <dt>就绪时间</dt>
                  <dd>{formatDateTime(job.ready_at)}</dd>
                </div>
                <div>
                  <dt>认领人</dt>
                  <dd>{job.claimed_by_username || "未记录"}</dd>
                </div>
                <div>
                  <dt>认领时间</dt>
                  <dd>{formatDateTime(job.claimed_at)}</dd>
                </div>
                <div>
                  <dt>完成时间</dt>
                  <dd>{formatDateTime(job.completed_at)}</dd>
                </div>
                <div>
                  <dt>失败时间</dt>
                  <dd>{formatDateTime(job.failed_at)}</dd>
                </div>
              </dl>
            </article>

            <article className="highlight-card compact-card">
              <h3>执行结果</h3>
              <p>{job.execution_summary || "暂未记录执行摘要。"}</p>
              <pre className="json-block">{JSON.stringify(job.execution_metadata, null, 2)}</pre>
            </article>
          </div>
        ) : (
          <p className="status idle">当前没有加载到任务。</p>
        )}
      </section>

      <section className="panel panel-span-4">
        {job ? (
          <div className="stack-grid">
            <article className="highlight-card compact-card">
              <h3>审批轨迹</h3>
              <p>批准人：{job.approved_by_username || "未记录"}</p>
              <p>拒绝人：{job.rejected_by_username || "未记录"}</p>
              <p>审批备注：{job.approval_comment || "暂未记录。"}</p>
            </article>

            <article className="highlight-card compact-card">
              <h3>操作面板</h3>
              <label className="field">
                <span>操作备注</span>
                <textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <label className="field">
                <span>运行器 Key ID（认领时可选）</span>
                <input value={agentKeyId} onChange={(event) => setAgentKeyId(event.target.value)} />
              </label>
              <div className="actions">
                <button disabled={!canAct} onClick={() => void handleAction("approve")} type="button">
                  批准
                </button>
                <button className="button-ghost" disabled={!canAct} onClick={() => void handleAction("reject")} type="button">
                  拒绝
                </button>
                <button disabled={!canMarkReady} onClick={() => void handleAction("mark-ready")} type="button">
                  标记就绪
                </button>
                <button className="button-ghost" disabled={!canClaim} onClick={() => void handleAction("claim")} type="button">
                  认领执行
                </button>
                <button disabled={!canComplete} onClick={() => void handleAction("complete")} type="button">
                  标记完成
                </button>
                <button className="button-ghost" disabled={!canComplete} onClick={() => void handleAction("fail")} type="button">
                  标记失败
                </button>
                <button className="button-ghost" disabled={!canCancel} onClick={() => void handleAction("cancel")} type="button">
                  取消任务
                </button>
                <button className="button-ghost" disabled={!canRequeue} onClick={() => void handleAction("requeue")} type="button">
                  重新排队
                </button>
              </div>
              <p className="status idle">
                {job.status === "draft"
                  ? "草稿任务满足契约条件后可标记为就绪；高风险任务需先批准。"
                  : job.status === "ready"
                    ? "就绪任务可由人工认领，也可在认领时绑定运行器 Key。"
                    : job.status === "claimed"
                      ? "已认领任务可完成、失败、取消或重新排队。权限最终由后端校验。"
                      : job.status === "failed"
                        ? "失败任务可以重新排队回到待执行状态。"
                        : "审批和执行动作会根据当前状态动态生效。"}
              </p>
            </article>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function getStatusLabel(status: JobRecord["status"]) {
  const labels: Record<JobRecord["status"], string> = {
    draft: "草稿",
    awaiting_approval: "待审批",
    ready: "待执行",
    claimed: "已认领",
    completed: "已完成",
    failed: "失败",
    canceled: "已取消",
  };
  return labels[status];
}

function getApprovalLabel(status: JobRecord["approval_status"]) {
  const labels: Record<JobRecord["approval_status"], string> = {
    not_required: "无需审批",
    pending: "审批中",
    approved: "已批准",
    rejected: "已拒绝",
  };
  return labels[status];
}

function getRiskLabel(risk: JobRecord["risk_level"]) {
  const labels: Record<JobRecord["risk_level"], string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险",
  };
  return labels[risk];
}
