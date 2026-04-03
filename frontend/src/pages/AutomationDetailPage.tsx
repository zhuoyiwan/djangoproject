import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../app/auth";
import { useResourceDetail } from "../hooks/useResourceDetail";
import {
  approveJob,
  cancelJob,
  claimJob,
  completeJob,
  failJob,
  getJob,
  markJobReady,
  rejectJob,
  requeueJob,
} from "../lib/api";
import { getActionAvailability, getWorkflowGuidance, getWorkflowStage, isAgentClaimed } from "../lib/automationWorkflow";
import { formatDateTime } from "../lib/format";
import type { JobRecord } from "../types";

export function AutomationDetailPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const { jobId } = useParams();
  const [comment, setComment] = useState("Reviewed in the dedicated workflow route.");
  const [claimAgentKey, setClaimAgentKey] = useState("");
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
    initialSummary: "Load a workflow request to inspect its detailed execution state.",
    missingTokenSummary: "Login is required before loading automation detail.",
    loadingSummary: (id) => `Loading automation job ${id} ...`,
    successSummary: (response) => `Loaded ${response.name} in ${response.status}.`,
    fetcher: (token, id) => getJob(baseUrl, token, id),
  });

  const actionAvailability = job ? getActionAvailability(job, profile?.id) : null;

  async function handleAction(
    action: "approve" | "reject" | "mark-ready" | "claim" | "complete" | "fail" | "cancel" | "requeue",
  ) {
    if (!accessToken || !job) {
      return;
    }

    setDetailState("loading");
    setDetailSummary(`${action} ${job.name} ...`);

    try {
      const updated =
        action === "approve"
          ? await approveJob(baseUrl, accessToken, job.id, comment)
          : action === "reject"
            ? await rejectJob(baseUrl, accessToken, job.id, comment)
            : action === "mark-ready"
              ? await markJobReady(baseUrl, accessToken, job.id, { comment })
              : action === "claim"
                ? await claimJob(baseUrl, accessToken, job.id, {
                    comment,
                    agent_key_id: claimAgentKey.trim() || undefined,
                  })
                : action === "complete"
                  ? await completeJob(baseUrl, accessToken, job.id, { comment })
                  : action === "fail"
                    ? await failJob(baseUrl, accessToken, job.id, { comment })
                    : action === "cancel"
                      ? await cancelJob(baseUrl, accessToken, job.id, { comment })
                      : await requeueJob(baseUrl, accessToken, job.id, { comment });

      setJob(updated);
      setDetailState("success");
      setDetailSummary(`${updated.name} is now ${updated.status.replace(/_/g, " ")}.`);
    } catch (error) {
      setDetailState("error");
      setDetailSummary((error as Error).message);
    }
  }

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-12 workflow-hero-panel">
        <div className="split-header">
          <div>
            <p className="eyebrow">Automation detail</p>
            <h2>Single-request workflow review</h2>
            <p className="hero-copy">
              Use this route when you need a dedicated surface for approval history, runner binding,
              and terminal execution control.
            </p>
          </div>
          <div className="actions">
            <Link className="button-link button-link-ghost" to="/automation">
              Back to workflow board
            </Link>
            <button onClick={() => void refreshJob()} type="button">
              Refresh detail
            </button>
          </div>
        </div>
        <p className={`status ${detailState}`}>{detailSummary}</p>
      </section>

      <section className="panel panel-span-8">
        {job ? (
          <div className="detail-shell">
            <div className="summary-grid">
              <article className="summary-card">
                <span>Stage</span>
                <strong>{getWorkflowStage(job.status).label}</strong>
                <small>{job.status.replace(/_/g, " ")}</small>
              </article>
              <article className="summary-card">
                <span>Approval</span>
                <strong>{job.approval_status}</strong>
                <small>{job.approval_requested_at ? formatDateTime(job.approval_requested_at) : "No pending approval"}</small>
              </article>
              <article className="summary-card">
                <span>Runner key</span>
                <strong>{job.assigned_agent_key_id || "Unbound"}</strong>
                <small>Last report: {job.last_reported_by_agent_key || "none"}</small>
              </article>
              <article className="summary-card">
                <span>Updated</span>
                <strong>{formatDateTime(job.updated_at)}</strong>
                <small>Created: {formatDateTime(job.created_at)}</small>
              </article>
            </div>

            <div className="workflow-timeline">
              <article className="timeline-node complete">
                <span>Approval</span>
                <strong>{job.approval_status}</strong>
                <small>{job.approval_comment || "No approval comment recorded."}</small>
              </article>
              <article className={`timeline-node ${job.ready_at ? "complete" : "upcoming"}`}>
                <span>Ready</span>
                <strong>{job.ready_at ? "Prepared" : "Waiting"}</strong>
                <small>{job.ready_at ? `${formatDateTime(job.ready_at)} by ${job.ready_by_username || "ops"}` : "Not in ready queue yet."}</small>
              </article>
              <article className={`timeline-node ${job.claimed_at ? (job.status === "claimed" ? "current" : "complete") : "upcoming"}`}>
                <span>Claim</span>
                <strong>{job.claimed_at ? (isAgentClaimed(job) ? "Runner claimed" : "Operator claimed") : "Open"}</strong>
                <small>{job.claimed_at ? `${formatDateTime(job.claimed_at)} by ${job.claimed_by_username || job.assigned_agent_key_id || "runner"}` : "Unclaimed"}</small>
              </article>
              <article className={`timeline-node ${job.status === "completed" || job.status === "failed" || job.status === "canceled" ? "current" : "upcoming"}`}>
                <span>Outcome</span>
                <strong>{job.status.replace(/_/g, " ")}</strong>
                <small>{job.completed_at ? formatDateTime(job.completed_at) : job.failed_at ? formatDateTime(job.failed_at) : "No terminal result yet."}</small>
              </article>
            </div>

            <article className="highlight-card compact-card">
              <h3>Workflow guidance</h3>
              <p>{getWorkflowGuidance(job, profile?.id)}</p>
              <div className="workflow-pill-group">
                <span className={`pill ${job.approval_status}`}>{job.approval_status}</span>
                <span className={`pill ${job.status}`}>{job.status.replace(/_/g, " ")}</span>
                <span className={`pill risk-${job.risk_level}`}>{job.risk_level}</span>
              </div>
            </article>

            <article className="highlight-card compact-card">
              <h3>Payload</h3>
              <pre className="json-block">{JSON.stringify(job.payload, null, 2)}</pre>
            </article>

            <article className="highlight-card compact-card">
              <h3>Execution record</h3>
              <p>Summary: {job.execution_summary || "No execution summary recorded."}</p>
              <pre className="json-block">{JSON.stringify(job.execution_metadata, null, 2)}</pre>
            </article>
          </div>
        ) : (
          <p className="status idle">No job loaded.</p>
        )}
      </section>

      <section className="panel panel-span-4">
        {job ? (
          <div className="stack-grid">
            <article className="highlight-card compact-card">
              <h3>Action cockpit</h3>
              <label className="field">
                <span>Comment</span>
                <textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <label className="field">
                <span>Optional agent key on claim</span>
                <input value={claimAgentKey} onChange={(event) => setClaimAgentKey(event.target.value)} />
              </label>
              <div className="action-cluster">
                <button disabled={!actionAvailability?.canApprove} onClick={() => void handleAction("approve")} type="button">
                  Approve
                </button>
                <button className="button-ghost" disabled={!actionAvailability?.canReject} onClick={() => void handleAction("reject")} type="button">
                  Reject
                </button>
                <button disabled={!actionAvailability?.canMarkReady} onClick={() => void handleAction("mark-ready")} type="button">
                  Mark ready
                </button>
                <button disabled={!actionAvailability?.canClaim} onClick={() => void handleAction("claim")} type="button">
                  Claim
                </button>
                <button disabled={!actionAvailability?.canComplete} onClick={() => void handleAction("complete")} type="button">
                  Complete
                </button>
                <button className="button-ghost" disabled={!actionAvailability?.canFail} onClick={() => void handleAction("fail")} type="button">
                  Fail
                </button>
                <button className="button-ghost" disabled={!actionAvailability?.canCancel} onClick={() => void handleAction("cancel")} type="button">
                  Cancel
                </button>
                <button className="button-ghost" disabled={!actionAvailability?.canRequeue} onClick={() => void handleAction("requeue")} type="button">
                  Requeue
                </button>
              </div>
            </article>

            <article className="highlight-card compact-card">
              <h3>Execution ownership</h3>
              <p>Approved by: {job.approved_by_username || "n/a"}</p>
              <p>Rejected by: {job.rejected_by_username || "n/a"}</p>
              <p>Ready by: {job.ready_by_username || "n/a"}</p>
              <p>Claimed by: {job.claimed_by_username || "n/a"}</p>
            </article>
          </div>
        ) : null}
      </section>
    </main>
  );
}
