export type ApiErrorShape = {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  request_id?: string;
};

export type RequestState = "idle" | "loading" | "success" | "error";

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type AuthTokens = {
  access: string;
  refresh: string;
};

export type UserProfile = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
};

export type JobExecutionStatus =
  | "draft"
  | "awaiting_approval"
  | "ready"
  | "claimed"
  | "completed"
  | "failed"
  | "canceled";

export type ServerRecord = {
  id: number;
  hostname: string;
  internal_ip: string;
  external_ip: string | null;
  os_version: string;
  environment: "dev" | "test" | "prod";
  lifecycle_status: "online" | "offline" | "maintenance" | "pre_allocated";
  source: "manual" | "agent" | "api";
  idc: number | null;
  idc_name: string;
  cpu_cores: number;
  memory_gb: string;
  disk_summary: string;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ServerQuery = {
  search?: string;
  ordering?: string;
  page?: string;
  page_size?: string;
  environment?: string;
  lifecycle_status?: string;
  source?: string;
};

export type JobRecord = {
  id: number;
  name: string;
  status: JobExecutionStatus;
  risk_level: "low" | "medium" | "high";
  approval_status: "not_required" | "pending" | "approved" | "rejected";
  approval_requested_by: number | null;
  approval_requested_by_username: string | null;
  approval_requested_at: string | null;
  approved_by: number | null;
  approved_by_username: string | null;
  approved_at: string | null;
  rejected_by: number | null;
  rejected_by_username: string | null;
  rejected_at: string | null;
  ready_by: number | null;
  ready_by_username: string | null;
  ready_at: string | null;
  claimed_by: number | null;
  claimed_by_username: string | null;
  claimed_at: string | null;
  approval_comment: string;
  execution_summary: string;
  execution_metadata: Record<string, unknown>;
  completed_at: string | null;
  failed_at: string | null;
  assigned_agent_key_id: string;
  last_reported_by_agent_key: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type JobQuery = {
  search?: string;
  ordering?: string;
  page?: string;
  page_size?: string;
  status?: string;
  risk_level?: string;
  approval_status?: string;
};

export type JobToolQuery = {
  q?: string;
  name?: string;
  status?: JobExecutionStatus | "";
  risk_level?: JobRecord["risk_level"] | "";
  approval_status?: JobRecord["approval_status"] | "";
  assigned_agent_key_id?: string;
  last_reported_by_agent_key?: string;
  limit?: string;
};

export type JobHandoffQuery = {
  q?: string;
  name?: string;
  status?: "ready" | "claimed" | "";
  risk_level?: JobRecord["risk_level"] | "";
  approval_status?: JobRecord["approval_status"] | "";
  assigned_agent_key_id?: string;
  last_reported_by_agent_key?: string;
  limit?: string;
};

export type ToolQuerySummary = {
  count: number;
  returned: number;
  truncated: boolean;
};

export type ToolQueryEnvelope<TItem, TQuery> = {
  ok: boolean;
  request_id: string;
  query: TQuery;
  summary: ToolQuerySummary;
  items: TItem[];
};

export type JobToolQueryItem = {
  id: number;
  name: string;
  status: JobExecutionStatus;
  risk_level: JobRecord["risk_level"];
  approval_status: JobRecord["approval_status"];
  approval_requested_by_username: string | null;
  approved_by_username: string | null;
  rejected_by_username: string | null;
  ready_by_username: string | null;
  claimed_by_username: string | null;
  assigned_agent_key_id: string;
  last_reported_by_agent_key: string;
  created_at: string;
  updated_at: string;
};

export type JobHandoffItem = {
  id: number;
  name: string;
  status: "ready" | "claimed";
  risk_level: JobRecord["risk_level"];
  approval_status: JobRecord["approval_status"];
  ready_at: string | null;
  ready_by_username: string | null;
  claimed_at: string | null;
  claimed_by_username: string | null;
  assigned_agent_key_id: string;
  last_reported_by_agent_key: string;
  payload: Record<string, unknown>;
  updated_at: string;
};

export type JobToolQueryResponse = ToolQueryEnvelope<JobToolQueryItem, JobToolQuery>;
export type JobHandoffResponse = ToolQueryEnvelope<JobHandoffItem, JobHandoffQuery>;

export type JobCreateInput = {
  name: string;
  status: JobExecutionStatus;
  risk_level: "low" | "medium" | "high";
  payload: Record<string, unknown>;
};

export type AuditLogRecord = {
  id: number;
  actor: number | null;
  actor_username: string | null;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AuditQuery = {
  search?: string;
  ordering?: string;
  page?: string;
  page_size?: string;
};
