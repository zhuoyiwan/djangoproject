import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../app/auth";
import { BorderGlow } from "../components/BorderGlow";
import { GlassSelect, type GlassSelectOption } from "../components/GlassSelect";
import { PaginationControls } from "../components/PaginationControls";
import { useHashSectionScroll } from "../hooks/useHashSectionScroll";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { cancelJob, createJob, getJobHandoff, getJobToolQuery, getJobs, requeueJob } from "../lib/api";
import { downloadCsv } from "../lib/export";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTime, formatDateTimeZhParts } from "../lib/format";
import type {
  JobCreateInput,
  JobHandoffQuery,
  JobHandoffResponse,
  JobQuery,
  JobRecord,
  JobToolQuery,
  JobToolQueryResponse,
  RequestState,
} from "../types";

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

const orderingOptions: GlassSelectOption[] = [
  { value: "-created_at", label: "最新创建" },
  { value: "name", label: "任务名称 A-Z" },
  { value: "status", label: "执行状态分组" },
  { value: "risk_level", label: "风险等级分组" },
  { value: "approval_status", label: "审批状态分组" },
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

const initialToolQuery: JobToolQuery = {
  q: "",
  status: "",
  risk_level: "",
  approval_status: "",
  assigned_agent_key_id: "",
  last_reported_by_agent_key: "",
  limit: "6",
};

const initialHandoffQuery: JobHandoffQuery = {
  q: "",
  status: "ready",
  risk_level: "",
  approval_status: "",
  assigned_agent_key_id: "",
  last_reported_by_agent_key: "",
  limit: "6",
};

const initialAgentClaimQuery: JobHandoffQuery = {
  q: "",
  status: "claimed",
  risk_level: "",
  approval_status: "",
  assigned_agent_key_id: "",
  last_reported_by_agent_key: "",
  limit: "6",
};

const initialAgentReportQuery: JobToolQuery = {
  q: "",
  status: "completed",
  risk_level: "",
  approval_status: "",
  assigned_agent_key_id: "",
  last_reported_by_agent_key: "",
  limit: "6",
};

export function AutomationPage() {
  const { accessToken, baseUrl, capabilities } = useAuth();
  const location = useLocation();
  useHashSectionScroll();
  const [query, setQuery] = useState<JobQuery>(initialQuery);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [batchComment, setBatchComment] = useState("由工作台发起批量处理。");
  const [batchState, setBatchState] = useState<RequestState>("idle");
  const [batchSummary, setBatchSummary] = useState("支持对当前页任务批量终止或重新调度，适用于集中清理和任务回补。");
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [toolQuery, setToolQuery] = useState<JobToolQuery>(initialToolQuery);
  const [toolState, setToolState] = useState<RequestState>("idle");
  const [toolSummary, setToolSummary] = useState("支持按任务状态、风险等级、审批状态与执行器信息组合检索，适用于审批排查、执行回溯与任务归因。");
  const [toolResponse, setToolResponse] = useState<JobToolQueryResponse | null>(null);
  const [handoffQuery, setHandoffQuery] = useState<JobHandoffQuery>(initialHandoffQuery);
  const [handoffState, setHandoffState] = useState<RequestState>("idle");
  const [handoffSummary, setHandoffSummary] = useState("查看待执行与已认领任务的交接视图，便于执行侧确认当前处理池与接手顺序。");
  const [handoffResponse, setHandoffResponse] = useState<JobHandoffResponse | null>(null);
  const [agentClaimQuery, setAgentClaimQuery] = useState<JobHandoffQuery>(initialAgentClaimQuery);
  const [agentClaimState, setAgentClaimState] = useState<RequestState>("idle");
  const [agentClaimSummary, setAgentClaimSummary] = useState("查看已由执行器接手的任务，用于跟踪 runner 认领结果与当前处理责任。");
  const [agentClaimResponse, setAgentClaimResponse] = useState<JobHandoffResponse | null>(null);
  const [agentReportQuery, setAgentReportQuery] = useState<JobToolQuery>(initialAgentReportQuery);
  const [agentReportState, setAgentReportState] = useState<RequestState>("idle");
  const [agentReportSummary, setAgentReportSummary] = useState("查看已产生机器回报的任务，用于追踪 runner 上报结果、执行摘要与最近回传主体。");
  const [agentReportResponse, setAgentReportResponse] = useState<JobToolQueryResponse | null>(null);
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

  function updateToolQuery<K extends keyof JobToolQuery>(key: K, value: JobToolQuery[K]) {
    setToolQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateHandoffQuery<K extends keyof JobHandoffQuery>(key: K, value: JobHandoffQuery[K]) {
    setHandoffQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateAgentClaimQuery<K extends keyof JobHandoffQuery>(key: K, value: JobHandoffQuery[K]) {
    setAgentClaimQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateAgentReportQuery<K extends keyof JobToolQuery>(key: K, value: JobToolQuery[K]) {
    setAgentReportQuery((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleToolQuery() {
    if (!accessToken) {
      setToolState("error");
      setToolSummary("请先登录后再执行高级任务查询。");
      return;
    }

    const activeQuery = Object.fromEntries(
      Object.entries(toolQuery).filter(([, value]) => Boolean(value)),
    ) as JobToolQuery;

    setToolState("loading");
    setToolSummary("正在执行高级任务查询...");
    try {
      const response = await getJobToolQuery(baseUrl, accessToken, activeQuery);
      setToolResponse(response);
      setToolState("success");
      setToolSummary(`已返回 ${response.summary.returned} 条任务，共命中 ${response.summary.count} 条。`);
    } catch (error) {
      setToolResponse(null);
      setToolState("error");
      setToolSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleHandoffQuery() {
    if (!accessToken) {
      setHandoffState("error");
      setHandoffSummary("请先登录后再查看执行交接视图。");
      return;
    }

    const activeQuery = Object.fromEntries(
      Object.entries(handoffQuery).filter(([, value]) => Boolean(value)),
    ) as JobHandoffQuery;

    setHandoffState("loading");
    setHandoffSummary("正在同步执行交接视图...");
    try {
      const response = await getJobHandoff(baseUrl, accessToken, activeQuery);
      setHandoffResponse(response);
      setHandoffState("success");
      setHandoffSummary(`已返回 ${response.summary.returned} 条交接任务，共命中 ${response.summary.count} 条。`);
    } catch (error) {
      setHandoffResponse(null);
      setHandoffState("error");
      setHandoffSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleAgentClaimQuery() {
    if (!accessToken) {
      setAgentClaimState("error");
      setAgentClaimSummary("请先登录后再查看执行器认领监控。");
      return;
    }

    const activeQuery = Object.fromEntries(
      Object.entries(agentClaimQuery).filter(([, value]) => Boolean(value)),
    ) as JobHandoffQuery;

    setAgentClaimState("loading");
    setAgentClaimSummary("正在同步执行器认领视图...");
    try {
      const response = await getJobHandoff(baseUrl, accessToken, activeQuery);
      setAgentClaimResponse(response);
      setAgentClaimState("success");
      setAgentClaimSummary(`已返回 ${response.summary.returned} 条执行器认领任务，共命中 ${response.summary.count} 条。`);
    } catch (error) {
      setAgentClaimResponse(null);
      setAgentClaimState("error");
      setAgentClaimSummary(getUserFacingErrorMessage(error));
    }
  }

  async function handleAgentReportQuery() {
    if (!accessToken) {
      setAgentReportState("error");
      setAgentReportSummary("请先登录后再查看执行器上报监控。");
      return;
    }

    const activeQuery = Object.fromEntries(
      Object.entries(agentReportQuery).filter(([, value]) => Boolean(value)),
    ) as JobToolQuery;

    setAgentReportState("loading");
    setAgentReportSummary("正在同步执行器上报视图...");
    try {
      const response = await getJobToolQuery(baseUrl, accessToken, activeQuery);
      setAgentReportResponse(response);
      setAgentReportState("success");
      setAgentReportSummary(`已返回 ${response.summary.returned} 条执行器上报任务，共命中 ${response.summary.count} 条。`);
    } catch (error) {
      setAgentReportResponse(null);
      setAgentReportState("error");
      setAgentReportSummary(getUserFacingErrorMessage(error));
    }
  }

  const selectedJob =
    jobPage?.results.find((job) => job.id === selectedJobId) || jobPage?.results[0] || null;
  const currentPage = Number(query.page || "1");
  const pageSize = Number(query.page_size || "20");

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

  useEffect(() => {
    const pageIds = new Set((jobPage?.results || []).map((item) => item.id));
    setSelectedJobIds((current) => current.filter((id) => pageIds.has(id)));
  }, [jobPage?.results]);

  function renderDateTimeStack(value: string | null) {
    const { date, time } = formatDateTimeZhParts(value);
    return (
      <span className="time-stack">
        <span>{date}</span>
        {time ? <span>{time}</span> : null}
      </span>
    );
  }

  function toggleJobSelection(jobId: number) {
    setSelectedJobIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId],
    );
  }

  function toggleAllJobSelection() {
    const pageIds = jobPage?.results.map((item) => item.id) || [];
    if (!pageIds.length) {
      return;
    }
    setSelectedJobIds((current) => (current.length === pageIds.length ? [] : pageIds));
  }

  async function handleBatchAction(action: "cancel" | "requeue") {
    if (!accessToken || !selectedJobIds.length) {
      setBatchState("error");
      setBatchSummary("请先勾选当前页需要处理的任务。");
      return;
    }

    setBatchState("loading");
    setBatchSummary(`正在执行 ${selectedJobIds.length} 条任务的批量处理...`);

    const selectedJobs = (jobPage?.results || []).filter((job) => selectedJobIds.includes(job.id));
    let successCount = 0;
    let skippedCount = 0;
    let failCount = 0;

    for (const job of selectedJobs) {
      const allowed =
        action === "cancel"
          ? job.status === "ready" || job.status === "claimed"
          : job.status === "claimed" || job.status === "failed";
      if (!allowed) {
        skippedCount += 1;
        continue;
      }

      try {
        if (action === "cancel") {
          await cancelJob(baseUrl, accessToken, job.id, batchComment.trim() || "由工作台发起批量终止。");
        } else {
          await requeueJob(baseUrl, accessToken, job.id, batchComment.trim() || "由工作台发起批量重调度。");
        }
        successCount += 1;
      } catch {
        failCount += 1;
      }
    }

    const refreshed = await refreshJobs();
    if (refreshed) {
      setSelectedJobId(refreshed.results[0]?.id ?? null);
    }
    setSelectedJobIds([]);
    setBatchState(failCount ? "error" : "success");
    setBatchSummary(`批量处理完成：成功 ${successCount} 条，跳过 ${skippedCount} 条，失败 ${failCount} 条。`);
  }

  function handleExportJobs() {
    if (!jobPage?.results.length) {
      return;
    }

    downloadCsv(
      `automation-page-${query.page || "1"}.csv`,
      [
        { key: "name", label: "任务名称" },
        { key: "status", label: "执行状态" },
        { key: "risk_level", label: "风险等级" },
        { key: "approval_status", label: "审批状态" },
        { key: "approval_requested_by_username", label: "申请人" },
        { key: "assigned_agent_key_id", label: "执行器 ID" },
        { key: "last_reported_by_agent_key", label: "最近上报执行器" },
        { key: "updated_at", label: "最近更新" },
      ],
      jobPage.results,
    );
  }

  const batchCancelTooltip = selectedJobIds.length
    ? "批量终止已选任务 仅处理待执行或已认领任务"
    : "请先勾选目标任务";
  const batchRequeueTooltip = selectedJobIds.length
    ? "批量重调度已选任务 仅处理已认领或失败任务"
    : "请先勾选目标任务";
  const batchClearTooltip = selectedJobIds.length
    ? "清空当前选择"
    : "当前没有已选任务";

  return (
    <main className="workspace-grid">
      <BorderGlow as="section" className="panel panel-span-8" id="automation-tasks">
        <div className="panel-heading">
          <h2>自动化任务</h2>
          <p>集中查看自动化任务的申请、审批与执行进度，支持按条件筛选，便于持续跟进任务处理状态。</p>
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
          <div className="field">
            <span>排序方式</span>
            <GlassSelect
              options={orderingOptions}
              value={query.ordering || "-created_at"}
              onChange={(value) => updateQuery("ordering", value)}
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
          <button className="button-ghost" onClick={handleExportJobs} type="button">
            导出当前页
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

        {capabilities.canExecuteAutomation ? (
          <div className="batch-toolbar">
            <div className="batch-toolbar-inline">
              <span className="filter-chip">已选 {selectedJobIds.length} 条</span>
            </div>
            <label className="field batch-toolbar-field">
              <span>批量备注</span>
              <input value={batchComment} onChange={(event) => setBatchComment(event.target.value)} />
            </label>
            <div className="actions">
              <span className="action-tooltip" data-tooltip={batchCancelTooltip}>
                <button disabled={!selectedJobIds.length} onClick={() => void handleBatchAction("cancel")} type="button">
                  批量终止
                </button>
              </span>
              <span className="action-tooltip" data-tooltip={batchRequeueTooltip}>
                <button disabled={!selectedJobIds.length} onClick={() => void handleBatchAction("requeue")} type="button">
                  批量重调度
                </button>
              </span>
              <span className="action-tooltip" data-tooltip={batchClearTooltip}>
                <button className="button-ghost" disabled={!selectedJobIds.length} onClick={() => setSelectedJobIds([])} type="button">
                  清空选择
                </button>
              </span>
            </div>
          </div>
        ) : null}

        {capabilities.canExecuteAutomation && batchState !== "idle" ? <p className={`status ${batchState}`}>{batchSummary}</p> : null}

        <div className="table-shell">
          <table className="automation-task-table">
            <thead>
              <tr>
                {capabilities.canExecuteAutomation ? (
                  <th className="table-select-cell">
                    <input
                      aria-label="选择当前页全部任务"
                      checked={Boolean(jobPage?.results.length) && selectedJobIds.length === (jobPage?.results.length || 0)}
                      className="table-checkbox"
                      onChange={toggleAllJobSelection}
                      type="checkbox"
                    />
                  </th>
                ) : null}
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
                    {capabilities.canExecuteAutomation ? (
                      <td className="table-select-cell" onClick={(event) => event.stopPropagation()}>
                        <input
                          aria-label={`选择任务 ${job.name}`}
                          checked={selectedJobIds.includes(job.id)}
                          className="table-checkbox"
                          onChange={() => toggleJobSelection(job.id)}
                          type="checkbox"
                        />
                      </td>
                    ) : null}
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
                  <td colSpan={capabilities.canExecuteAutomation ? 7 : 6}>当前筛选条件下暂无可展示的自动化任务。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          currentPage={currentPage}
          onPageChange={(page) => updateQuery("page", String(page))}
          onPageSizeChange={(size) => updateQuery("page_size", String(size))}
          page={jobPage}
          pageSize={pageSize}
        />
      </BorderGlow>

      <div className="automation-sidebar">
        <BorderGlow as="section" className="panel panel-fit-content automation-side-card">
          <div className="panel-heading">
            <h2>创建任务</h2>
            <p>在此提交自动化任务。高风险操作会自动进入审批流程，其余必要信息可在当前表单一次性补充完成。</p>
          </div>

          {capabilities.canWriteAutomation ? (
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
          ) : (
            <p className="status idle">当前账号已开通任务查看能力，但未配置任务创建权限。如需提交自动化任务，请联系平台管理员开通运维写入权限。</p>
          )}
        </BorderGlow>

        <BorderGlow as="section" className="panel panel-fit-content automation-side-card">
          <div className="panel-heading">
            <h2>选中任务概览</h2>
            <p>展示当前任务的核心状态、申请信息与处理结果，如需查看完整执行轨迹，可进入任务详情页。</p>
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
      </div>

      <BorderGlow as="section" className="panel panel-span-12" id="automation-advanced-query">
        <div className="panel-heading">
          <h2>高级任务查询</h2>
          <p>面向审批排查、执行回溯与任务归因场景，可通过任务状态、风险等级、审批状态与执行器信息快速缩小范围。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>综合关键词</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <div className="field">
            <span>执行状态</span>
            <GlassSelect
              options={statusOptions}
              value={toolQuery.status || ""}
              onChange={(value) => updateToolQuery("status", value as JobToolQuery["status"])}
            />
          </div>
          <div className="field">
            <span>风险等级</span>
            <GlassSelect
              options={riskOptions}
              value={toolQuery.risk_level || ""}
              onChange={(value) => updateToolQuery("risk_level", value as JobToolQuery["risk_level"])}
            />
          </div>
          <div className="field">
            <span>审批状态</span>
            <GlassSelect
              options={approvalOptions}
              value={toolQuery.approval_status || ""}
              onChange={(value) => updateToolQuery("approval_status", value as JobToolQuery["approval_status"])}
            />
          </div>
          <label className="field">
            <span>执行器 ID</span>
            <input
              value={toolQuery.assigned_agent_key_id || ""}
              onChange={(event) => updateToolQuery("assigned_agent_key_id", event.target.value)}
            />
          </label>
          <label className="field">
            <span>最近上报执行器</span>
            <input
              value={toolQuery.last_reported_by_agent_key || ""}
              onChange={(event) => updateToolQuery("last_reported_by_agent_key", event.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleToolQuery()} type="button">
            执行查询
          </button>
          <button
            className="button-ghost"
            onClick={() => {
              setToolQuery(initialToolQuery);
              setToolResponse(null);
              setToolState("idle");
              setToolSummary("支持按任务状态、风险等级、审批状态与执行器信息组合检索，适用于审批排查、执行回溯与任务归因。");
            }}
            type="button"
          >
            重置条件
          </button>
        </div>

        <p className={`status ${toolState}`}>{toolSummary}</p>

        {toolResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">返回 {toolResponse.summary.returned} 条</span>
              <span className="filter-chip">命中 {toolResponse.summary.count} 条</span>
              {toolResponse.summary.truncated ? <span className="filter-chip">结果已截断</span> : null}
            </div>
            <div className="query-result-grid query-result-grid-compact">
              {toolResponse.items.map((item) => (
                <BorderGlow as="article" className="tool-result-card tool-result-card-compact" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{item.name}</h3>
                      <div className="tool-result-meta">
                        <span className={`pill ${item.status}`}>{getJobStatusLabel(item.status)}</span>
                        <span className={`pill ${item.approval_status}`}>{getApprovalStatusLabel(item.approval_status)}</span>
                      </div>
                    </div>
                    <Link className="button-link button-link-ghost query-action-button" to={`/automation/${item.id}`}>
                      打开详情
                    </Link>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>风险等级</dt>
                      <dd>{getRiskLabel(item.risk_level)}</dd>
                    </div>
                    <div>
                      <dt>认领人</dt>
                      <dd>{item.claimed_by_username || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>执行器</dt>
                      <dd>{item.assigned_agent_key_id || "未绑定"}</dd>
                    </div>
                    <div>
                      <dt>最近更新</dt>
                      <dd>{formatDateTime(item.updated_at)}</dd>
                    </div>
                  </dl>
                </BorderGlow>
              ))}
            </div>
          </>
        ) : null}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12" id="automation-handoff">
        <div className="panel-heading">
          <h2>执行交接视图</h2>
          <p>聚焦待执行与已认领任务，便于执行侧确认交接池、识别当前负责人并快速进入具体任务。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>综合关键词</span>
            <input value={handoffQuery.q || ""} onChange={(event) => updateHandoffQuery("q", event.target.value)} />
          </label>
          <div className="field">
            <span>交接状态</span>
            <GlassSelect
              options={[
                { value: "", label: "全部交接状态" },
                { value: "ready", label: "待执行" },
                { value: "claimed", label: "已认领" },
              ]}
              value={handoffQuery.status || ""}
              onChange={(value) => updateHandoffQuery("status", value as JobHandoffQuery["status"])}
            />
          </div>
          <div className="field">
            <span>风险等级</span>
            <GlassSelect
              options={riskOptions}
              value={handoffQuery.risk_level || ""}
              onChange={(value) => updateHandoffQuery("risk_level", value as JobHandoffQuery["risk_level"])}
            />
          </div>
          <div className="field">
            <span>审批状态</span>
            <GlassSelect
              options={approvalOptions}
              value={handoffQuery.approval_status || ""}
              onChange={(value) => updateHandoffQuery("approval_status", value as JobHandoffQuery["approval_status"])}
            />
          </div>
          <label className="field">
            <span>执行器 ID</span>
            <input
              value={handoffQuery.assigned_agent_key_id || ""}
              onChange={(event) => updateHandoffQuery("assigned_agent_key_id", event.target.value)}
            />
          </label>
          <label className="field">
            <span>最近上报执行器</span>
            <input
              value={handoffQuery.last_reported_by_agent_key || ""}
              onChange={(event) => updateHandoffQuery("last_reported_by_agent_key", event.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleHandoffQuery()} type="button">
            同步交接池
          </button>
          <button
            className="button-ghost"
            onClick={() => {
              setHandoffQuery(initialHandoffQuery);
              setHandoffResponse(null);
              setHandoffState("idle");
              setHandoffSummary("查看待执行与已认领任务的交接视图，便于执行侧确认当前处理池与接手顺序。");
            }}
            type="button"
          >
            重置条件
          </button>
        </div>

        <p className={`status ${handoffState}`}>{handoffSummary}</p>

        {handoffResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">返回 {handoffResponse.summary.returned} 条</span>
              <span className="filter-chip">命中 {handoffResponse.summary.count} 条</span>
              {handoffResponse.summary.truncated ? <span className="filter-chip">结果已截断</span> : null}
            </div>
            <div className="query-result-grid">
              {handoffResponse.items.map((item) => (
                <BorderGlow as="article" className="tool-result-card handoff-card" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{item.name}</h3>
                      <div className="tool-result-meta">
                        <span className={`pill ${item.status}`}>{getJobStatusLabel(item.status)}</span>
                        <span className={`pill ${item.approval_status}`}>{getApprovalStatusLabel(item.approval_status)}</span>
                      </div>
                    </div>
                    <Link className="button-link button-link-ghost" to={`/automation/${item.id}`}>
                      进入详情
                    </Link>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>风险等级</dt>
                      <dd>{getRiskLabel(item.risk_level)}</dd>
                    </div>
                    <div>
                      <dt>就绪人</dt>
                      <dd>{item.ready_by_username || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>认领人</dt>
                      <dd>{item.claimed_by_username || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>执行器</dt>
                      <dd>{item.assigned_agent_key_id || "未绑定"}</dd>
                    </div>
                  </dl>
                  <div className="payload-preview">
                    <span>任务载荷摘要</span>
                    <pre className="json-block">{JSON.stringify(item.payload, null, 2)}</pre>
                  </div>
                </BorderGlow>
              ))}
            </div>
          </>
        ) : null}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12" id="automation-agent-claim">
        <div className="panel-heading">
          <h2>执行器认领监控</h2>
          <p>聚焦已由 runner 接手的任务，帮助执行器运营视角快速确认认领主体、接手时间与当前任务池状态。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>综合关键词</span>
            <input value={agentClaimQuery.q || ""} onChange={(event) => updateAgentClaimQuery("q", event.target.value)} />
          </label>
          <div className="field">
            <span>认领状态</span>
            <GlassSelect
              options={[
                { value: "claimed", label: "已认领" },
                { value: "ready", label: "待执行" },
              ]}
              value={agentClaimQuery.status || "claimed"}
              onChange={(value) => updateAgentClaimQuery("status", value as JobHandoffQuery["status"])}
            />
          </div>
          <label className="field">
            <span>执行器 ID</span>
            <input
              value={agentClaimQuery.assigned_agent_key_id || ""}
              onChange={(event) => updateAgentClaimQuery("assigned_agent_key_id", event.target.value)}
            />
          </label>
          <label className="field">
            <span>最近上报执行器</span>
            <input
              value={agentClaimQuery.last_reported_by_agent_key || ""}
              onChange={(event) => updateAgentClaimQuery("last_reported_by_agent_key", event.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleAgentClaimQuery()} type="button">
            同步认领视图
          </button>
          <button
            className="button-ghost"
            onClick={() => {
              setAgentClaimQuery(initialAgentClaimQuery);
              setAgentClaimResponse(null);
              setAgentClaimState("idle");
              setAgentClaimSummary("查看已由执行器接手的任务，用于跟踪 runner 认领结果与当前处理责任。");
            }}
            type="button"
          >
            重置条件
          </button>
        </div>

        <p className={`status ${agentClaimState}`}>{agentClaimSummary}</p>

        {agentClaimResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">返回 {agentClaimResponse.summary.returned} 条</span>
              <span className="filter-chip">命中 {agentClaimResponse.summary.count} 条</span>
              {agentClaimResponse.summary.truncated ? <span className="filter-chip">结果已截断</span> : null}
            </div>
            <div className="query-result-grid">
              {agentClaimResponse.items.map((item) => (
                <BorderGlow as="article" className="tool-result-card handoff-card" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{item.name}</h3>
                      <div className="tool-result-meta">
                        <span className={`pill ${item.status}`}>{getJobStatusLabel(item.status)}</span>
                        <span className="pill neutral">{item.assigned_agent_key_id || "未绑定"}</span>
                      </div>
                    </div>
                    <Link className="button-link button-link-ghost query-action-button" to={`/automation/${item.id}`}>
                      打开详情
                    </Link>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>认领时间</dt>
                      <dd>{item.claimed_at ? renderDateTimeStack(item.claimed_at) : "未记录"}</dd>
                    </div>
                    <div>
                      <dt>认领人</dt>
                      <dd>{item.claimed_by_username || "执行器认领"}</dd>
                    </div>
                    <div>
                      <dt>最近更新</dt>
                      <dd>{renderDateTimeStack(item.updated_at)}</dd>
                    </div>
                    <div>
                      <dt>审批状态</dt>
                      <dd>{getApprovalStatusLabel(item.approval_status)}</dd>
                    </div>
                  </dl>
                </BorderGlow>
              ))}
            </div>
          </>
        ) : null}
      </BorderGlow>

      <BorderGlow as="section" className="panel panel-span-12" id="automation-agent-report">
        <div className="panel-heading">
          <h2>执行器上报监控</h2>
          <p>面向 runner 回报结果的只读视图，可按最近上报执行器、状态与风险等级快速检索，并直接进入任务详情查看完整执行上下文。</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>综合关键词</span>
            <input value={agentReportQuery.q || ""} onChange={(event) => updateAgentReportQuery("q", event.target.value)} />
          </label>
          <div className="field">
            <span>上报结果</span>
            <GlassSelect
              options={[
                { value: "completed", label: "已完成" },
                { value: "failed", label: "失败" },
                { value: "claimed", label: "已认领" },
              ]}
              value={agentReportQuery.status || "completed"}
              onChange={(value) => updateAgentReportQuery("status", value as JobToolQuery["status"])}
            />
          </div>
          <div className="field">
            <span>风险等级</span>
            <GlassSelect
              options={riskOptions}
              value={agentReportQuery.risk_level || ""}
              onChange={(value) => updateAgentReportQuery("risk_level", value as JobToolQuery["risk_level"])}
            />
          </div>
          <label className="field">
            <span>执行器 ID</span>
            <input
              value={agentReportQuery.assigned_agent_key_id || ""}
              onChange={(event) => updateAgentReportQuery("assigned_agent_key_id", event.target.value)}
            />
          </label>
          <label className="field">
            <span>最近上报执行器</span>
            <input
              value={agentReportQuery.last_reported_by_agent_key || ""}
              onChange={(event) => updateAgentReportQuery("last_reported_by_agent_key", event.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleAgentReportQuery()} type="button">
            同步上报视图
          </button>
          <button
            className="button-ghost"
            onClick={() => {
              setAgentReportQuery(initialAgentReportQuery);
              setAgentReportResponse(null);
              setAgentReportState("idle");
              setAgentReportSummary("查看已产生机器回报的任务，用于追踪 runner 上报结果、执行摘要与最近回传主体。");
            }}
            type="button"
          >
            重置条件
          </button>
        </div>

        <p className={`status ${agentReportState}`}>{agentReportSummary}</p>

        {agentReportResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">返回 {agentReportResponse.summary.returned} 条</span>
              <span className="filter-chip">命中 {agentReportResponse.summary.count} 条</span>
              {agentReportResponse.summary.truncated ? <span className="filter-chip">结果已截断</span> : null}
            </div>
            <div className="query-result-grid query-result-grid-compact">
              {agentReportResponse.items.map((item) => (
                <BorderGlow as="article" className="tool-result-card tool-result-card-compact" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <h3>{item.name}</h3>
                      <div className="tool-result-meta">
                        <span className={`pill ${item.status}`}>{getJobStatusLabel(item.status)}</span>
                        <span className="pill neutral">{item.last_reported_by_agent_key || "未回报"}</span>
                      </div>
                    </div>
                    <Link className="button-link button-link-ghost query-action-button" to={`/automation/${item.id}`}>
                      打开详情
                    </Link>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>执行器</dt>
                      <dd>{item.assigned_agent_key_id || "未绑定"}</dd>
                    </div>
                    <div>
                      <dt>最近上报</dt>
                      <dd>{item.last_reported_by_agent_key || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>风险等级</dt>
                      <dd>{getRiskLabel(item.risk_level)}</dd>
                    </div>
                    <div>
                      <dt>最近更新</dt>
                      <dd>{renderDateTimeStack(item.updated_at)}</dd>
                    </div>
                  </dl>
                </BorderGlow>
              ))}
            </div>
          </>
        ) : null}
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
