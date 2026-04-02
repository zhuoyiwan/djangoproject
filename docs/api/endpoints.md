# Phase 1 Backend Endpoints

## Health
- `GET /health/`
- `GET /api/v1/health/`

## Auth
- `POST /api/v1/auth/register/` (throttle scope: `auth`)
- `POST /api/v1/auth/login/` (throttle scope: `auth`)
- `POST /api/v1/auth/refresh/` (throttle scope: `auth`)
- `GET /api/v1/auth/me/` (throttle scope: `api_read`)

## Users
- `GET /api/v1/users/`
- `GET /api/v1/users/{id}/`

## CMDB
### IDCs
- `GET /api/v1/cmdb/idcs/` (throttle scope: `api_read`)
- `GET /api/v1/cmdb/idcs/tool-query/` (normalized read-only tool query, throttle scope: `tool_query`)
- `POST /api/v1/cmdb/idcs/` (throttle scope: `api_write`)
- `GET /api/v1/cmdb/idcs/{id}/` (throttle scope: `api_read`)
- `PUT /api/v1/cmdb/idcs/{id}/` (throttle scope: `api_write`)
- `PATCH /api/v1/cmdb/idcs/{id}/` (throttle scope: `api_write`)
- `DELETE /api/v1/cmdb/idcs/{id}/` (throttle scope: `api_write`)

### Servers
- `GET /api/v1/cmdb/servers/` (throttle scope: `api_read`)
- `POST /api/v1/cmdb/servers/` (throttle scope: `api_write`)
- `GET /api/v1/cmdb/servers/tool-query/` (normalized read-only tool query, throttle scope: `tool_query`)
- `GET /api/v1/cmdb/servers/{id}/` (throttle scope: `api_read`)
- `PUT /api/v1/cmdb/servers/{id}/` (throttle scope: `api_write`)
- `PATCH /api/v1/cmdb/servers/{id}/` (throttle scope: `api_write`)
- `DELETE /api/v1/cmdb/servers/{id}/` (throttle scope: `api_write`)
- `POST /api/v1/cmdb/servers/agent-ingest/` (HMAC-signed machine ingest, throttle scope: `agent_ingest`)

## Audit
- `GET /api/v1/audit/logs/` (throttle scope: `audit_read`)
- `GET /api/v1/audit/logs/tool-query/` (normalized read-only tool query, throttle scope: `tool_query`)
- `GET /api/v1/audit/logs/{id}/` (throttle scope: `audit_read`)

## Automation
- `GET /api/v1/automation/jobs/` (throttle scope: `api_read`)
- `GET /api/v1/automation/jobs/tool-query/` (normalized read-only tool query, throttle scope: `tool_query`)
- `GET /api/v1/automation/jobs/handoff/` (read-only execution handoff feed for OpenClaw/adapter consumers, throttle scope: `handoff`)
- `POST /api/v1/automation/jobs/` (throttle scope: `api_write`)
- `GET /api/v1/automation/jobs/{id}/` (throttle scope: `api_read`)
- `PUT /api/v1/automation/jobs/{id}/` (throttle scope: `api_write`)
- `PATCH /api/v1/automation/jobs/{id}/` (throttle scope: `api_write`)
- `DELETE /api/v1/automation/jobs/{id}/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/approve/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/reject/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/mark-ready/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/claim/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/complete/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/fail/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/cancel/` (throttle scope: `api_write`)

Automation job behavior:
- low/medium-risk jobs return `approval_status=not_required` and `status=draft`
- high-risk jobs return `approval_status=pending` and `status=awaiting_approval` until approved
- approve/reject actions are for `approver` or `platform_admin`
- approved jobs return to `status=draft` until an ops user marks them ready
- mark-ready/claim/complete/fail/cancel actions are for `ops_admin` or `platform_admin`

## API docs
- `GET /api/schema/`
- `GET /api/docs/`
- `GET /api/redoc/`
