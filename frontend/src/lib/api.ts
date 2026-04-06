import type {
  AuditLogRecord,
  AuditQuery,
  AuditToolQuery,
  AuditToolQueryResponse,
  AgentRunnerOverviewResponse,
  HealthResponse,
  IDCListQuery,
  IDCMutationInput,
  IDCRecord,
  IDCToolQuery,
  IDCToolQueryResponse,
  ApiErrorShape,
  AuthRefreshTokens,
  AuthTokens,
  RegisterInput,
  JobCreateInput,
  JobBulkActionResponse,
  JobCommentResponse,
  JobHandoffQuery,
  JobHandoffResponse,
  JobQuery,
  JobRecord,
  JobTimelineResponse,
  JobToolQuery,
  JobToolQueryResponse,
  PaginatedResponse,
  ServerCreateInput,
  ServerBulkImportItem,
  ServerBulkImportResponse,
  ServerBulkLifecycleResponse,
  ServerQuery,
  ServerRecord,
  ServerToolQuery,
  ServerToolQueryResponse,
  ServerUpdateInput,
  OverviewSummaryResponse,
  UserProfile,
  UserListQuery,
  UserPasswordResetInput,
  UserRoleAssignmentInput,
  UserRoleListResponse,
  UserUpdateInput,
} from "../types";

const API_PREFIX = "/api/v1";

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function buildQuery(params: ServerQuery) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

