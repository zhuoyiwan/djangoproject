import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app/auth";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import {
  approveJob,
  cancelJob,
  claimJob,
  completeJob,
  createJob,
  failJob,
  getJobHandoff,
  getJobs,
  getJobToolQuery,
  markJobReady,
  rejectJob,
  requeueJob,
} from "../lib/api";
import {
  countJobsByStage,
  getActionAvailability,
  getWorkflowGuidance,
  getWorkflowStage,
  getWorkflowStageKey,
  isAgentAssigned,
  isAgentClaimed,
  workflowStages,
} from "../lib/automationWorkflow";
import { formatDateTime } from "../lib/format";
import type {
  JobCreateInput,
  JobHandoffItem,
  JobHandoffQuery,
  JobQuery,
  JobRecord,
  JobToolQuery,
  JobToolQueryItem,
  RequestState,
} from "../types";

const initialQuery: JobQuery = {
  search: "",
  status: "",
  risk_level: "",
  approval_status: "",
  assigned_agent_key_id: "",
  last_reported_by_agent_key: "",
  ordering: "-updated_at",
  page: "1",
  page_size: "20",
};

const initialToolQuery: JobToolQuery = {
  status: "claimed",
  limit: "6",
};

const initialHandoffQuery: JobHandoffQuery = {
  status: "ready",
  limit: "6",
};

const initialForm = {
  name: "restart-prod-web",
  risk_level: "high" as JobCreateInput["risk_level"],
  payloadText: '{\n  "target": "prod-web-01",\n  "change_window": "maintenance-window-a",\n  "playbook": "restart-nginx"\n}',
};

