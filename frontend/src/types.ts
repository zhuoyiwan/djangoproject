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

export type FrontendCapabilities = {
  canReadAudit: boolean;
  canManageUsers: boolean;
  canWriteServers: boolean;
  canWriteAutomation: boolean;
  canApproveAutomation: boolean;
  canExecuteAutomation: boolean;
};

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

export type AuthRefreshTokens = {
  access: string;
  refresh?: string;
};

export type RegisterInput = {
  username: string;
  email?: string;
  password: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
};

export type UserProfile = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string;
  is_active: boolean;
  roles: string[];
};

export type UserListQuery = {
  page?: string;
  page_size?: string;
};

export type UserRole = {
  id: number;
  name: string;
};

export type UserRoleListResponse = {
  items: UserRole[];
};

export type UserUpdateInput = {
  username?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  is_active?: boolean;
};

export type UserPasswordResetInput = {
  password: string;
};

export type UserRoleAssignmentInput = {
  roles: string[];
};

export type HealthResponse = {
  status: "ok" | "degraded";
  request_id: string;
  checks: {
    database: {
      status: "ok" | "error";
      detail: string;
    };
    cache: {
      status: "ok" | "error";
      detail: string;
    };
  };
  features: {
    agent_ingest_enabled: boolean;
    automation_agent_claim_enabled: boolean;
    automation_agent_report_enabled: boolean;
  };
};

export type OverviewSummaryResponse = {
  status: "ok";
  request_id: string;
  summary: {
    servers: {
      total: number;
      online: number;
      offline: number;
      maintenance: number;
      pre_allocated: number;
    };
    automation: {
      total: number;
      draft: number;
      awaiting_approval: number;
      ready: number;
      claimed: number;
      completed: number;
      failed: number;
      canceled: number;
      high_risk_pending: number;
    };
    audit: {
      total: number;
      last_24h: number;
      security_events_last_24h: number;
    };
  };
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

export type ServerCreateInput = {
  hostname: string;
  internal_ip: string;
  external_ip?: string | null;
  os_version: string;
  cpu_cores: number;
  memory_gb: string;
  disk_summary?: string;
  lifecycle_status: ServerRecord["lifecycle_status"];
  environment: ServerRecord["environment"];
  idc: number | null;
};

export type ServerUpdateInput = ServerCreateInput;

export type ServerToolQuery = {
  q?: string;
  hostname?: string;
  internal_ip?: string;
  environment?: ServerRecord["environment"] | "";
  lifecycle_status?: ServerRecord["lifecycle_status"] | "";
  idc_code?: string;
  limit?: string;
};

export type ServerToolQueryItem = {
  id: number;
  hostname: string;
  internal_ip: string;
  external_ip: string | null;
  environment: ServerRecord["environment"];
  lifecycle_status: ServerRecord["lifecycle_status"];
  source: ServerRecord["source"];
  os_version: string;
  idc_code: string;
  idc_name: string;
  last_seen_at: string | null;
};

export type ServerToolQueryResponse = ToolQueryEnvelope<ServerToolQueryItem, ServerToolQuery>;

export type IDCToolQuery = {
  q?: string;
  code?: string;
  name?: string;
  location?: string;
  status?: "active" | "maintenance" | "inactive" | "";
  limit?: string;
};

export type IDCToolQueryItem = {
  id: number;
  code: string;
  name: string;
  location: string;
  status: "active" | "maintenance" | "inactive";
  description: string;
  created_at: string;
  updated_at: string;
};

export type IDCToolQueryResponse = ToolQueryEnvelope<IDCToolQueryItem, IDCToolQuery>;
export type IDCRecord = IDCToolQueryItem;

export type IDCMutationInput = {
  code: string;
  name: string;
  location: string;
  status: IDCRecord["status"];
  description: string;
};

export type IDCListQuery = {
  ordering?: string;
  page?: string;
  page_size?: string;
  status?: "active" | "maintenance" | "inactive" | "";
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

export type AuditToolQuery = {
  q?: string;
  action?: string;
  target?: string;
  actor_username?: string;
  detail_reason?: string;
  detail_path?: string;
  detail_status_code?: string;
  limit?: string;
};

export type AuditToolQueryItem = {
  id: number;
  action: string;
  target: string;
  actor_username: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type AuditToolQueryResponse = ToolQueryEnvelope<AuditToolQueryItem, AuditToolQuery>;
