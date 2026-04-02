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
  status: string;
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
  approval_comment: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type JobQuery = {
  search?: string;
  ordering?: string;
  page?: string;
  page_size?: string;
};

export type JobCreateInput = {
  name: string;
  status: string;
  risk_level: "low" | "medium" | "high";
  payload: Record<string, unknown>;
};
