import { Link, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../app/auth";
import { approveJob, getJob, rejectJob } from "../lib/api";
import type { JobRecord, RequestState } from "../types";

export function AutomationDetailPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const { jobId } = useParams();
  const [job, setJob] = useState<JobRecord | null>(null);
  const [detailState, setDetailState] = useState<RequestState>("idle");
  const [detailSummary, setDetailSummary] = useState("Load a job to inspect approval state.");
  const [comment, setComment] = useState("Reviewed in detail route.");

  useEffect(() => {
    void loadJob();
  }, [jobId, accessToken, baseUrl]);

  async function loadJob() {
    if (!accessToken || !jobId) {
      return;
    }
    setDetailState("loading");
    setDetailSummary("Loading automation job detail ...");
    try {
      const response = await getJob(baseUrl, accessToken, Number(jobId));
      setJob(response);
      setDetailState("success");
      setDetailSummary(`Loaded ${response.name} with ${response.approval_status} approval status.`);
    } catch (error) {
      setDetailState("error");
      setDetailSummary((error as Error).message);
    }
  }

  async function handleAction(action: "approve" | "reject") {
    if (!accessToken || !job) {
      return;
    }
    setDetailState("loading");
    setDetailSummary(`${action === "approve" ? "Approving" : "Rejecting"} ${job.name} ...`);
    try {
      const response =
        action === "approve"
          ? await approveJob(baseUrl, accessToken, job.id, comment)
          : await rejectJob(baseUrl, accessToken, job.id, comment);
      setJob(response);
      setDetailState("success");
      setDetailSummary(`Job ${response.name} is now ${response.approval_status}.`);
    } catch (error) {
      setDetailState("error");
      setDetailSummary((error as Error).message);
    }
  }

  const canAct =
    job &&
    job.approval_status === "pending" &&
    job.approval_requested_by !== profile?.id;

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>Automation job detail</h2>
          <p>Dedicated route for approval review, payload inspection, and action history context.</p>
        </div>
        <div className="actions">
          <Link className="button-link button-link-ghost" to="/automation">
            Back to automation list
          </Link>
          <button onClick={() => void loadJob()} type="button">
            Refresh detail
          </button>
        </div>
        <p className={`status ${detailState}`}>{detailSummary}</p>
      </section>

      <section className="panel panel-span-8">
        {job ? (
          <div className="detail-shell">
            <div className="summary-grid">
              <article className="summary-card">
                <span>Name</span>
                <strong>{job.name}</strong>
                <small>Status: {job.status}</small>
              </article>
              <article className="summary-card">
                <span>Risk</span>
                <strong>{job.risk_level}</strong>
                <small>Approval: {job.approval_status}</small>
              </article>
              <article className="summary-card">
                <span>Requester</span>
                <strong>{job.approval_requested_by_username || "n/a"}</strong>
                <small>
                  Requested: {job.approval_requested_at ? formatDateTime(job.approval_requested_at) : "n/a"}
                </small>
              </article>
              <article className="summary-card">
                <span>Updated</span>
                <strong>{formatDateTime(job.updated_at)}</strong>
                <small>Created: {formatDateTime(job.created_at)}</small>
              </article>
            </div>

            <article className="highlight-card compact-card">
              <h3>Payload</h3>
              <pre className="json-block">{JSON.stringify(job.payload, null, 2)}</pre>
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
              <h3>Decision trail</h3>
              <p>Approved by: {job.approved_by_username || "n/a"}</p>
              <p>Rejected by: {job.rejected_by_username || "n/a"}</p>
              <p>Comment: {job.approval_comment || "No comment recorded."}</p>
            </article>

            <article className="highlight-card compact-card">
              <h3>Action panel</h3>
              <label className="field">
                <span>Approval comment</span>
                <textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} />
              </label>
              <div className="actions">
                <button disabled={!canAct} onClick={() => void handleAction("approve")} type="button">
                  Approve
                </button>
                <button className="button-ghost" disabled={!canAct} onClick={() => void handleAction("reject")} type="button">
                  Reject
                </button>
              </div>
              {!canAct ? (
                <p className="status idle">
                  {job.approval_status !== "pending"
                    ? "This job is no longer pending approval."
                    : job.approval_requested_by === profile?.id
                      ? "Requesters cannot approve or reject their own jobs."
                      : "Approval requires approver or platform_admin access."}
                </p>
              ) : null}
            </article>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "n/a";
  }
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
