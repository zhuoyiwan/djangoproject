import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app/auth";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { approveJob, createJob, getJobs, rejectJob } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { JobCreateInput, JobExecutionStatus, JobQuery, JobRecord } from "../types";

const initialQuery: JobQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "20",
  status: "",
  risk_level: "",
  approval_status: "",
};

const statusOptions = [
  { value: "", label: "全部执行状态" },
  { value: "draft", label: "草稿" },
  { value: "awaiting_approval", label: "待审批" },
  { value: "ready", label: "待执行" },
  { value: "claimed", label: "已认领" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "canceled", label: "已取消" },
];

const riskOptions = [
  { value: "", label: "全部风险等级" },
  { value: "low", label: "低风险" },
  { value: "medium", label: "中风险" },
  { value: "high", label: "高风险" },
];

const approvalOptions = [
  { value: "", label: "全部审批状态" },
  { value: "not_required", label: "无需审批" },
  { value: "pending", label: "审批中" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已拒绝" },
];

const jobStatusLabelMap: Record<string, string> = {
  draft: "草稿",
  awaiting_approval: "待审批",
  ready: "待执行",
  claimed: "已认领",
  completed: "已完成",
  failed: "失败",
  canceled: "已取消",
};

const approvalStatusLabelMap: Record<string, string> = {
  not_required: "无需审批",
  pending: "审批中",
  approved: "已批准",
  rejected: "已拒绝",
};

const riskLabelMap: Record<string, string> = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
};

type JobFormState = {
  name: string;
  status: JobExecutionStatus;
  risk_level: JobCreateInput["risk_level"];
  payloadText: string;
};

const initialForm: JobFormState = {
  name: "restart-prod",
  status: "draft",
  risk_level: "high",
  payloadText: '{\n  "target": "prod-web-01",\n  "change_window": "maintenance-window-a"\n}',
};

function getJobStatusLabel(status: string) {
  return jobStatusLabelMap[status] || status;
}

function getApprovalStatusLabel(status: string) {
  return approvalStatusLabelMap[status] || status;
}

function getRiskLabel(risk: string) {
  return riskLabelMap[risk] || risk;
}

