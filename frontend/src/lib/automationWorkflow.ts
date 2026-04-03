import type {
  JobExecutionStatus,
  JobRecord,
} from "../types";

export type WorkflowStageKey = "draft" | "approval" | "ready" | "claimed" | "closed";

export type WorkflowStage = {
  key: WorkflowStageKey;
  label: string;
  eyebrow: string;
  description: string;
  statuses: JobExecutionStatus[];
};

export const workflowStages: WorkflowStage[] = [
  {
    key: "draft",
    label: "Draft intake",
    eyebrow: "Authoring",
    description: "Ops-authored jobs waiting for approval or execution preparation.",
    statuses: ["draft"],
  },
  {
    key: "approval",
    label: "Approval gate",
    eyebrow: "Policy",
    description: "High-risk work requests paused until an approver records a decision.",
    statuses: ["awaiting_approval"],
  },
  {
    key: "ready",
    label: "Ready queue",
    eyebrow: "Handoff",
    description: "Approved or approval-free jobs prepared for a human or agent runner.",
    statuses: ["ready"],
  },
  {
    key: "claimed",
    label: "Active execution",
    eyebrow: "In flight",
    description: "A human or bound automation runner has taken ownership of execution.",
    statuses: ["claimed"],
  },
  {
    key: "closed",
    label: "Closed loop",
    eyebrow: "Outcome",
    description: "Execution has ended in completion, failure, or cancellation.",
    statuses: ["completed", "failed", "canceled"],
  },
];

export function getWorkflowStageKey(status: JobExecutionStatus): WorkflowStageKey {
  if (status === "awaiting_approval") {
    return "approval";
  }
  if (status === "ready") {
    return "ready";
  }
  if (status === "claimed") {
    return "claimed";
  }
  if (status === "completed" || status === "failed" || status === "canceled") {
    return "closed";
  }
  return "draft";
}

export function getWorkflowStage(status: JobExecutionStatus) {
  const key = getWorkflowStageKey(status);
  return workflowStages.find((stage) => stage.key === key) ?? workflowStages[0];
}

export function countJobsByStage(jobs: JobRecord[]) {
  return workflowStages.reduce<Record<WorkflowStageKey, number>>(
    (accumulator, stage) => {
      accumulator[stage.key] = jobs.filter((job) => getWorkflowStageKey(job.status) === stage.key).length;
      return accumulator;
    },
    {
      draft: 0,
      approval: 0,
      ready: 0,
      claimed: 0,
      closed: 0,
    },
  );
}

export function isAgentAssigned(job: JobRecord) {
  return Boolean(job.assigned_agent_key_id);
}

export function isAgentClaimed(job: JobRecord) {
  return job.status === "claimed" && job.claimed_by === null && Boolean(job.assigned_agent_key_id);
}

export function isHumanClaimed(job: JobRecord) {
  return job.status === "claimed" && job.claimed_by !== null;
}

export function getActionAvailability(job: JobRecord, profileId?: number | null) {
  const isOwnClaim = Boolean(profileId && job.claimed_by === profileId);
  const canApprove = job.approval_status === "pending" && job.approval_requested_by !== profileId;
  const canMarkReady =
    job.status === "draft" &&
    ((job.risk_level === "high" && job.approval_status === "approved") ||
      (job.risk_level !== "high" && job.approval_status === "not_required"));
  const canClaim = job.status === "ready";
  const canComplete = job.status === "claimed" && (job.claimed_by === null || isOwnClaim);
  const canFail = canComplete;
  const canCancel =
    job.status === "ready" || (job.status === "claimed" && (job.claimed_by === null || isOwnClaim));
  const canRequeue =
    job.status === "failed" || (job.status === "claimed" && (job.claimed_by === null || isOwnClaim));

  return {
    canApprove,
    canReject: canApprove,
    canMarkReady,
    canClaim,
    canComplete,
    canFail,
    canCancel,
    canRequeue,
  };
}

export function getWorkflowGuidance(job: JobRecord, profileId?: number | null) {
  if (job.status === "awaiting_approval") {
    return job.approval_requested_by === profileId
      ? "This request is waiting on another approver. Requesters cannot approve their own high-risk jobs."
      : "A high-risk request is paused at the approval gate. Approve or reject before execution can continue.";
  }
  if (job.status === "draft") {
    if (job.risk_level === "high" && job.approval_status !== "approved") {
      return "High-risk jobs must be approved before they can move to the ready queue.";
    }
    return "Draft jobs can be prepared for execution with mark-ready once policy requirements are satisfied.";
  }
  if (job.status === "ready") {
    return "Ready jobs can be claimed by a human operator or bound to an agent key for runner handoff.";
  }
  if (job.status === "claimed") {
    return isAgentClaimed(job)
      ? "This job is bound to an automation runner key. Human recovery actions remain possible for ops roles."
      : "This job is claimed by a human operator. Finish, fail, cancel, or requeue it from the action cockpit.";
  }
  if (job.status === "failed") {
    return "Failed jobs can be requeued back to ready after reviewing the execution outcome.";
  }
  if (job.status === "completed") {
    return "Execution has completed. Review any summary or metadata before creating the next run.";
  }
  return "This job has been canceled. Re-open work by creating a fresh request if needed.";
}
