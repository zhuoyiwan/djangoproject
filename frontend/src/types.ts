export type ApiErrorShape = {
  ok?: false;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  request_id?: string;
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

export type UserProfile = {
  id: number;
  username: string;
  email: string;
  is_active: boolean;
  is_staff: boolean;
};

export type ServerRecord = {
  id: number;
  hostname: string;
  internal_ip: string;
  external_ip: string | null;
  environment: "dev" | "test" | "prod";
  lifecycle_status: "online" | "offline" | "maintenance" | "pre_allocated";
  source: "manual" | "agent" | "api";
  idc: number | null;
  cpu_cores?: number | null;
  memory_gb?: number | null;
  disk_summary?: string;
  metadata?: Record<string, unknown>;
  updated_at?: string;
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
