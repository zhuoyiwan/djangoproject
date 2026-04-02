# ChatOps CMDB Backend API Conventions

## Base path and versioning
- Current API base path: `/api/v1/`
- OpenAPI schema: `/api/schema/`
- Swagger UI: `/api/docs/`
- Redoc: `/api/redoc/`

## Authentication
- Auth mechanism: JWT Bearer token.
- Login endpoint: `POST /api/v1/auth/login/`
- Refresh endpoint: `POST /api/v1/auth/refresh/`
- Current user endpoint: `GET /api/v1/auth/me/`
- Protected endpoints require header:
  - `Authorization: Bearer <access_token>`

### RBAC roles
- `platform_admin`: full management (including user list and audit query)
- `ops_admin`: operational write privileges on CMDB resources and automation jobs
- `approver`: approve or reject high-risk automation jobs
- `auditor`: read audit logs
- `viewer`: authenticated read-only access to CMDB and automation endpoints

### Agent signed ingestion authentication
- Endpoint: `POST /api/v1/cmdb/servers/agent-ingest/`
- Required headers:
  - `X-Agent-Key-Id`
  - `X-Agent-Timestamp` (unix seconds)
  - `X-Agent-Signature` (`sha256=<hex_digest>`)
- Signature canonical string:
  - `METHOD + "\\n" + PATH + "\\n" + TIMESTAMP + "\\n" + SHA256(raw_body_bytes)`
- Timestamp validation:
  - default tolerance is `300` seconds (`AGENT_INGEST_TIMESTAMP_TOLERANCE_SECONDS`)
- Replay protection:
  - server rejects duplicate signed payloads in tolerance window via cache key

## Response and error format
- List endpoints follow DRF page response shape:
  - `count`
  - `next`
  - `previous`
  - `results`
- Error responses use a unified contract:

```json
{
  "ok": false,
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": {}
  },
  "request_id": "<uuid>"
}
```

- Stable error codes currently include:
  - `validation_error`
  - `unauthorized`
  - `forbidden`
  - `not_found`
  - `rate_limited`
  - `request_error`
  - `internal_error`
- Response header includes `X-Request-ID` for traceability.

## Pagination
- Default page size: `20`
- Query parameter override: `page_size`
- Maximum page size: `100`
- Page parameter: `page`

## Filtering and querying
- Common query parameters:
  - `search` for keyword search
  - `ordering` for sort field
- `GET /api/v1/cmdb/servers/` supports exact filters:
  - `hostname`
  - `internal_ip`
  - `external_ip`
  - `idc`
  - `environment`
  - `lifecycle_status`
  - `source`

## Stable enum values
### IDC status
- `active`
- `maintenance`
- `inactive`

### Server lifecycle status
- `online`
- `offline`
- `maintenance`
- `pre_allocated`

### Server environment
- `dev`
- `test`
- `prod`

### Server source
- `manual`
- `agent`
- `api`

## CMDB tool query baseline
### IDC tool query
- Tool query endpoint: `GET /api/v1/cmdb/idcs/tool-query/`
- Tool query filters:
  - `q`
  - `code`
  - `name`
  - `location`
  - `status`
  - `limit` (default `10`, max `20`)
- Tool query response shape:
  - `ok`
  - `request_id`
  - `query`
  - `summary`
  - `items`
- Tool query is read-only and requires at least one filter.

### Server tool query
- Tool query endpoint: `GET /api/v1/cmdb/servers/tool-query/`
- Tool query filters:
  - `q`
  - `hostname`
  - `internal_ip`
  - `environment`
  - `lifecycle_status`
  - `idc_code`
  - `limit` (default `10`, max `20`)
- Tool query response shape:
  - `ok`
  - `request_id`
  - `query`
  - `summary`
  - `items`
- Tool query is read-only and requires at least one filter.

## Audit baseline
- Mutating server operations write audit entries.
- High-risk automation job create/update/approve/reject operations write audit entries.
- Audit read endpoint is restricted to `auditor` and `platform_admin`.
- Tool query endpoint: `GET /api/v1/audit/logs/tool-query/`
- Tool query filters:
  - `q`
  - `action`
  - `target`
  - `actor_username`
  - `limit` (default `10`, max `20`)
- Tool query response shape:
  - `ok`
  - `request_id`
  - `query`
  - `summary`
  - `items`
- Audit tool query is read-only and requires at least one filter.

## Automation approval baseline
- `Job.risk_level` enum values:
  - `low`
  - `medium`
  - `high`
- `Job.approval_status` enum values:
  - `not_required`
  - `pending`
  - `approved`
  - `rejected`
- Low/medium-risk automation jobs do not require approval.
- High-risk automation jobs enter `pending` on create/update until an approver decision is recorded.
- Approval actions:
  - `POST /api/v1/automation/jobs/{id}/approve/`
  - `POST /api/v1/automation/jobs/{id}/reject/`
- Requesters cannot approve or reject their own pending job.

## Automation execution baseline
- Tool query endpoint: `GET /api/v1/automation/jobs/tool-query/`
- Tool query filters:
  - `q`
  - `name`
  - `status`
  - `risk_level`
  - `approval_status`
  - `limit` (default `10`, max `20`)
- Tool query response shape:
  - `ok`
  - `request_id`
  - `query`
  - `summary`
  - `items`
- Tool query is read-only and requires at least one filter.
- `Job.status` enum values:
  - `draft`
  - `awaiting_approval`
  - `ready`
  - `claimed`
  - `completed`
  - `failed`
  - `canceled`
- `approval_status` controls policy approval; `status` controls execution lifecycle.
- Low/medium-risk jobs are created/updated as `draft`.
- High-risk jobs are created/updated as `awaiting_approval` until approved.
- Approving or rejecting a pending high-risk job returns it to `draft`.
- Execution actions:
  - `POST /api/v1/automation/jobs/{id}/mark-ready/`
  - `POST /api/v1/automation/jobs/{id}/claim/`
- Only draft jobs can be marked ready.
- Only ready jobs can be claimed.
- Claimed jobs cannot be updated or deleted.

## RBAC access summary
- `GET /api/v1/users/` requires `platform_admin`
- `GET /api/v1/audit/logs/` requires `auditor` or `platform_admin`
- CMDB write operations (`POST/PUT/PATCH/DELETE`) require `ops_admin` or `platform_admin`
- CMDB read operations remain available to authenticated users (`viewer` and above)
- Automation read operations remain available to authenticated users (`viewer` and above)
- Automation create/update/delete require `ops_admin` or `platform_admin`
- Automation approve/reject requires `approver` or `platform_admin`
- Automation mark-ready/claim requires `ops_admin` or `platform_admin`
