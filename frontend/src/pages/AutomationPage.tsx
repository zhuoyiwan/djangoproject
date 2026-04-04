import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect, type GlassSelectOption } from "../components/GlassSelect";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { createJob, getJobs } from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTime, formatDateTimeZhParts } from "../lib/format";
import type { JobCreateInput, JobQuery, JobRecord } from "../types";

const initialQuery: JobQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "20",
  status: "",
  risk_level: "",
  approval_status: "",
};

const statusOptions: GlassSelectOption[] = [
  { value: "", label: "全部执行状态" },
  { value: "draft", label: "草稿" },
  { value: "awaiting_approval", label: "待审批" },
  { value: "ready", label: "待执行" },
  { value: "claimed", label: "已认领" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
  { value: "canceled", label: "已取消" },
];

const riskOptions: GlassSelectOption[] = [
  { value: "", label: "全部风险等级" },
  { value: "low", label: "低风险" },
  { value: "medium", label: "中风险" },
  { value: "high", label: "高风险" },
];

const approvalOptions: GlassSelectOption[] = [
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
  risk_level: JobCreateInput["risk_level"];
  payloadText: string;
};

const initialForm: JobFormState = {
  name: "restart-prod",
  risk_level: "high",
  payloadText: '{\n  "target": "prod-web-01",\n  "change_window": "maintenance-window-a"\n}',
};

export function AutomationPage() {
  const { accessToken, baseUrl } = useAuth();
  const location = useLocation();
  const [query, setQuery] = useState<JobQuery>(initialQuery);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const flashMessage = typeof location.state?.flashMessage === "string" ? location.state.flashMessage : "";
  const flashState = location.state?.flashState === "error" ? "error" : "success";

  const {
    page: jobPage,
    state: jobState,
    summary: jobSummary,
    refresh: refreshJobs,
  } = usePaginatedResource<JobRecord, JobQuery>({
    accessToken,
    query,
    initialSummary: "读取自动化任务列表，查看当前审批与执行进度。",
    missingTokenSummary: "请先登录后再访问自动化任务。",
    loadingSummary: "正在同步自动化任务与审批状态...",
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
      setFormError("任务载荷 JSON 校验失败，请先修正内容格式后再提交。");
      return;
    }

    setFormError(null);
    try {
      const created = await createJob(baseUrl, accessToken, {
        name: form.name,
        status: "draft",
        risk_level: form.risk_level,
        payload,
      });
      const response = await refreshJobs();
      setSelectedJobId(created.id);
      if (response) {
        setSelectedJobId(created.id);
      }
    } catch (error) {
      setFormError(getUserFacingErrorMessage(error));
      console.error(error);
    }
  }

  function updateQuery<K extends keyof JobQuery>(key: K, value: JobQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: "1",
      [key]: value,
    }));
  }

  function resetQuery() {
    setQuery(initialQuery);
  }

  const selectedJob =
    jobPage?.results.find((job) => job.id === selectedJobId) || jobPage?.results[0] || null;

  const activeFilterTags = useMemo(
    () =>
      [
        query.search ? `关键词：${query.search}` : null,
        query.status ? `执行：${getJobStatusLabel(query.status)}` : null,
        query.risk_level ? `风险：${getRiskLabel(query.risk_level)}` : null,
        query.approval_status ? `审批：${getApprovalStatusLabel(query.approval_status)}` : null,
      ].filter(Boolean) as string[],
    [query],
  );

  function renderDateTimeStack(value: string | null) {
    const { date, time } = formatDateTimeZhParts(value);
    return (
      <span className="time-stack">
        <span>{date}</span>
        {time ? <span>{time}</span> : null}
      </span>
    );
  }

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8">
        <div className="panel-heading">
          <h2>自动化任务</h2>
          <p>统一查看自动化任务的申请、审批与执行状态，支持按条件快速筛选，便于持续跟进任务处理进度。</p>
        </div>

        <div className="filter-grid automation-filter-grid">
          <label className="field">
            <span>关键词</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
          <div className="field">
            <span>执行状态</span>
            <GlassSelect options={statusOptions} value={query.status || ""} onChange={(value) => updateQuery("status", value)} />
          </div>
          <div className="field">
            <span>风险等级</span>
            <GlassSelect
              options={riskOptions}
              value={query.risk_level || ""}
              onChange={(value) => updateQuery("risk_level", value)}
            />
          </div>
          <div className="field">
            <span>审批状态</span>
            <GlassSelect
              options={approvalOptions}
              value={query.approval_status || ""}
              onChange={(value) => updateQuery("approval_status", value)}
            />
          </div>
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

        {flashMessage ? <p className={`status ${flashState}`}>{flashMessage}</p> : null}
        <p className={`status ${jobState}`}>{jobSummary}</p>

        <div className="table-shell">
          <table className="automation-task-table">
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
                    <td>
                      <span className={`pill ${job.status}`}>{getJobStatusLabel(job.status)}</span>
                    </td>
                    <td>{getRiskLabel(job.risk_level)}</td>
                    <td>
                      <span className={`pill ${job.approval_status}`}>{getApprovalStatusLabel(job.approval_status)}</span>
                    </td>
                    <td>{job.approval_requested_by_username || "未记录"}</td>
                    <td>{renderDateTimeStack(job.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>当前筛选条件下暂无可展示的自动化任务。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-4">
        <div className="panel-heading">
          <h2>创建任务</h2>
          <p>通过统一入口提交自动化任务。高风险操作将自动进入审批流程，其余必要信息可在当前表单中完成录入。</p>
        </div>

        <div className="stack-grid">
          <label className="field">
            <span>任务名称</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <div className="field">
            <span>风险等级</span>
            <GlassSelect
              options={riskOptions.filter((option) => option.value)}
              value={form.risk_level}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  risk_level: value as JobCreateInput["risk_level"],
                }))
              }
            />
          </div>
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
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12">
        <div className="panel-heading">
          <h2>选中任务概览</h2>
          <p>聚合展示当前任务的核心状态、申请信息与处理结果，详细执行轨迹可进一步进入任务详情页查看。</p>
        </div>

        {selectedJob ? (
          <div className="summary-grid">
            <BorderGlow as="article" className="summary-card">
              <span>任务名称</span>
              <strong>{selectedJob.name}</strong>
              <small>执行状态：{getJobStatusLabel(selectedJob.status)}</small>
            </BorderGlow>
            <BorderGlow as="article" className="summary-card">
              <span>审批状态</span>
              <strong>{getApprovalStatusLabel(selectedJob.approval_status)}</strong>
              <small>风险等级：{getRiskLabel(selectedJob.risk_level)}</small>
            </BorderGlow>
            <BorderGlow as="article" className="summary-card">
              <span>申请人</span>
              <strong>{selectedJob.approval_requested_by_username || "未记录"}</strong>
              <small>
                申请时间：{selectedJob.approval_requested_at ? formatDateTime(selectedJob.approval_requested_at) : "未记录"}
              </small>
            </BorderGlow>
            <BorderGlow as="article" className="summary-card">
              <span>最近更新</span>
              <strong>{renderDateTimeStack(selectedJob.updated_at)}</strong>
              <small>创建时间：{formatDateTime(selectedJob.created_at)}</small>
            </BorderGlow>
            <BorderGlow as="article" className="summary-card automation-route-card">
              <span>查看更多</span>
              <strong>
                <Link className="inline-link" to={`/automation/${selectedJob.id}`}>
                  打开详情页
                </Link>
              </strong>
              <small>查看完整处理过程、审批流转与任务上下文。</small>
            </BorderGlow>
            <BorderGlow as="article" className="highlight-card compact-card automation-soft-card">
              <h3>任务内容</h3>
              <pre className="json-block">{JSON.stringify(selectedJob.payload, null, 2)}</pre>
            </BorderGlow>
            <BorderGlow as="article" className="highlight-card compact-card automation-soft-card">
              <h3>当前说明</h3>
              <p>{selectedJob.execution_summary || selectedJob.approval_comment || "任务已创建，等待进入下一处理阶段。"}</p>
            </BorderGlow>
          </div>
        ) : (
          <p className="status idle">请先从左侧列表中选择目标任务，以查看任务概览与处理信息。</p>
        )}
      </BorderGlow>
    </main>
  );
}

function getJobStatusLabel(status: string) {
  return jobStatusLabelMap[status] || status;
}

function getApprovalStatusLabel(status: string) {
  return approvalStatusLabelMap[status] || status;
}

function getRiskLabel(risk: string) {
  return riskLabelMap[risk] || risk;
}
