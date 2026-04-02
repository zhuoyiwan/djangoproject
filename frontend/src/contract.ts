export const contractHighlights = [
  {
    title: "Auth Contract",
    body: "JWT bearer auth. Login via /api/v1/auth/login/, refresh via /api/v1/auth/refresh/, and current user via /api/v1/auth/me/.",
  },
  {
    title: "List Response Shape",
    body: "List endpoints follow DRF pagination: count, next, previous, results.",
  },
  {
    title: "Stable Error Envelope",
    body: "Error payloads expose ok=false, error.code, error.message, and request_id for traceability.",
  },
  {
    title: "CMDB Filters",
    body: "Servers support search, ordering, and exact filters for hostname, internal_ip, external_ip, idc, environment, lifecycle_status, and source.",
  },
  {
    title: "RBAC Summary",
    body: "platform_admin can query users and audits, ops_admin can mutate CMDB resources, auditor can read audit logs, and viewer stays read-only on CMDB endpoints.",
  },
];

export const endpointGroups = [
  {
    label: "Auth",
    items: [
      "POST /api/v1/auth/register/",
      "POST /api/v1/auth/login/",
      "POST /api/v1/auth/refresh/",
      "GET /api/v1/auth/me/",
    ],
  },
  {
    label: "CMDB",
    items: [
      "GET /api/v1/cmdb/idcs/",
      "GET /api/v1/cmdb/servers/",
      "POST /api/v1/cmdb/servers/agent-ingest/",
    ],
  },
  {
    label: "Audit + Automation",
    items: [
      "GET /api/v1/audit/logs/  (auditor | platform_admin)",
      "GET /api/v1/automation/jobs/",
      "POST /api/v1/automation/jobs/",
    ],
  },
  {
    label: "Role-sensitive routes",
    items: [
      "GET /api/v1/users/  (platform_admin)",
      "CMDB POST/PUT/PATCH/DELETE  (ops_admin | platform_admin)",
      "CMDB GET  (authenticated read-only allowed)",
    ],
  },
];
