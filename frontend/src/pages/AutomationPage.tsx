import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app/auth";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import {
  approveJob,
  createJob,
  getJobHandoff,
  getJobs,
  getJobToolQuery,
  rejectJob,
} from "../lib/api";
import { getUserFacingErrorMessage } from "../lib/errors";
import { formatDateTime } from "../lib/format";
import type {
  JobCreateInput,
  JobExecutionStatus,
  JobHandoffQuery,
  JobHandoffResponse,
  JobQuery,
  JobRecord,
  JobToolQuery,
  JobToolQueryResponse,
  RequestState,
  ToolQuerySummary,
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

const initialToolQuery: JobToolQuery = {
  q: "",
  name: "",
  status: "",
  risk_level: "",
  approval_status: "",
  assigned_agent_key_id: "",
  last_reported_by_agent_key: "",
  limit: "6",
};

const initialHandoffQuery: JobHandoffQuery = {
  q: "",
  name: "",
  status: "ready",
  risk_level: "",
  approval_status: "",
  assigned_agent_key_id: "",
  last_reported_by_agent_key: "",
  limit: "6",
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

const handoffStatusOptions = [
  { value: "", label: "全部可交接状态" },
  { value: "ready", label: "待执行" },
  { value: "claimed", label: "已认领" },
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

export function AutomationPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const [query, setQuery] = useState<JobQuery>(initialQuery);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState("已复核风险、目标与执行窗口，同意进入下一阶段。");
  const [toolQuery, setToolQuery] = useState<JobToolQuery>(initialToolQuery);
  const [toolQueryState, setToolQueryState] = useState<RequestState>("idle");
  const [toolQuerySummaryText, setToolQuerySummaryText] = useState("为 Tool Query 选择至少一个过滤条件后查询。");
  const [toolQueryResponse, setToolQueryResponse] = useState<JobToolQueryResponse | null>(null);
  const [handoffQuery, setHandoffQuery] = useState<JobHandoffQuery>(initialHandoffQuery);
  const [handoffState, setHandoffState] = useState<RequestState>("idle");
  const [handoffSummaryText, setHandoffSummaryText] = useState("使用 handoff 视图查看 ready 或 claimed 任务的执行交接面。");
  const [handoffResponse, setHandoffResponse] = useState<JobHandoffResponse | null>(null);

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
      setFormError(getUserFacingErrorMessage(error));
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

  async function handleToolQuerySearch() {
    if (!accessToken) {
      setToolQueryState("error");
      setToolQuerySummaryText("请先登录后再使用 Tool Query。");
      return;
    }
    if (!hasRequiredFilter(toolQuery, ["limit"])) {
      setToolQueryState("error");
      setToolQuerySummaryText("Tool Query 至少需要一个过滤条件。");
      return;
    }
    setToolQueryState("loading");
    setToolQuerySummaryText("正在读取自动化任务 Tool Query 结果...");
    try {
      const response = await getJobToolQuery(baseUrl, accessToken, toolQuery);
      setToolQueryResponse(response);
      setToolQueryState("success");
      setToolQuerySummaryText(buildQuerySummary(response.summary, "Tool Query"));
    } catch (error) {
      setToolQueryState("error");
      setToolQuerySummaryText(getUserFacingErrorMessage(error));
    }
  }

  async function handleHandoffSearch() {
    if (!accessToken) {
      setHandoffState("error");
      setHandoffSummaryText("请先登录后再查看 handoff 视图。");
      return;
    }
    if (!hasRequiredFilter(handoffQuery, ["limit"])) {
      setHandoffState("error");
      setHandoffSummaryText("Handoff 视图至少需要一个过滤条件。");
      return;
    }
    setHandoffState("loading");
    setHandoffSummaryText("正在读取执行交接视图...");
    try {
      const response = await getJobHandoff(baseUrl, accessToken, handoffQuery);
      setHandoffResponse(response);
      setHandoffState("success");
      setHandoffSummaryText(buildQuerySummary(response.summary, "Handoff"));
    } catch (error) {
      setHandoffState("error");
      setHandoffSummaryText(getUserFacingErrorMessage(error));
    }
  }

  function updateQuery<K extends keyof JobQuery>(key: K, value: JobQuery[K]) {
    setQuery((current) => ({
      ...current,
      page: key === "page" ? value : "1",
      [key]: value,
    }));
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

  function resetQuery() {
    setQuery(initialQuery);
  }

  function resetToolQuery() {
    setToolQuery(initialToolQuery);
    setToolQueryResponse(null);
    setToolQueryState("idle");
    setToolQuerySummaryText("为 Tool Query 选择至少一个过滤条件后查询。");
  }

  function resetHandoffQuery() {
    setHandoffQuery(initialHandoffQuery);
    setHandoffResponse(null);
    setHandoffState("idle");
    setHandoffSummaryText("使用 handoff 视图查看 ready 或 claimed 任务的执行交接面。");
  }

  const selectedJob =
    jobPage?.results.find((job) => job.id === selectedJobId) || jobPage?.results[0] || null;
  const canActOnSelectedJob =
    selectedJob &&
    selectedJob.approval_status === "pending" &&
    selectedJob.approval_requested_by !== profile?.id;

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

  const activeToolTags = useMemo(
    () =>
      [
        toolQuery.q ? `自由查询：${toolQuery.q}` : null,
        toolQuery.name ? `任务名：${toolQuery.name}` : null,
        toolQuery.status ? `执行：${getJobStatusLabel(toolQuery.status)}` : null,
        toolQuery.risk_level ? `风险：${getRiskLabel(toolQuery.risk_level)}` : null,
        toolQuery.approval_status ? `审批：${getApprovalStatusLabel(toolQuery.approval_status)}` : null,
        toolQuery.assigned_agent_key_id ? `绑定运行器：${toolQuery.assigned_agent_key_id}` : null,
        toolQuery.last_reported_by_agent_key ? `最近上报：${toolQuery.last_reported_by_agent_key}` : null,
      ].filter(Boolean) as string[],
    [toolQuery],
  );

  const activeHandoffTags = useMemo(
    () =>
      [
        handoffQuery.q ? `自由查询：${handoffQuery.q}` : null,
        handoffQuery.name ? `任务名：${handoffQuery.name}` : null,
        handoffQuery.status ? `执行：${getJobStatusLabel(handoffQuery.status)}` : null,
        handoffQuery.risk_level ? `风险：${getRiskLabel(handoffQuery.risk_level)}` : null,
        handoffQuery.approval_status ? `审批：${getApprovalStatusLabel(handoffQuery.approval_status)}` : null,
        handoffQuery.assigned_agent_key_id ? `绑定运行器：${handoffQuery.assigned_agent_key_id}` : null,
        handoffQuery.last_reported_by_agent_key ? `最近上报：${handoffQuery.last_reported_by_agent_key}` : null,
      ].filter(Boolean) as string[],
    [handoffQuery],
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
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
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
                    <td>
                      <span className={`pill ${job.status}`}>{getJobStatusLabel(job.status)}</span>
                    </td>
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
          <h2>创建任务</h2>
          <p>高风险任务会进入审批流。这里直接保留 JSON 载荷，和后端契约保持一致。</p>
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
          <p>把审批上下文、执行状态和运行器信息放在一个面板里，方便继续处理。</p>
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
              <span>运行器绑定</span>
              <strong>{selectedJob.assigned_agent_key_id || "未绑定"}</strong>
              <small>最近上报：{selectedJob.last_reported_by_agent_key || "未记录"}</small>
            </article>
            <article className="summary-card automation-route-card">
              <span>详细审阅</span>
              <strong>
                <Link className="inline-link" to={`/automation/${selectedJob.id}`}>
                  打开详情页
                </Link>
              </strong>
              <small>查看完整执行轨迹与操作面板。</small>
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

      <section className="panel panel-span-7">
        <div className="panel-heading">
          <h2>Tool Query 视图</h2>
          <p>面向只读代理和排障场景的标准化查询面，突出审批流与运行器可见字段。</p>
        </div>

        <div className="filter-grid automation-filter-grid">
          <label className="field">
            <span>自由查询</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>任务名</span>
            <input value={toolQuery.name || ""} onChange={(event) => updateToolQuery("name", event.target.value)} />
          </label>
          <label className="field">
            <span>执行状态</span>
            <select value={toolQuery.status || ""} onChange={(event) => updateToolQuery("status", event.target.value as JobToolQuery["status"])}>
              {statusOptions.map((option) => (
                <option key={option.value || "tool-all-status"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>风险等级</span>
            <select
              value={toolQuery.risk_level || ""}
              onChange={(event) => updateToolQuery("risk_level", event.target.value as JobToolQuery["risk_level"])}
            >
              {riskOptions.map((option) => (
                <option key={option.value || "tool-all-risk"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>审批状态</span>
            <select
              value={toolQuery.approval_status || ""}
              onChange={(event) =>
                updateToolQuery("approval_status", event.target.value as JobToolQuery["approval_status"])
              }
            >
              {approvalOptions.map((option) => (
                <option key={option.value || "tool-all-approval"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>绑定运行器</span>
            <input
              value={toolQuery.assigned_agent_key_id || ""}
              onChange={(event) => updateToolQuery("assigned_agent_key_id", event.target.value)}
            />
          </label>
          <label className="field">
            <span>最近上报运行器</span>
            <input
              value={toolQuery.last_reported_by_agent_key || ""}
              onChange={(event) => updateToolQuery("last_reported_by_agent_key", event.target.value)}
            />
          </label>
          <label className="field">
            <span>返回上限</span>
            <input value={toolQuery.limit || ""} onChange={(event) => updateToolQuery("limit", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleToolQuerySearch()} type="button">
            查询 Tool Query
          </button>
          <button className="button-ghost" onClick={resetToolQuery} type="button">
            重置条件
          </button>
        </div>

        {activeToolTags.length ? (
          <div className="filter-chip-row">
            {activeToolTags.map((tag) => (
              <span className="filter-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className={`status ${toolQueryState}`}>{toolQuerySummaryText}</p>

        {toolQueryResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">命中 {toolQueryResponse.summary.returned} 条</span>
              <span className="filter-chip">截断：{toolQueryResponse.summary.truncated ? "是" : "否"}</span>
              <span className="filter-chip">请求 ID：{toolQueryResponse.request_id || "未返回"}</span>
            </div>
            <div className="query-result-grid">
              {toolQueryResponse.items.map((item) => (
                <article className="tool-result-card" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <span className="eyebrow">Automation / Tool Query</span>
                      <h3>{item.name}</h3>
                    </div>
                    <span className={`pill ${item.status}`}>{getJobStatusLabel(item.status)}</span>
                  </div>
                  <div className="tool-result-meta">
                    <span className={`pill ${item.approval_status}`}>{getApprovalStatusLabel(item.approval_status)}</span>
                    <span className="pill neutral">{getRiskLabel(item.risk_level)}</span>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>申请人</dt>
                      <dd>{item.approval_requested_by_username || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>批准人</dt>
                      <dd>{item.approved_by_username || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>拒绝人</dt>
                      <dd>{item.rejected_by_username || "未记录"}</dd>
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
                      <dt>绑定运行器</dt>
                      <dd>{item.assigned_agent_key_id || "未绑定"}</dd>
                    </div>
                    <div>
                      <dt>最近上报</dt>
                      <dd>{item.last_reported_by_agent_key || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>更新时间</dt>
                      <dd>{formatDateTime(item.updated_at)}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="status idle">Tool Query 结果会在这里展示。</p>
        )}
      </section>

      <section className="panel panel-span-5">
        <div className="panel-heading">
          <h2>Handoff 交接视图</h2>
          <p>只展示 ready / claimed 任务的执行交接面，便于模拟 OpenClaw 或 runner 消费链路。</p>
        </div>

        <div className="filter-grid automation-filter-grid">
          <label className="field">
            <span>自由查询</span>
            <input value={handoffQuery.q || ""} onChange={(event) => updateHandoffQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>任务名</span>
            <input value={handoffQuery.name || ""} onChange={(event) => updateHandoffQuery("name", event.target.value)} />
          </label>
          <label className="field">
            <span>执行状态</span>
            <select
              value={handoffQuery.status || ""}
              onChange={(event) => updateHandoffQuery("status", event.target.value as JobHandoffQuery["status"])}
            >
              {handoffStatusOptions.map((option) => (
                <option key={option.value || "handoff-all-status"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>风险等级</span>
            <select
              value={handoffQuery.risk_level || ""}
              onChange={(event) => updateHandoffQuery("risk_level", event.target.value as JobHandoffQuery["risk_level"])}
            >
              {riskOptions.map((option) => (
                <option key={option.value || "handoff-all-risk"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>审批状态</span>
            <select
              value={handoffQuery.approval_status || ""}
              onChange={(event) =>
                updateHandoffQuery("approval_status", event.target.value as JobHandoffQuery["approval_status"])
              }
            >
              {approvalOptions.map((option) => (
                <option key={option.value || "handoff-all-approval"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>绑定运行器</span>
            <input
              value={handoffQuery.assigned_agent_key_id || ""}
              onChange={(event) => updateHandoffQuery("assigned_agent_key_id", event.target.value)}
            />
          </label>
          <label className="field">
            <span>最近上报运行器</span>
            <input
              value={handoffQuery.last_reported_by_agent_key || ""}
              onChange={(event) => updateHandoffQuery("last_reported_by_agent_key", event.target.value)}
            />
          </label>
          <label className="field">
            <span>返回上限</span>
            <input value={handoffQuery.limit || ""} onChange={(event) => updateHandoffQuery("limit", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleHandoffSearch()} type="button">
            查询 Handoff
          </button>
          <button className="button-ghost" onClick={resetHandoffQuery} type="button">
            重置条件
          </button>
        </div>

        {activeHandoffTags.length ? (
          <div className="filter-chip-row">
            {activeHandoffTags.map((tag) => (
              <span className="filter-chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <p className={`status ${handoffState}`}>{handoffSummaryText}</p>

        {handoffResponse ? (
          <>
            <div className="tool-summary-strip">
              <span className="filter-chip">返回 {handoffResponse.summary.returned} 条</span>
              <span className="filter-chip">截断：{handoffResponse.summary.truncated ? "是" : "否"}</span>
            </div>
            <div className="stack-grid">
              {handoffResponse.items.map((item) => (
                <article className="tool-result-card handoff-card" key={item.id}>
                  <div className="tool-result-header">
                    <div>
                      <span className="eyebrow">Automation / Handoff</span>
                      <h3>{item.name}</h3>
                    </div>
                    <span className={`pill ${item.status}`}>{getJobStatusLabel(item.status)}</span>
                  </div>
                  <div className="tool-result-meta">
                    <span className={`pill ${item.approval_status}`}>{getApprovalStatusLabel(item.approval_status)}</span>
                    <span className="pill neutral">{getRiskLabel(item.risk_level)}</span>
                  </div>
                  <dl className="tool-result-list">
                    <div>
                      <dt>就绪人</dt>
                      <dd>{item.ready_by_username || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>就绪时间</dt>
                      <dd>{formatDateTime(item.ready_at)}</dd>
                    </div>
                    <div>
                      <dt>认领人</dt>
                      <dd>{item.claimed_by_username || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>认领时间</dt>
                      <dd>{formatDateTime(item.claimed_at)}</dd>
                    </div>
                    <div>
                      <dt>绑定运行器</dt>
                      <dd>{item.assigned_agent_key_id || "未绑定"}</dd>
                    </div>
                    <div>
                      <dt>最近上报</dt>
                      <dd>{item.last_reported_by_agent_key || "未记录"}</dd>
                    </div>
                    <div>
                      <dt>最新更新时间</dt>
                      <dd>{formatDateTime(item.updated_at)}</dd>
                    </div>
                  </dl>
                  <div className="payload-preview">
                    <span>交接载荷</span>
                    <pre className="json-block">{JSON.stringify(item.payload, null, 2)}</pre>
                  </div>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className="status idle">Handoff 结果会在这里展示。</p>
        )}
      </section>
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

function hasRequiredFilter(query: Record<string, string | undefined>, ignoredKeys: string[]) {
  return Object.entries(query).some(([key, value]) => !ignoredKeys.includes(key) && Boolean(value));
}

function buildQuerySummary(summary: ToolQuerySummary, label: string) {
  return `${label} 返回 ${summary.returned} 条结果${summary.truncated ? "，已按上限截断。" : "。"} `;
}