function buildListQuery(params: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(joinUrl(baseUrl, path), {
    ...init,
    headers,
  });

  if (!response.ok) {
    let payload: ApiErrorShape | undefined;
    try {
      payload = (await response.json()) as ApiErrorShape;
    } catch {
      payload = undefined;
    }
    const message =
      payload?.error?.message ||
      `Request failed with ${response.status} ${response.statusText}`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

async function requestStatus(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(joinUrl(baseUrl, path), {
    ...init,
    headers,
  });

  return response.status;
}

export async function getHealth(baseUrl: string) {
  return request<HealthResponse>(baseUrl, "/api/v1/health/");
}

export async function getOverviewSummary(baseUrl: string, token: string) {
  return request<OverviewSummaryResponse>(baseUrl, `${API_PREFIX}/overview/summary/`, {}, token);
}

export async function getAgentRunnerOverview(baseUrl: string, token: string) {
  return request<AgentRunnerOverviewResponse>(baseUrl, `${API_PREFIX}/agents/runners/`, {}, token);
}

export async function getIDCToolQuery(baseUrl: string, token: string, query: IDCToolQuery) {
  return request<IDCToolQueryResponse>(
    baseUrl,
    `${API_PREFIX}/cmdb/idcs/tool-query/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function getIDCs(baseUrl: string, token: string, query: IDCListQuery) {
  return request<PaginatedResponse<IDCRecord>>(
    baseUrl,
    `${API_PREFIX}/cmdb/idcs/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function login(baseUrl: string, username: string, password: string) {
  return request<AuthTokens>(baseUrl, `${API_PREFIX}/auth/login/`, {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function register(baseUrl: string, payload: RegisterInput) {
  return request(baseUrl, `${API_PREFIX}/auth/register/`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function refreshAccessToken(baseUrl: string, refresh: string) {
  return request<AuthRefreshTokens>(baseUrl, `${API_PREFIX}/auth/refresh/`, {
    method: "POST",
    body: JSON.stringify({ refresh }),
  });
}

export async function getCurrentUser(baseUrl: string, token: string) {
  return request<UserProfile>(baseUrl, `${API_PREFIX}/auth/me/`, {}, token);
}

export async function getUsers(baseUrl: string, token: string, query: UserListQuery) {
  return request<PaginatedResponse<UserProfile>>(
    baseUrl,
    `${API_PREFIX}/users/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function getUser(baseUrl: string, token: string, userId: number) {
  return request<UserProfile>(baseUrl, `${API_PREFIX}/users/${userId}/`, {}, token);
}

export async function updateUser(baseUrl: string, token: string, userId: number, payload: UserUpdateInput) {
  return request<UserProfile>(
    baseUrl,
    `${API_PREFIX}/users/${userId}/`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function getUserRoles(baseUrl: string, token: string) {
  return request<UserRoleListResponse>(baseUrl, `${API_PREFIX}/users/roles/`, {}, token);
}

export async function setUserRoles(baseUrl: string, token: string, userId: number, payload: UserRoleAssignmentInput) {
  return request<UserProfile>(
    baseUrl,
    `${API_PREFIX}/users/${userId}/set-roles/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function resetUserPassword(baseUrl: string, token: string, userId: number, payload: UserPasswordResetInput) {
  return request<UserProfile>(
    baseUrl,
    `${API_PREFIX}/users/${userId}/set-password/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function getServers(baseUrl: string, token: string, query: ServerQuery) {
  return request<PaginatedResponse<ServerRecord>>(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/${buildQuery(query)}`,
    {},
    token,
  );
}

export async function createServer(baseUrl: string, token: string, payload: ServerCreateInput) {
  return request<ServerRecord>(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function createIDC(baseUrl: string, token: string, payload: IDCMutationInput) {
  return request<IDCRecord>(
    baseUrl,
    `${API_PREFIX}/cmdb/idcs/`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function getIDC(baseUrl: string, token: string, idcId: number) {
  return request<IDCRecord>(baseUrl, `${API_PREFIX}/cmdb/idcs/${idcId}/`, {}, token);
}

export async function updateIDC(baseUrl: string, token: string, idcId: number, payload: IDCMutationInput) {
  return request<IDCRecord>(
    baseUrl,
    `${API_PREFIX}/cmdb/idcs/${idcId}/`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function deleteIDC(baseUrl: string, token: string, idcId: number) {
  return request<void>(
    baseUrl,
    `${API_PREFIX}/cmdb/idcs/${idcId}/`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function getServer(baseUrl: string, token: string, serverId: number) {
  return request<ServerRecord>(baseUrl, `${API_PREFIX}/cmdb/servers/${serverId}/`, {}, token);
}

export async function updateServer(
  baseUrl: string,
  token: string,
  serverId: number,
  payload: ServerUpdateInput,
) {
  return request<ServerRecord>(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/${serverId}/`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    token,
  );
}

export async function bulkImportServers(baseUrl: string, token: string, items: ServerBulkImportItem[]) {
  return request<ServerBulkImportResponse>(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/bulk-import/`,
    {
      method: "POST",
      body: JSON.stringify({ items }),
    },
    token,
  );
}

export async function bulkUpdateServerLifecycle(
  baseUrl: string,
  token: string,
  ids: number[],
  lifecycle_status: ServerRecord["lifecycle_status"],
) {
  return request<ServerBulkLifecycleResponse>(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/bulk-lifecycle/`,
    {
      method: "POST",
      body: JSON.stringify({ ids, lifecycle_status }),
    },
    token,
  );
}

export async function deleteServer(baseUrl: string, token: string, serverId: number) {
  return request<void>(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/${serverId}/`,
    {
      method: "DELETE",
    },
    token,
  );
}

export async function getServerToolQuery(baseUrl: string, token: string, query: ServerToolQuery) {
  return request<ServerToolQueryResponse>(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/tool-query/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function getJobs(baseUrl: string, token: string, query: JobQuery) {
  return request<PaginatedResponse<JobRecord>>(
    baseUrl,
    `${API_PREFIX}/automation/jobs/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function getJob(baseUrl: string, token: string, jobId: number) {
  return request<JobRecord>(baseUrl, `${API_PREFIX}/automation/jobs/${jobId}/`, {}, token);
}

export async function getJobTimeline(baseUrl: string, token: string, jobId: number) {
  return request<JobTimelineResponse>(baseUrl, `${API_PREFIX}/automation/jobs/${jobId}/timeline/`, {}, token);
}

export async function getJobComments(baseUrl: string, token: string, jobId: number) {
  return request<JobCommentResponse>(baseUrl, `${API_PREFIX}/automation/jobs/${jobId}/comments/`, {}, token);
}

export async function getJobToolQuery(baseUrl: string, token: string, query: JobToolQuery) {
  return request<JobToolQueryResponse>(
    baseUrl,
    `${API_PREFIX}/automation/jobs/tool-query/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function getJobHandoff(baseUrl: string, token: string, query: JobHandoffQuery) {
  return request<JobHandoffResponse>(
    baseUrl,
    `${API_PREFIX}/automation/jobs/handoff/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function createJob(baseUrl: string, token: string, payload: JobCreateInput) {
  return request<JobRecord>(baseUrl, `${API_PREFIX}/automation/jobs/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function updateJob(baseUrl: string, token: string, jobId: number, payload: JobCreateInput) {
  return request<JobRecord>(baseUrl, `${API_PREFIX}/automation/jobs/${jobId}/`, {
    method: "PUT",
    body: JSON.stringify(payload),
  }, token);
}

export async function deleteJob(baseUrl: string, token: string, jobId: number) {
  return request<void>(baseUrl, `${API_PREFIX}/automation/jobs/${jobId}/`, {
    method: "DELETE",
  }, token);
}

async function postJobAction(
  baseUrl: string,
  token: string,
  jobId: number,
  action: string,
  payload: Record<string, unknown>,
) {
  return request<JobRecord>(baseUrl, `${API_PREFIX}/automation/jobs/${jobId}/${action}/`, {
    method: "POST",
    body: JSON.stringify(payload),
  }, token);
}

export async function approveJob(baseUrl: string, token: string, jobId: number, comment: string) {
  return postJobAction(baseUrl, token, jobId, "approve", { comment });
}

export async function rejectJob(baseUrl: string, token: string, jobId: number, comment: string) {
  return postJobAction(baseUrl, token, jobId, "reject", { comment });
}

export async function markReadyJob(baseUrl: string, token: string, jobId: number, comment: string) {
  return postJobAction(baseUrl, token, jobId, "mark-ready", { comment });
}

export async function claimJob(
  baseUrl: string,
  token: string,
  jobId: number,
  comment: string,
  agentKeyId?: string,
) {
  return postJobAction(baseUrl, token, jobId, "claim", {
    comment,
    ...(agentKeyId ? { agent_key_id: agentKeyId } : {}),
  });
}

export async function completeJob(baseUrl: string, token: string, jobId: number, comment: string) {
  return postJobAction(baseUrl, token, jobId, "complete", { comment });
}

export async function failJob(baseUrl: string, token: string, jobId: number, comment: string) {
  return postJobAction(baseUrl, token, jobId, "fail", { comment });
}

export async function cancelJob(baseUrl: string, token: string, jobId: number, comment: string) {
  return postJobAction(baseUrl, token, jobId, "cancel", { comment });
}

export async function requeueJob(baseUrl: string, token: string, jobId: number, comment: string) {
  return postJobAction(baseUrl, token, jobId, "requeue", { comment });
}

export async function bulkCancelJobs(baseUrl: string, token: string, ids: number[], comment: string) {
  return request<JobBulkActionResponse>(
    baseUrl,
    `${API_PREFIX}/automation/jobs/bulk-cancel/`,
    {
      method: "POST",
      body: JSON.stringify({ ids, comment }),
    },
    token,
  );
}

export async function bulkRequeueJobs(baseUrl: string, token: string, ids: number[], comment: string) {
  return request<JobBulkActionResponse>(
    baseUrl,
    `${API_PREFIX}/automation/jobs/bulk-requeue/`,
    {
      method: "POST",
      body: JSON.stringify({ ids, comment }),
    },
    token,
  );
}

export async function getAuditLogs(baseUrl: string, token: string, query: AuditQuery) {
  return request<PaginatedResponse<AuditLogRecord>>(
    baseUrl,
    `${API_PREFIX}/audit/logs/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function getAuditToolQuery(baseUrl: string, token: string, query: AuditToolQuery) {
  return request<AuditToolQueryResponse>(
    baseUrl,
    `${API_PREFIX}/audit/logs/tool-query/${buildListQuery(query)}`,
    {},
    token,
  );
}

export async function getAuditLog(baseUrl: string, token: string, logId: number) {
  return request<AuditLogRecord>(baseUrl, `${API_PREFIX}/audit/logs/${logId}/`, {}, token);
}

export async function probeAuditReadAccess(baseUrl: string, token: string) {
  const status = await requestStatus(
    baseUrl,
    `${API_PREFIX}/audit/logs/?page_size=1`,
    {},
    token,
  );
  return status === 200;
}

export async function probeUserAdminAccess(baseUrl: string, token: string) {
  const status = await requestStatus(
    baseUrl,
    `${API_PREFIX}/users/?page_size=1`,
    {},
    token,
  );
  return status === 200;
}

export async function probeServerWriteAccess(baseUrl: string, token: string) {
  const status = await requestStatus(
    baseUrl,
    `${API_PREFIX}/cmdb/servers/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    token,
  );
  return status === 400;
}

export async function probeAutomationWriteAccess(baseUrl: string, token: string) {
  const status = await requestStatus(
    baseUrl,
    `${API_PREFIX}/automation/jobs/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    token,
  );
  return status === 400;
}

export async function probeAutomationApproveAccess(baseUrl: string, token: string) {
  const status = await requestStatus(
    baseUrl,
    `${API_PREFIX}/automation/jobs/0/approve/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    token,
  );
  return status === 404;
}

export async function probeAutomationExecuteAccess(baseUrl: string, token: string) {
  const status = await requestStatus(
    baseUrl,
    `${API_PREFIX}/automation/jobs/0/mark-ready/`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    token,
  );
  return status === 404;
}