export function AutomationPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const [query, setQuery] = useState<JobQuery>(initialQuery);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState("已复核风险、目标与执行窗口，同意进入下一阶段。");
  const {
    page: jobPage,
    state: jobState,
    summary: jobSummary,
    refresh: refreshJobs,
  } = usePaginatedResource<JobRecord, JobQuery>({
    accessToken,
    query,
    initialSummary: "读取自动化任务列表，查看审批与执行状态。",
    missingTokenSummary: "请先登录后再查询自动化任务。",
    loadingSummary: "正在加载自动化任务与审批状态...",
    successSummary: (response) => `已加载 ${response.results.length} 条任务，共 ${response.count} 条。`,
    fetcher: (token, activeQuery) => getJobs(baseUrl, token, activeQuery),
  });

  async function handleCreateJob() {
    if (!accessToken) {
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(form.payloadText) as Record<string, unknown>;
    } catch {
      setFormError("任务载荷 JSON 解析失败，请先修正格式。");
      return;
    }

    setFormError(null);
    try {
      const created = await createJob(baseUrl, accessToken, {
        name: form.name,
        status: form.status,
        risk_level: form.risk_level,
        payload,
      });
      const response = await refreshJobs();
      setSelectedJobId(created.id);
      if (response) {
        setSelectedJobId(created.id);
      }
    } catch (error) {
      setFormError((error as Error).message);
      console.error(error);
    }
  }

  async function handleApprovalAction(action: "approve" | "reject") {
    if (!accessToken || !selectedJob) {
      return;
    }
    try {
      const response =
        action === "approve"
          ? await approveJob(baseUrl, accessToken, selectedJob.id, approvalComment)
          : await rejectJob(baseUrl, accessToken, selectedJob.id, approvalComment);
      await refreshJobs();
      setSelectedJobId(response.id);
    } catch (error) {
      console.error(error);
    }
  }

  function updateQuery<K extends keyof JobQuery>(key: K, value: JobQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: key === "page" ? value : "1",
      [key]: value,
    }));
  }

  function resetQuery() {
    setQuery(initialQuery);
  }

  const selectedJob =
    jobPage?.results.find((job) => job.id === selectedJobId) || jobPage?.results[0] || null;
  const canActOnSelectedJob =
    selectedJob &&
    selectedJob.approval_status === "pending" &&
    selectedJob.approval_requested_by !== profile?.id;

  const activeFilterTags = useMemo(
    () => [
      query.search ? `关键词：${query.search}` : null,
      query.status ? `执行：${getJobStatusLabel(query.status)}` : null,
      query.risk_level ? `风险：${getRiskLabel(query.risk_level)}` : null,
      query.approval_status ? `审批：${getApprovalStatusLabel(query.approval_status)}` : null,
    ].filter(Boolean) as string[],
    [query],
  );

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>自动化任务</h2>
          <p>围绕审批、执行与责任归属进行筛选，快速聚焦需要处理的自动化变更。</p>
        </div>

        <div className="filter-grid automation-filter-grid">
          <label className="field">
            <span>关键词</span>
            <input
              placeholder="搜索任务名或相关字段"
              value={query.search || ""}
              onChange={(event) => updateQuery("search", event.target.value)}
            />
          </label>
          <label className="field">
            <span>执行状态</span>
            <select value={query.status || ""} onChange={(event) => updateQuery("status", event.target.value)}>
              {statusOptions.map((option) => (
                <option key={option.value || "all-status"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>风险等级</span>
            <select value={query.risk_level || ""} onChange={(event) => updateQuery("risk_level", event.target.value)}>
              {riskOptions.map((option) => (
                <option key={option.value || "all-risk"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>审批状态</span>
            <select
              value={query.approval_status || ""}
              onChange={(event) => updateQuery("approval_status", event.target.value)}
            >
              {approvalOptions.map((option) => (
                <option key={option.value || "all-approval"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>排序</span>
            <input value={query.ordering || ""} onChange={(event) => updateQuery("ordering", event.target.value)} />
          </label>
          <label className="field">
            <span>每页数量</span>
            <input value={query.page_size || ""} onChange={(event) => updateQuery("page_size", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button
            onClick={async () => {
              const response = await refreshJobs();
              if (response) {
                setSelectedJobId(response.results[0]?.id ?? null);
              }
            }}
            type="button"
          >
            刷新任务
          </button>
          <button className="button-ghost" onClick={resetQuery} type="button">
            清空筛选
          </button>
        </div>

        {activeFilterTags.length ? (
          <div className="filter-chip-row">
            {activeFilterTags.map((tag) => (
              <span className="filter-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className={`status ${jobState}`}>{jobSummary}</p>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>任务名称</th>
                <th>执行状态</th>
                <th>风险等级</th>
                <th>审批状态</th>
                <th>申请人</th>
                <th>最近更新</th>
              </tr>
            </thead>
            <tbody>
              {jobPage?.results.length ? (
                jobPage.results.map((job) => (
                  <tr
                    className={job.id === selectedJob?.id ? "row-selected" : undefined}
                    key={job.id}
                    onClick={() => setSelectedJobId(job.id)}
                  >
                    <td>
                      <Link className="inline-link" to={`/automation/${job.id}`} onClick={(event) => event.stopPropagation()}>
                        {job.name}
                      </Link>
                    </td>
                    <td>{getJobStatusLabel(job.status)}</td>
                    <td>{getRiskLabel(job.risk_level)}</td>
                    <td>
                      <span className={`pill ${job.approval_status}`}>{getApprovalStatusLabel(job.approval_status)}</span>
                    </td>
                    <td>{job.approval_requested_by_username || "未记录"}</td>
                    <td>{formatDateTime(job.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>当前筛选条件下没有任务。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>创建自动化任务</h2>
          <p>高风险任务会进入审批流程。这里保留原始 JSON 载荷，便于与后端契约直接对齐。</p>
        </div>

        <div className="stack-grid">
          <label className="field">
            <span>任务名称</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="field">
            <span>初始状态</span>
            <select
              value={form.status}
              onChange={(event) =>
                setForm((current) => ({ ...current, status: event.target.value as JobExecutionStatus }))
              }
            >
              <option value="draft">草稿（推荐）</option>
            </select>
          </label>
          <label className="field">
            <span>风险等级</span>
            <select
              value={form.risk_level}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  risk_level: event.target.value as JobCreateInput["risk_level"],
                }))
              }
            >
              <option value="low">低风险</option>
              <option value="medium">中风险</option>
              <option value="high">高风险</option>
            </select>
          </label>
          <label className="field">
            <span>任务载荷 JSON</span>
            <textarea
              className="code-input"
              rows={8}
              value={form.payloadText}
              onChange={(event) => setForm((current) => ({ ...current, payloadText: event.target.value }))}
            />
          </label>
          <button onClick={() => void handleCreateJob()} type="button">
            创建任务
          </button>
          {formError ? <p className="status error">{formError}</p> : null}
        </div>
      </section>

      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>选中任务概览</h2>
          <p>查看当前任务的审批上下文、执行状态与载荷摘要，决定是否继续审批操作。</p>
        </div>

        {selectedJob ? (
          <div className="summary-grid">
            <article className="summary-card">
              <span>任务名称</span>
              <strong>{selectedJob.name}</strong>
              <small>执行状态：{getJobStatusLabel(selectedJob.status)}</small>
            </article>
            <article className="summary-card">
              <span>审批状态</span>
              <strong>{getApprovalStatusLabel(selectedJob.approval_status)}</strong>
              <small>风险等级：{getRiskLabel(selectedJob.risk_level)}</small>
            </article>
            <article className="summary-card">
              <span>申请人</span>
              <strong>{selectedJob.approval_requested_by_username || "未记录"}</strong>
              <small>
                申请时间：{selectedJob.approval_requested_at ? formatDateTime(selectedJob.approval_requested_at) : "未记录"}
              </small>
            </article>
            <article className="summary-card">
              <span>处理结果</span>
              <strong>{selectedJob.approved_by_username || selectedJob.rejected_by_username || "等待处理"}</strong>
              <small>
                {selectedJob.approved_at
                  ? `批准于 ${formatDateTime(selectedJob.approved_at)}`
                  : selectedJob.rejected_at
                    ? `拒绝于 ${formatDateTime(selectedJob.rejected_at)}`
                    : "尚未记录审批结论"}
              </small>
            </article>

            <article className="summary-card automation-route-card">
              <span>详细审阅</span>
              <strong>
                <Link className="inline-link" to={`/automation/${selectedJob.id}`}>
                  打开任务详情页
                </Link>
              </strong>
              <small>进入独立路由查看完整上下文。</small>
            </article>

            <article className="highlight-card compact-card automation-soft-card">
              <h3>任务载荷</h3>
              <pre className="json-block">{JSON.stringify(selectedJob.payload, null, 2)}</pre>
            </article>

            <article className="highlight-card compact-card automation-soft-card">
              <h3>审批备注</h3>
              <p>{selectedJob.approval_comment || "暂未记录审批备注。"}</p>
            </article>

            <article className="highlight-card compact-card automation-soft-card">
              <h3>审批操作</h3>
              <label className="field">
                <span>审批意见</span>
                <textarea
                  rows={4}
                  value={approvalComment}
                  onChange={(event) => setApprovalComment(event.target.value)}
                />
              </label>
              <div className="actions">
                <button
                  disabled={!canActOnSelectedJob}
                  onClick={() => void handleApprovalAction("approve")}
                  type="button"
                >
                  批准
                </button>
                <button
                  className="button-ghost"
                  disabled={!canActOnSelectedJob}
                  onClick={() => void handleApprovalAction("reject")}
                  type="button"
                >
                  拒绝
                </button>
              </div>
              {!canActOnSelectedJob ? (
                <p className="status idle">
                  {selectedJob.approval_status !== "pending"
                    ? "只有待审批的高风险任务才可以变更审批状态。"
                    : selectedJob.approval_requested_by === profile?.id
                      ? "申请人不能审批或拒绝自己提交的任务。"
                      : "审批操作需要 approver 或 platform_admin 权限。"}
                </p>
              ) : null}
            </article>
          </div>
        ) : (
          <p className="status idle">请先从列表中选择一个自动化任务。</p>
        )}
      </section>
    </main>
  );
}
