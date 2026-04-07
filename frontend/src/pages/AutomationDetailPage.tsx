import { Link, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect } from "../components/GlassSelect";
import { useResourceDetail } from "../hooks/useResourceDetail";
import {
  approveJob,
  cancelJob,
  claimJob,
  completeJob,
  deleteJob,
  failJob,
  getJob,
  getJobComments,
  getJobTimeline,
  markReadyJob,
  rejectJob,
  requeueJob,
  updateJob,
} from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import type { JobCommentEntry, JobCreateInput, JobRecord, JobTimelineEntry, RequestState } from "../types";

const riskOptions = [
  { value: "low", label: "低风险" },
  { value: "medium", label: "中风险" },
  { value: "high", label: "高风险" },
];

export function AutomationDetailPage() {
  const { accessToken, baseUrl, capabilities, profile } = useAuth();
  const navigate = useNavigate();
  const { jobId } = useParams();
  const [comment, setComment] = useState("已完成当前任务复核。");
  const [agentKeyId, setAgentKeyId] = useState("");
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editRiskLevel, setEditRiskLevel] = useState<JobCreateInput["risk_level"]>("high");
  const [editPayloadText, setEditPayloadText] = useState("{\n  \n}");
  const [editState, setEditState] = useState<RequestState>("idle");
  const [editSummary, setEditSummary] = useState("在详情页内直接修订任务基础信息，保存后会自动刷新审批与执行状态。");
  const [timelineState, setTimelineState] = useState<RequestState>("idle");
  const [timelineSummary, setTimelineSummary] = useState("正在整理任务流转轨迹");
  const [timelineItems, setTimelineItems] = useState<JobTimelineEntry[]>([]);
  const [commentState, setCommentState] = useState<RequestState>("idle");
  const [commentSummary, setCommentSummary] = useState("正在整理操作备注与审批留痕");
  const [commentItems, setCommentItems] = useState<JobCommentEntry[]>([]);
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
    initialSummary: "选择任务后查看审批流转与执行详情。",
    missingTokenSummary: "请先登录后再查看自动化任务详情。",
    loadingSummary: (id) => `正在同步自动化任务 ${id} 的详细信息...`,
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
    setDetailSummary(`正在提交任务 ${job.name} 的 ${action} 操作...`);
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
      setDetailSummary(`任务 ${response.name} 已更新，当前状态为 ${getStatusLabel(response.status)}。`);
    } catch (error) {
      setDetailState("error");
      setDetailSummary(getUserFacingErrorMessage(error));
    }
  }

  useEffect(() => {
    setDeleteConfirming(false);
  }, [job?.id]);

  useEffect(() => {
    if (!job) {
      return;
    }
    setEditName(job.name);
    setEditRiskLevel(job.risk_level);
    setEditPayloadText(JSON.stringify(job.payload, null, 2));
    setEditState("idle");
    setEditSummary("在详情页内直接修订任务基础信息，保存后会自动刷新审批与执行状态。");
  }, [job?.id]);

  useEffect(() => {
    if (!accessToken || !numericJobId) {
      setTimelineItems([]);
      setCommentItems([]);
      setTimelineState("idle");
      setCommentState("idle");
      return;
    }

    let active = true;
    const currentJobId = numericJobId;
    async function loadActivityStreams() {
      setTimelineState("loading");
      setTimelineSummary("正在同步任务时间线");
      setCommentState("loading");
      setCommentSummary("正在同步操作备注");
      try {
        const [timelineResponse, commentsResponse] = await Promise.all([
          getJobTimeline(baseUrl, accessToken, currentJobId),
          getJobComments(baseUrl, accessToken, currentJobId),
        ]);
        if (!active) {
          return;
        }
        setTimelineItems(timelineResponse.items);
        setCommentItems(commentsResponse.items);
        setTimelineState("success");
        setTimelineSummary(
          timelineResponse.total ? `已同步 ${timelineResponse.total} 条任务流转记录` : "当前任务尚未形成可展示的流转时间线",
        );
        setCommentState("success");
        setCommentSummary(
          commentsResponse.total ? `已同步 ${commentsResponse.total} 条备注与留痕` : "当前任务暂无可展示的备注与审批留痕",
        );
      } catch (error) {
        if (!active) {
          return;
        }
        setTimelineState("error");
        setCommentState("error");
        const message = getUserFacingErrorMessage(error);
        setTimelineSummary(message);
        setCommentSummary(message);
      }
    }

    void loadActivityStreams();
    return () => {
      active = false;
    };
  }, [accessToken, baseUrl, numericJobId, job?.updated_at]);

  async function handleDeleteJob() {
    if (!accessToken || !job) {
      return;
    }
    if (job.status === "claimed") {
      return;
    }
    if (!deleteConfirming) {
      setDeleteConfirming(true);
      return;
    }

    setDetailState("loading");
    setDetailSummary(`正在删除任务 ${job.name}...`);
    try {
      await deleteJob(baseUrl, accessToken, job.id);
      navigate("/automation", {
        replace: true,
        state: {
          flashMessage: `任务 ${job.name} 已删除，可继续处理其余自动化任务。`,
          flashState: "success",
        },
      });
    } catch (error) {
      setDeleteConfirming(false);
      setDetailState("error");
      setDetailSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleUpdateJob() {
    if (!accessToken || !job) {
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(editPayloadText) as Record<string, unknown>;
    } catch {
      setEditState("error");
      setEditSummary("任务载荷 JSON 校验失败，请先修正内容格式后再保存。");
      return;
    }

    setEditState("loading");
    setEditSummary(`正在保存任务 ${job.name} 的基础信息...`);
    try {
      const response = await updateJob(baseUrl, accessToken, job.id, {
        name: editName,
        status: job.status,
        risk_level: editRiskLevel,
        payload,
      });
      setJob(response);
      setEditState("success");
      setEditSummary(`任务 ${response.name} 的基础信息已更新。`);
      setEditOpen(false);
    } catch (error) {
      setEditState("error");
      setEditSummary(getUserFacingErrorMessage(error));
    }
  }

  const canAct =
    capabilities.canApproveAutomation &&
    job &&
    job.approval_status === "pending" &&
    job.approval_requested_by !== profile?.id;
  const canMarkReady =
    capabilities.canExecuteAutomation &&
    job &&
    job.status === "draft" &&
    ((job.risk_level === "high" && job.approval_status === "approved") ||
      (job.risk_level !== "high" && job.approval_status === "not_required"));
  const canClaim = capabilities.canExecuteAutomation && job && job.status === "ready";
  const canComplete = capabilities.canExecuteAutomation && job && job.status === "claimed";
  const canCancel = capabilities.canExecuteAutomation && job && (job.status === "ready" || job.status === "claimed");
  const canRequeue = capabilities.canExecuteAutomation && job && (job.status === "claimed" || job.status === "failed");
  const canDelete = capabilities.canWriteAutomation && job && job.status !== "claimed";
  const canEdit = capabilities.canWriteAutomation && job && job.status !== "claimed";
  const approveTooltip = canAct
    ? "审批通过后，高风险任务可继续进入后续处理流程。"
    : !capabilities.canApproveAutomation
      ? "当前账号未开通审批权限，不能执行审批通过。"
    : job?.approval_status !== "pending"
      ? "当前任务不处于待审批状态，无法执行审批通过。"
      : "申请人与审批人为同一账号时，不能直接执行审批通过。";
  const rejectTooltip = canAct
    ? "驳回当前申请，并保留审批意见供后续复核。"
    : !capabilities.canApproveAutomation
      ? "当前账号未开通审批权限，不能执行驳回申请。"
    : job?.approval_status !== "pending"
      ? "当前任务不处于待审批状态，无法执行驳回申请。"
      : "申请人与审批人为同一账号时，不能直接执行驳回申请。";
  const markReadyTooltip = canMarkReady
    ? "将任务流转到待执行状态，等待人工或执行器接手。"
    : !capabilities.canExecuteAutomation
      ? "当前账号未开通执行权限，不能转入待执行。"
    : job?.status !== "draft"
      ? "只有草稿状态任务才能转入待执行。"
      : job?.risk_level === "high"
        ? "高风险任务需先审批通过，才能转入待执行。"
        : "当前任务尚未满足转入待执行的条件。";
  const claimTooltip = canClaim
    ? "由当前处理人接手任务；如有需要，可同时绑定执行器 ID。"
    : !capabilities.canExecuteAutomation
      ? "当前账号未开通执行权限，不能接手任务。"
      : "只有待执行状态任务才能接手执行。";
  const completeTooltip = canComplete
    ? "确认任务已处理完成，并记录最终执行结果。"
    : !capabilities.canExecuteAutomation
      ? "当前账号未开通执行权限，不能完成任务。"
      : "只有已认领任务才能标记为完成执行。";
  const failTooltip = canComplete
    ? "登记本次执行失败，用于保留状态并支持后续重试。"
    : !capabilities.canExecuteAutomation
      ? "当前账号未开通执行权限，不能登记失败。"
      : "只有已认领任务才能登记执行失败。";
  const cancelTooltip = canCancel
    ? "终止当前任务，停止后续执行与流转。"
    : !capabilities.canExecuteAutomation
      ? "当前账号未开通执行权限，不能终止任务。"
      : "只有待执行或已认领任务才能终止。";
  const requeueTooltip = canRequeue
    ? "将任务重新放回处理队列，等待再次执行。"
    : !capabilities.canExecuteAutomation
      ? "当前账号未开通执行权限，不能重新调度任务。"
      : "只有已认领或失败任务才能重新调度。";
  const deleteTooltip = canDelete
    ? deleteConfirming
      ? "再次点击将永久删除当前任务，并在完成后返回自动化列表。"
      : "删除当前任务。首次点击进入确认状态，避免误删。"
    : !capabilities.canWriteAutomation
      ? "当前账号未开通任务写入权限，不能删除任务。"
    : "已认领任务不能删除，请先按既有流程完成、登记失败、终止或重新调度。";
  const cancelDeleteTooltip = "退出删除确认状态，保留当前任务。";
  const editTooltip = canEdit
    ? "维护任务名称、风险等级与任务载荷，保存后系统会自动重新计算审批流转。"
    : !capabilities.canWriteAutomation
      ? "当前账号未开通任务写入权限，不能编辑任务。"
      : "已认领任务不能编辑，请先完成、登记失败、终止或重新调度。";
  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-12">
        <div className="panel-heading">
          <h2>自动化任务详情</h2>
          <p>集中展示单条任务的审批流转、执行状态、处理结果与执行器信息，便于在同一页面内完成任务复核与状态跟进。</p>
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
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-8">
        {job ? (
          <div className="detail-shell">
            <div className="summary-grid">
              <BorderGlow as="article" className="summary-card">
                <span>任务名称</span>
                <strong>{job.name}</strong>
                <small>执行状态：{getStatusLabel(job.status)}</small>
              </BorderGlow>
              <BorderGlow as="article" className="summary-card">
                <span>风险与审批</span>
                <strong>{getRiskLabel(job.risk_level)}</strong>
                <small>审批状态：{getApprovalLabel(job.approval_status)}</small>
              </BorderGlow>
              <BorderGlow as="article" className="summary-card">
                <span>申请人</span>
                <strong>{job.approval_requested_by_username || "未记录"}</strong>
                <small>
                  申请时间：{job.approval_requested_at ? formatDateTime(job.approval_requested_at) : "未记录"}
                </small>
              </BorderGlow>
              <BorderGlow as="article" className="summary-card">
                <span>更新信息</span>
                <strong>{formatDateTime(job.updated_at)}</strong>
                <small>创建于：{formatDateTime(job.created_at)}</small>
              </BorderGlow>
              <BorderGlow as="article" className="summary-card">
                <span>执行器绑定</span>
                <strong>{job.assigned_agent_key_id || "未绑定"}</strong>
                <small>最近上报：{job.last_reported_by_agent_key || "未记录"}</small>
              </BorderGlow>
            </div>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>任务载荷</h3>
              <pre className="json-block">{JSON.stringify(job.payload, null, 2)}</pre>
            </BorderGlow>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>执行轨迹</h3>
              <dl className="profile-card execution-track-grid">
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
            </BorderGlow>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>执行结果</h3>
              <p>{job.execution_summary || "当前任务暂未同步执行摘要。"}</p>
              <pre className="json-block">{JSON.stringify(job.execution_metadata, null, 2)}</pre>
            </BorderGlow>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>任务时间线</h3>
              <p className={`status ${timelineState}`}>{timelineSummary}</p>
              {timelineItems.length ? (
                <div className="timeline-list">
                  {timelineItems.map((item) => (
                    <div className="timeline-item" key={item.audit_id}>
                      <span className="timeline-point" aria-hidden="true" />
                      <div className="timeline-body">
                        <div className="timeline-header">
                          <strong>{item.label}</strong>
                          <span>{formatDateTime(item.created_at)}</span>
                        </div>
                        <p>{item.actor_name}</p>
                        <small>{item.summary || "已完成该节点流转"}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>当前任务尚未形成可展示的流转时间线。</p>
              )}
            </BorderGlow>
          </div>
        ) : (
          <p className="status idle">当前未加载到任务详情，请返回列表重新选择目标任务。</p>
        )}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4">
        {job ? (
          <div className="stack-grid">
            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>操作备注</h3>
              <p className={`status ${commentState}`}>{commentSummary}</p>
              {commentItems.length ? (
                <div className="timeline-list">
                  {commentItems.map((item) => (
                    <div className="timeline-item" key={item.audit_id}>
                      <span className="timeline-point" aria-hidden="true" />
                      <div className="timeline-body">
                        <div className="timeline-header">
                          <strong>{item.label}</strong>
                          <span>{formatDateTime(item.created_at)}</span>
                        </div>
                        <p>{item.actor_name}</p>
                        <small>{item.message}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p>当前任务暂无可展示的备注信息。</p>
              )}
            </BorderGlow>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>任务编辑</h3>
              <p>仅在任务未被认领时开放基础信息维护。风险等级变更后，系统会按后端规则重新判断审批状态与执行起点。</p>
              <div className="actions">
                <span className="action-tooltip" data-tooltip={editTooltip}>
                  <button
                    className={canEdit ? undefined : "button-ghost"}
                    disabled={!canEdit}
                    onClick={() => setEditOpen((current) => !current)}
                    type="button"
                  >
                    {editOpen ? "收起编辑" : "编辑任务"}
                  </button>
                </span>
              </div>

              {editOpen ? (
                <div className="stack-grid">
                  <label className="field">
                    <span>任务名称</span>
                    <input value={editName} onChange={(event) => setEditName(event.target.value)} />
                  </label>
                  <div className="field">
                    <span>风险等级</span>
                    <GlassSelect
                      options={riskOptions}
                      value={editRiskLevel}
                      onChange={(value) => setEditRiskLevel(value as JobCreateInput["risk_level"])}
                    />
                  </div>
                  <label className="field">
                    <span>任务载荷 JSON</span>
                    <textarea
                      className="code-input"
                      rows={8}
                      value={editPayloadText}
                      onChange={(event) => setEditPayloadText(event.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <button onClick={() => void handleUpdateJob()} type="button">
                      保存任务
                    </button>
                    <button className="button-ghost" onClick={() => setEditOpen(false)} type="button">
                      取消编辑
                    </button>
                  </div>
                  <p className={`status ${editState}`}>{editSummary}</p>
                </div>
              ) : null}
            </BorderGlow>

            <BorderGlow as="article" className="highlight-card compact-card">
              <h3>操作面板</h3>
              <label className="field">
                <span>操作备注</span>
                <textarea
                  className="detail-comment-input"
                  rows={4}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                />
              </label>
              <label className="field">
                <span>执行器 ID（认领时选填）</span>
                <input value={agentKeyId} onChange={(event) => setAgentKeyId(event.target.value)} />
              </label>
              <div className="actions detail-actions">
                <span className="action-tooltip" data-tooltip={approveTooltip}>
                  <button className={canAct ? undefined : "button-ghost"} disabled={!canAct} onClick={() => void handleAction("approve")} type="button">
                    通过审批
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={rejectTooltip}>
                  <button className={canAct ? undefined : "button-ghost"} disabled={!canAct} onClick={() => void handleAction("reject")} type="button">
                    驳回申请
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={markReadyTooltip}>
                  <button className={canMarkReady ? undefined : "button-ghost"} disabled={!canMarkReady} onClick={() => void handleAction("mark-ready")} type="button">
                    转入待执行
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={claimTooltip}>
                  <button className={canClaim ? undefined : "button-ghost"} disabled={!canClaim} onClick={() => void handleAction("claim")} type="button">
                    接手执行
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={completeTooltip}>
                  <button className={canComplete ? undefined : "button-ghost"} disabled={!canComplete} onClick={() => void handleAction("complete")} type="button">
                    完成执行
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={failTooltip}>
                  <button className={canComplete ? undefined : "button-ghost"} disabled={!canComplete} onClick={() => void handleAction("fail")} type="button">
                    登记失败
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={cancelTooltip}>
                  <button className={canCancel ? undefined : "button-ghost"} disabled={!canCancel} onClick={() => void handleAction("cancel")} type="button">
                    终止任务
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={requeueTooltip}>
                  <button className={canRequeue ? undefined : "button-ghost"} disabled={!canRequeue} onClick={() => void handleAction("requeue")} type="button">
                    重新调度
                  </button>
                </span>
                <span className="action-tooltip" data-tooltip={deleteTooltip}>
                  <button
                    className={deleteConfirming ? "button-danger-soft" : canDelete ? undefined : "button-ghost"}
                    disabled={!canDelete}
                    onClick={() => void handleDeleteJob()}
                    type="button"
                  >
                    {deleteConfirming ? "确认删除" : "删除任务"}
                  </button>
                </span>
                {deleteConfirming ? (
                  <span className="action-tooltip" data-tooltip={cancelDeleteTooltip}>
                    <button onClick={() => setDeleteConfirming(false)} type="button">
                      取消删除
                    </button>
                  </span>
                ) : null}
              </div>
              <p className="status idle">
                {job.status === "draft"
                  ? (
                    <>
                      草稿任务在满足条件后可进入就绪状态；
                      <br />
                      高风险任务需先完成审批。
                    </>
                  )
                  : job.status === "ready"
                    ? "就绪任务可由人工认领，也可在认领时同步绑定执行器 ID。"
                    : job.status === "claimed"
                      ? "已认领任务可继续推进为完成、失败、取消或重新排队，具体权限以服务端校验结果为准。"
                      : job.status === "failed"
                      ? "失败任务可重新排队，重新进入后续执行流程。"
                      : "审批与执行动作会根据当前任务状态动态开放。"}
              </p>
            </BorderGlow>
          </div>
        ) : null}
      </BorderGlow>
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
