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
- `ops_admin`: operational write privileges on CMDB resources
- `auditor`: read audit logs
- `viewer`: authenticated read-only access to CMDB endpoints

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

## Audit baseline
- Mutating server operations write audit entries.
- Audit read endpoint is restricted to `auditor` and `platform_admin`.

## RBAC access summary
- `GET /api/v1/users/` requires `platform_admin`
- `GET /api/v1/audit/logs/` requires `auditor` or `platform_admin`
- CMDB write operations (`POST/PUT/PATCH/DELETE`) require `ops_admin` or `platform_admin`
- CMDB read operations remain available to authenticated users (`viewer` and above)
