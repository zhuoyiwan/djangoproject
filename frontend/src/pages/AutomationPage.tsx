import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../app/auth";
import { usePaginatedResource } from "../hooks/usePaginatedResource";
import { approveJob, createJob, getJobs, rejectJob } from "../lib/api";
import { formatDateTime } from "../lib/format";
import type { JobCreateInput, JobQuery, JobRecord } from "../types";

const initialQuery: JobQuery = {
  search: "",
  ordering: "-created_at",
  page: "1",
  page_size: "20",
};

type JobFormState = {
  name: string;
  status: string;
  risk_level: JobCreateInput["risk_level"];
  payloadText: string;
};

const initialForm: JobFormState = {
  name: "restart-prod",
  status: "pending",
  risk_level: "high" as const,
  payloadText: '{\n  "target": "prod-web-01",\n  "change_window": "maintenance-window-a"\n}',
};

export function AutomationPage() {
  const { accessToken, baseUrl, profile } = useAuth();
  const [query, setQuery] = useState<JobQuery>(initialQuery);
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState("Approved after reviewing risk and target.");
  const {
    page: jobPage,
    state: jobState,
    summary: jobSummary,
    refresh: refreshJobs,
  } = usePaginatedResource<JobRecord, JobQuery>({
    accessToken,
    query,
    initialSummary: "Load automation jobs to inspect approval flow state.",
    missingTokenSummary: "Login is required before querying automation jobs.",
    loadingSummary: "Loading automation jobs and approval state ...",
    successSummary: (response) => `Fetched ${response.results.length} jobs out of ${response.count}.`,
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
      setFormError("Payload JSON must be valid JSON before creating a job.");
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
      [key]: value,
    }));
  }

  const selectedJob =
    jobPage?.results.find((job) => job.id === selectedJobId) || jobPage?.results[0] || null;
  const canActOnSelectedJob =
    selectedJob &&
    selectedJob.approval_status === "pending" &&
    selectedJob.approval_requested_by !== profile?.id;

  return (
    <main className="workspace-grid">
      <section className="panel panel-span-8">
        <div className="panel-heading">
          <h2>Automation jobs</h2>
          <p>
            Browse live jobs, create new requests, and inspect which runs need explicit approval.
          </p>
        </div>

        <div className="filter-grid">
          <label className="field">
            <span>Search</span>
            <input value={query.search || ""} onChange={(event) => updateQuery("search", event.target.value)} />
          </label>
          <label className="field">
            <span>Ordering</span>
            <input value={query.ordering || ""} onChange={(event) => updateQuery("ordering", event.target.value)} />
          </label>
          <label className="field">
            <span>Page</span>
            <input value={query.page || ""} onChange={(event) => updateQuery("page", event.target.value)} />
          </label>
          <label className="field">
            <span>Page size</span>
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
            Refresh jobs
          </button>
        </div>

        <p className={`status ${jobState}`}>{jobSummary}</p>

        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Approval</th>
                <th>Requester</th>
                <th>Updated</th>
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
                    <td>{job.status}</td>
                    <td>{job.risk_level}</td>
                    <td>
                      <span className={`pill ${job.approval_status}`}>{job.approval_status}</span>
                    </td>
                    <td>{job.approval_requested_by_username || "n/a"}</td>
                    <td>{formatDateTime(job.updated_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No automation jobs loaded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-span-4">
        <div className="panel-heading">
          <h2>Create automation job</h2>
          <p>
            High-risk jobs will enter the approval workflow immediately. Payload is sent as raw JSON.
          </p>
        </div>

        <div className="stack-grid">
          <label className="field">
            <span>Name</span>
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="field">
            <span>Status</span>
            <input
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
            />
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
            <span>Payload JSON</span>
            <textarea
              className="code-input"
              rows={8}
              value={form.payloadText}
              onChange={(event) => setForm((current) => ({ ...current, payloadText: event.target.value }))}
            />
          </label>
          <button onClick={() => void handleCreateJob()} type="button">
            Create job
          </button>
          {formError ? <p className="status error">{formError}</p> : null}
        </div>
      </section>

      <section className="panel panel-span-12">
        <div className="panel-heading">
          <h2>Selected job</h2>
          <p>Inspect approval metadata and take action when the selected job is eligible.</p>
        </div>

        {selectedJob ? (
          <div className="summary-grid">
            <article className="summary-card">
              <span>Name</span>
              <strong>{selectedJob.name}</strong>
              <small>Status: {selectedJob.status}</small>
            </article>
            <article className="summary-card">
              <span>Approval state</span>
              <strong>{selectedJob.approval_status}</strong>
              <small>Risk: {selectedJob.risk_level}</small>
            </article>
            <article className="summary-card">
              <span>Requester</span>
              <strong>{selectedJob.approval_requested_by_username || "n/a"}</strong>
              <small>
                Requested: {selectedJob.approval_requested_at ? formatDateTime(selectedJob.approval_requested_at) : "n/a"}
              </small>
            </article>
            <article className="summary-card">
              <span>Decision</span>
              <strong>{selectedJob.approved_by_username || selectedJob.rejected_by_username || "Pending"}</strong>
              <small>
                {selectedJob.approved_at
                  ? `Approved ${formatDateTime(selectedJob.approved_at)}`
                  : selectedJob.rejected_at
                    ? `Rejected ${formatDateTime(selectedJob.rejected_at)}`
                    : "No decision recorded"}
              </small>
            </article>

            <article className="summary-card">
              <span>Route</span>
              <strong>
                <Link className="inline-link" to={`/automation/${selectedJob.id}`}>
                  Open job detail
                </Link>
              </strong>
              <small>Use the dedicated route for a single-job review view.</small>
            </article>

            <article className="highlight-card compact-card">
              <h3>Payload</h3>
              <pre className="json-block">{JSON.stringify(selectedJob.payload, null, 2)}</pre>
            </article>

            <article className="highlight-card compact-card">
              <h3>Approval note</h3>
              <p>{selectedJob.approval_comment || "No approval comment recorded yet."}</p>
            </article>

            <article className="highlight-card compact-card">
              <h3>Approve or reject</h3>
              <label className="field">
                <span>Decision comment</span>
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
                  Approve
                </button>
                <button
                  className="button-ghost"
                  disabled={!canActOnSelectedJob}
                  onClick={() => void handleApprovalAction("reject")}
                  type="button"
                >
                  Reject
                </button>
              </div>
              {!canActOnSelectedJob ? (
                <p className="status idle">
                  {selectedJob.approval_status !== "pending"
                    ? "Only pending high-risk jobs can transition approval state."
                    : selectedJob.approval_requested_by === profile?.id
                      ? "Requesters cannot approve or reject their own jobs."
                      : "Approval actions require approver or platform_admin access."}
                </p>
              ) : null}
            </article>
          </div>
        ) : (
          <p className="status idle">Select an automation job after loading the list.</p>
        )}
      </section>
    </main>
  );
}
