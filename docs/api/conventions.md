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
- Audit read endpoint is backend-managed and should be restricted to privileged roles in subsequent iterations.