export function AutomationPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const [query, setQuery] = useState<JobQuery>(initialQuery);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [actionComment, setActionComment] = useState("Prepared for controlled execution.");
  const [claimAgentKey, setClaimAgentKey] = useState("");
  const [actionState, setActionState] = useState<RequestState>("idle");
  const [actionSummary, setActionSummary] = useState("Select a request to drive policy and execution.");
  const [toolQuery, setToolQuery] = useState<JobToolQuery>(initialToolQuery);
  const [toolItems, setToolItems] = useState<JobToolQueryItem[]>([]);
  const [toolState, setToolState] = useState<RequestState>("idle");
  const [toolSummary, setToolSummary] = useState("Run a filtered tool query to inspect runner-visible state.");
  const [handoffQuery, setHandoffQuery] = useState<JobHandoffQuery>(initialHandoffQuery);
  const [handoffItems, setHandoffItems] = useState<JobHandoffItem[]>([]);
  const [handoffState, setHandoffState] = useState<RequestState>("idle");
  const [handoffSummary, setHandoffSummary] = useState("Run the handoff feed to preview execution-ready jobs.");
  const {
    page: jobPage,
    state: jobState,
    summary: jobSummary,
    refresh: refreshJobs,
  } = usePaginatedResource<JobRecord, JobQuery>({
    accessToken,
    query,
    initialSummary: "Load automation jobs to inspect the full approval and execution lifecycle.",
    missingTokenSummary: "Login is required before querying automation jobs.",
    loadingSummary: "Loading automation workflow ...",
    successSummary: (response) => `Fetched ${response.results.length} jobs out of ${response.count}.`,
    fetcher: (token, activeQuery) => getJobs(baseUrl, token, activeQuery),
  });

  const jobs = jobPage?.results ?? [];
  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0] || null;
  const counts = countJobsByStage(jobs);
  const runnerBoundCount = jobs.filter(isAgentAssigned).length;
  const actionAvailability = selectedJob ? getActionAvailability(selectedJob, profile?.id) : null;

  function updateQuery<K extends keyof JobQuery>(key: K, value: JobQuery[K]) {
    setQuery((current) => ({ ...current, [key]: value }));
  }

  function updateToolQuery<K extends keyof JobToolQuery>(key: K, value: JobToolQuery[K]) {
    setToolQuery((current) => ({ ...current, [key]: value }));
  }

  function updateHandoffQuery<K extends keyof JobHandoffQuery>(key: K, value: JobHandoffQuery[K]) {
    setHandoffQuery((current) => ({ ...current, [key]: value }));
  }

  async function handleRefreshJobs() {
    const response = await refreshJobs();
    if (response) {
      setSelectedJobId((current) => current ?? response.results[0]?.id ?? null);
    }
  }

  async function handleCreateJob() {
    if (!accessToken) {
      return;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(form.payloadText) as Record<string, unknown>;
    } catch {
      setFormError("Payload JSON must be valid JSON before creating a workflow request.");
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
      await refreshJobs();
      setSelectedJobId(created.id);
      setActionState("success");
      setActionSummary(
        created.risk_level === "high"
          ? `${created.name} entered awaiting_approval immediately.`
          : `${created.name} was created as draft and can move to ready when you are prepared.`,
      );
    } catch (error) {
      setFormError((error as Error).message);
    }
  }

  async function handleAction(
    action: "approve" | "reject" | "mark-ready" | "claim" | "complete" | "fail" | "cancel" | "requeue",
  ) {
    if (!accessToken || !selectedJob) {
      return;
    }

    setActionState("loading");
    setActionSummary(`${action} ${selectedJob.name} ...`);

    try {
      const updated =
        action === "approve"
          ? await approveJob(baseUrl, accessToken, selectedJob.id, actionComment)
          : action === "reject"
            ? await rejectJob(baseUrl, accessToken, selectedJob.id, actionComment)
            : action === "mark-ready"
              ? await markJobReady(baseUrl, accessToken, selectedJob.id, { comment: actionComment })
              : action === "claim"
                ? await claimJob(baseUrl, accessToken, selectedJob.id, {
                    comment: actionComment,
                    agent_key_id: claimAgentKey.trim() || undefined,
                  })
                : action === "complete"
                  ? await completeJob(baseUrl, accessToken, selectedJob.id, { comment: actionComment })
                  : action === "fail"
                    ? await failJob(baseUrl, accessToken, selectedJob.id, { comment: actionComment })
                    : action === "cancel"
                      ? await cancelJob(baseUrl, accessToken, selectedJob.id, { comment: actionComment })
                      : await requeueJob(baseUrl, accessToken, selectedJob.id, { comment: actionComment });

      await refreshJobs();
      setSelectedJobId(updated.id);
      setActionState("success");
      setActionSummary(`${updated.name} is now ${updated.status.replace(/_/g, " ")}.`);
    } catch (error) {
      setActionState("error");
      setActionSummary((error as Error).message);
    }
  }

  async function handleRunToolQuery() {
    if (!accessToken) {
      return;
    }
    setToolState("loading");
    setToolSummary("Running tool query ...");
    try {
      const response = await getJobToolQuery(baseUrl, accessToken, toolQuery);
      setToolItems(response.items);
      setToolState("success");
      setToolSummary(`Tool query returned ${response.items.length} items.`);
    } catch (error) {
      setToolState("error");
      setToolSummary((error as Error).message);
    }
  }

  async function handleRunHandoff() {
    if (!accessToken) {
      return;
    }
    setHandoffState("loading");
    setHandoffSummary("Loading handoff feed ...");
    try {
      const response = await getJobHandoff(baseUrl, accessToken, handoffQuery);
      setHandoffItems(response.items);
      setHandoffState("success");
      setHandoffSummary(`Handoff feed returned ${response.items.length} execution-visible items.`);
    } catch (error) {
      setHandoffState("error");
      setHandoffSummary((error as Error).message);
    }
  }

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-12 workflow-hero-panel">
        <div className="split-header">
          <div>
            <p className="eyebrow">Automation workflow</p>
            <h2>Policy gate, ready queue, human claim, and runner handoff</h2>
            <p className="hero-copy">
              The latest backend contract now extends from high-risk approval into ready-queue
              orchestration, execution outcomes, and agent-visible handoff feeds.
            </p>
          </div>
          <div className="hero-metrics">
            <article className="metric-card">
              <span>Total jobs</span>
              <strong>{jobs.length}</strong>
              <small>Current page payload</small>
            </article>
            <article className="metric-card">
              <span>Awaiting approval</span>
              <strong>{counts.approval}</strong>
              <small>Policy queue depth</small>
            </article>
            <article className="metric-card">
              <span>Ready queue</span>
              <strong>{counts.ready}</strong>
              <small>Execution-ready backlog</small>
            </article>
            <article className="metric-card">
              <span>Runner bound</span>
              <strong>{runnerBoundCount}</strong>
              <small>Jobs with agent key visibility</small>
            </article>
          </div>
        </div>

        <div className="workflow-stage-grid workflow-stage-grid-compact">
          {workflowStages.map((stage) => (
            <article className="workflow-stage-card" key={stage.key}>
              <span className="stage-eyebrow">{stage.eyebrow}</span>
              <h3>{stage.label}</h3>
              <strong className="stage-count">{counts[stage.key]}</strong>
              <p>{stage.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>Workflow board</h2>
          <p>Filter the canonical job list and inspect how work moves through the documented stages.</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>Search</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={query.status || ""} onChange={(event) => updateQuery("status", event.target.value as JobQuery["status"])}>
              <option value="">Any</option>
              <option value="draft">draft</option>
              <option value="awaiting_approval">awaiting_approval</option>
              <option value="ready">ready</option>
              <option value="claimed">claimed</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="canceled">canceled</option>
            </select>
          </label>
          <label className="field">
            <span>Approval</span>
            <select
              value={query.approval_status || ""}
              onChange={(event) => updateQuery("approval_status", event.target.value as JobQuery["approval_status"])}
            >
              <option value="">Any</option>
              <option value="not_required">not_required</option>
              <option value="pending">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </label>
          <label className="field">
            <span>Risk</span>
            <select value={query.risk_level || ""} onChange={(event) => updateQuery("risk_level", event.target.value as JobQuery["risk_level"])}>
              <option value="">Any</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="field">
            <span>Assigned agent key</span>
            <input
              value={query.assigned_agent_key_id || ""}
              onChange={(event) => updateQuery("assigned_agent_key_id", event.target.value)}
            />
          </label>
          <label className="field">
            <span>Last reported key</span>
            <input
              value={query.last_reported_by_agent_key || ""}
              onChange={(event) => updateQuery("last_reported_by_agent_key", event.target.value)}
            />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleRefreshJobs()} type="button">
            Refresh board
          </button>
        </div>

        <p className={`status ${jobState}`}>{jobSummary}</p>

        <div className="workflow-stage-grid">
          {workflowStages.map((stage) => {
            const items = jobs.filter((job) => getWorkflowStageKey(job.status) === stage.key);
            return (
              <article className="workflow-stage-card workflow-stage-column" key={stage.key}>
                <div className="workflow-stage-head">
                  <div>
                    <span className="stage-eyebrow">{stage.eyebrow}</span>
                    <h3>{stage.label}</h3>
                  </div>
                  <strong className="stage-count">{items.length}</strong>
                </div>
                <p className="workflow-caption">{stage.description}</p>
                <div className="workflow-job-stack">
                  {items.length ? (
                    items.map((job) => (
                      <button
                        className={`workflow-job-card ${job.id === selectedJob?.id ? "is-active" : ""}`}
                        key={job.id}
                        onClick={() => setSelectedJobId(job.id)}
                        type="button"
                      >
                        <div className="job-card-head">
                          <strong>{job.name}</strong>
                          <span className={`pill ${job.status}`}>{job.status.replace(/_/g, " ")}</span>
                        </div>
                        <div className="workflow-pill-group">
                          <span className={`pill ${job.approval_status}`}>{job.approval_status}</span>
                          <span className={`pill risk-${job.risk_level}`}>{job.risk_level}</span>
                          {job.assigned_agent_key_id ? <span className="pill info">runner-bound</span> : null}
                        </div>
                        <p className="workflow-caption">
                          {job.claimed_by_username ||
                            job.ready_by_username ||
                            job.approval_requested_by_username ||
                            formatDateTime(job.updated_at)}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="empty-state-card">
                      <strong>No jobs</strong>
                      <p>No jobs match this stage under the current filter set.</p>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>Create request</h2>
          <p>
            New requests enter as `draft`. High-risk work is then redirected into the approval gate
            by the backend contract.
          </p>
        </div>

        <div className="stack-grid">
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="field">
            <span>Risk level</span>
            <select
              value={form.risk_level}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  risk_level: event.target.value as JobCreateInput["risk_level"],
                }))
              }
            >
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </label>
          <label className="field">
            <span>Initial status</span>
            <input value="draft" disabled readOnly />
          </label>
          <label className="field">
            <span>Payload JSON</span>
            <textarea
              className="code-input"
              rows={10}
              value={form.payloadText}
              onChange={(event) => setForm((current) => ({ ...current, payloadText: event.target.value }))}
            />
          </label>
          <p className="field-hint">
            Keep the request focused on intent and payload. Approval and execution transitions clear
            stale state server-side.
          </p>
          <button onClick={() => void handleCreateJob()} type="button">
            Create workflow request
          </button>
          {formError ? <p className="status error">{formError}</p> : null}
        </div>
      </section>

      <section className="panel panel-span-7">
        <div className="panel-heading">
          <h2>Selected job cockpit</h2>
          <p>Review stage, payload, runner binding, and execution metadata before acting.</p>
        </div>

        {selectedJob ? (
          <div className="detail-shell">
            <div className="summary-grid">
              <article className="summary-card">
                <span>Workflow stage</span>
                <strong>{getWorkflowStage(selectedJob.status).label}</strong>
                <small>{selectedJob.status.replace(/_/g, " ")}</small>
              </article>
              <article className="summary-card">
                <span>Approval</span>
                <strong>{selectedJob.approval_status}</strong>
                <small>
                  {selectedJob.approval_requested_at
                    ? `Requested ${formatDateTime(selectedJob.approval_requested_at)}`
                    : "No approval request recorded"}
                </small>
              </article>
              <article className="summary-card">
                <span>Runner visibility</span>
                <strong>{selectedJob.assigned_agent_key_id || "Unbound"}</strong>
                <small>Last report: {selectedJob.last_reported_by_agent_key || "none"}</small>
              </article>
              <article className="summary-card">
                <span>Detail route</span>
                <strong>
                  <Link className="inline-link" to={`/automation/${selectedJob.id}`}>
                    Open dedicated route
                  </Link>
                </strong>
                <small>Single-job review and action surface.</small>
              </article>
            </div>

            <div className="workflow-timeline">
              {buildTimeline(selectedJob).map((step) => (
                <article className={`timeline-node ${step.state}`} key={step.label}>
                  <span>{step.label}</span>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </article>
              ))}
            </div>

            <article className="highlight-card compact-card">
              <h3>Workflow note</h3>
              <p>{getWorkflowGuidance(selectedJob, profile?.id)}</p>
              <div className="workflow-pill-group">
                <span className={`pill ${selectedJob.approval_status}`}>{selectedJob.approval_status}</span>
                <span className={`pill ${selectedJob.status}`}>{selectedJob.status.replace(/_/g, " ")}</span>
                <span className={`pill risk-${selectedJob.risk_level}`}>{selectedJob.risk_level}</span>
                {isAgentClaimed(selectedJob) ? <span className="pill info">agent-claimed</span> : null}
              </div>
            </article>

            <article className="highlight-card compact-card">
              <h3>Payload</h3>
              <pre className="json-block">{JSON.stringify(selectedJob.payload, null, 2)}</pre>
            </article>

            <article className="highlight-card compact-card">
              <h3>Execution outcome</h3>
              <p>Summary: {selectedJob.execution_summary || "No execution summary recorded."}</p>
              <p>Completed: {formatDateTime(selectedJob.completed_at)}</p>
              <p>Failed: {formatDateTime(selectedJob.failed_at)}</p>
              <pre className="json-block">{JSON.stringify(selectedJob.execution_metadata, null, 2)}</pre>
            </article>
          </div>
        ) : (
          <p className="status idle">Select a workflow card after loading the board.</p>
        )}
      </section>

      <section className="panel panel-span-5">
        <div className="panel-heading">
          <h2>Action cockpit</h2>
          <p>
            Mirrors the documented human-side transitions. Agent-only callbacks stay read-only and
            surface through the handoff feeds and runner fields.
          </p>
        </div>

        <div className="stack-grid">
          <label className="field">
            <span>Comment</span>
            <textarea rows={4} value={actionComment} onChange={(event) => setActionComment(event.target.value)} />
          </label>
          <label className="field">
            <span>Optional agent key on claim</span>
            <input value={claimAgentKey} onChange={(event) => setClaimAgentKey(event.target.value)} />
          </label>
          <div className="action-cluster">
            <button disabled={!selectedJob || !actionAvailability?.canApprove} onClick={() => void handleAction("approve")} type="button">
              Approve
            </button>
            <button className="button-ghost" disabled={!selectedJob || !actionAvailability?.canReject} onClick={() => void handleAction("reject")} type="button">
              Reject
            </button>
            <button disabled={!selectedJob || !actionAvailability?.canMarkReady} onClick={() => void handleAction("mark-ready")} type="button">
              Mark ready
            </button>
            <button disabled={!selectedJob || !actionAvailability?.canClaim} onClick={() => void handleAction("claim")} type="button">
              Claim
            </button>
            <button disabled={!selectedJob || !actionAvailability?.canComplete} onClick={() => void handleAction("complete")} type="button">
              Complete
            </button>
            <button className="button-ghost" disabled={!selectedJob || !actionAvailability?.canFail} onClick={() => void handleAction("fail")} type="button">
              Fail
            </button>
            <button className="button-ghost" disabled={!selectedJob || !actionAvailability?.canCancel} onClick={() => void handleAction("cancel")} type="button">
              Cancel
            </button>
            <button className="button-ghost" disabled={!selectedJob || !actionAvailability?.canRequeue} onClick={() => void handleAction("requeue")} type="button">
              Requeue
            </button>
          </div>
          <p className={`status ${actionState}`}>{actionSummary}</p>
        </div>
      </section>

      <section className="panel panel-span-6">
        <div className="panel-heading">
          <h2>Tool query mirror</h2>
          <p>Normalized read-only search for runner visibility, status, and ownership fields.</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>Query</span>
            <input value={toolQuery.q || ""} onChange={(event) => updateToolQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={toolQuery.status || ""} onChange={(event) => updateToolQuery("status", event.target.value as JobToolQuery["status"])}>
              <option value="">Any</option>
              <option value="ready">ready</option>
              <option value="claimed">claimed</option>
              <option value="completed">completed</option>
              <option value="failed">failed</option>
              <option value="canceled">canceled</option>
            </select>
          </label>
          <label className="field">
            <span>Runner key</span>
            <input value={toolQuery.assigned_agent_key_id || ""} onChange={(event) => updateToolQuery("assigned_agent_key_id", event.target.value)} />
          </label>
          <label className="field">
            <span>Limit</span>
            <input value={toolQuery.limit || ""} onChange={(event) => updateToolQuery("limit", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleRunToolQuery()} type="button">
            Run tool query
          </button>
        </div>

        <p className={`status ${toolState}`}>{toolSummary}</p>

        <div className="stack-grid">
          {toolItems.length ? (
            toolItems.map((item) => (
              <article className="query-result-card" key={item.id}>
                <div className="job-card-head">
                  <strong>{item.name}</strong>
                  <span className={`pill ${item.status}`}>{item.status.replace(/_/g, " ")}</span>
                </div>
                <div className="workflow-pill-group">
                  <span className={`pill ${item.approval_status}`}>{item.approval_status}</span>
                  <span className={`pill risk-${item.risk_level}`}>{item.risk_level}</span>
                </div>
                <p>Ready by: {item.ready_by_username || "n/a"}</p>
                <p>Claimed by: {item.claimed_by_username || "n/a"}</p>
                <p>Runner key: <span className="mono">{item.assigned_agent_key_id || "none"}</span></p>
              </article>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>No tool query data</strong>
              <p>The normalized response appears here after you run a filtered query.</p>
            </div>
          )}
        </div>
      </section>

      <section className="panel panel-span-6">
        <div className="panel-heading">
          <h2>Handoff feed mirror</h2>
          <p>Read-only adapter view for `ready` and `claimed` jobs, including runner-bound payloads.</p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>Query</span>
            <input value={handoffQuery.q || ""} onChange={(event) => updateHandoffQuery("q", event.target.value)} />
          </label>
          <label className="field">
            <span>Status</span>
            <select value={handoffQuery.status || ""} onChange={(event) => updateHandoffQuery("status", event.target.value as JobHandoffQuery["status"])}>
              <option value="">Any</option>
              <option value="ready">ready</option>
              <option value="claimed">claimed</option>
            </select>
          </label>
          <label className="field">
            <span>Runner key</span>
            <input value={handoffQuery.assigned_agent_key_id || ""} onChange={(event) => updateHandoffQuery("assigned_agent_key_id", event.target.value)} />
          </label>
          <label className="field">
            <span>Limit</span>
            <input value={handoffQuery.limit || ""} onChange={(event) => updateHandoffQuery("limit", event.target.value)} />
          </label>
        </div>

        <div className="actions">
          <button onClick={() => void handleRunHandoff()} type="button">
            Load handoff
          </button>
        </div>

        <p className={`status ${handoffState}`}>{handoffSummary}</p>

        <div className="stack-grid">
          {handoffItems.length ? (
            handoffItems.map((item) => (
              <article className="query-result-card" key={item.id}>
                <div className="job-card-head">
                  <strong>{item.name}</strong>
                  <span className={`pill ${item.status}`}>{item.status}</span>
                </div>
                <div className="workflow-pill-group">
                  <span className={`pill ${item.approval_status}`}>{item.approval_status}</span>
                  <span className={`pill risk-${item.risk_level}`}>{item.risk_level}</span>
                </div>
                <p>Ready at: {formatDateTime(item.ready_at)}</p>
                <p>Claimed at: {formatDateTime(item.claimed_at)}</p>
                <p>Runner key: <span className="mono">{item.assigned_agent_key_id || "none"}</span></p>
                <pre className="json-block">{JSON.stringify(item.payload, null, 2)}</pre>
              </article>
            ))
          ) : (
            <div className="empty-state-card">
              <strong>No handoff feed data</strong>
              <p>The adapter-facing view appears here after you run a filtered feed query.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function buildTimeline(job: JobRecord) {
  return [
    {
      label: "Create",
      title: "Request captured",
      detail: `Created ${formatDateTime(job.created_at)}`,
      state: "complete",
    },
    {
      label: "Approve",
      title:
        job.approval_status === "pending"
          ? "Waiting for approval"
          : job.approval_status === "approved"
            ? "Approved"
            : job.approval_status === "rejected"
              ? "Rejected"
              : "Approval bypassed",
      detail: job.approval_requested_at
        ? `Requested ${formatDateTime(job.approval_requested_at)}`
        : "Low or medium risk requests skip this gate.",
      state: job.approval_status === "pending" ? "current" : "complete",
    },
    {
      label: "Ready",
      title: job.ready_at ? "Prepared for execution" : "Waiting for ready transition",
      detail: job.ready_at ? formatDateTime(job.ready_at) : "Only policy-compliant drafts can become ready.",
      state:
        job.status === "ready" || job.status === "claimed" || job.status === "completed" || job.status === "failed" || job.status === "canceled"
          ? "complete"
          : "upcoming",
    },
    {
      label: "Claim",
      title: job.claimed_at ? (isAgentClaimed(job) ? "Runner claimed" : "Operator claimed") : "Awaiting claim",
      detail: job.claimed_at
        ? `${formatDateTime(job.claimed_at)} by ${job.claimed_by_username || job.assigned_agent_key_id || "runner"}`
        : "A human or runner key can claim from the ready queue.",
      state:
        job.status === "claimed"
          ? "current"
          : job.status === "completed" || job.status === "failed" || job.status === "canceled"
            ? "complete"
            : "upcoming",
    },
    {
      label: "Outcome",
      title:
        job.status === "completed"
          ? "Completed"
          : job.status === "failed"
            ? "Failed"
            : job.status === "canceled"
              ? "Canceled"
              : "Open",
      detail: job.completed_at
        ? formatDateTime(job.completed_at)
        : job.failed_at
          ? formatDateTime(job.failed_at)
          : "Terminal transitions appear here once execution closes.",
      state: job.status === "completed" || job.status === "failed" || job.status === "canceled" ? "current" : "upcoming",
    },
  ];
}
