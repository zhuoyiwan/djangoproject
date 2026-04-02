# Phase 1 Backend Endpoints

## Health
- `GET /health/`
- `GET /api/v1/health/`

## Auth
- `POST /api/v1/auth/register/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/refresh/`
- `GET /api/v1/auth/me/`

## Users
- `GET /api/v1/users/`
- `GET /api/v1/users/{id}/`

## CMDB
### IDCs
- `GET /api/v1/cmdb/idcs/`
- `GET /api/v1/cmdb/idcs/tool-query/` (normalized read-only tool query)
- `POST /api/v1/cmdb/idcs/`
- `GET /api/v1/cmdb/idcs/{id}/`
- `PUT /api/v1/cmdb/idcs/{id}/`
- `PATCH /api/v1/cmdb/idcs/{id}/`
- `DELETE /api/v1/cmdb/idcs/{id}/`

### Servers
- `GET /api/v1/cmdb/servers/`
- `POST /api/v1/cmdb/servers/`
- `GET /api/v1/cmdb/servers/tool-query/` (normalized read-only tool query)
- `GET /api/v1/cmdb/servers/{id}/`
- `PUT /api/v1/cmdb/servers/{id}/`
- `PATCH /api/v1/cmdb/servers/{id}/`
- `DELETE /api/v1/cmdb/servers/{id}/`
- `POST /api/v1/cmdb/servers/agent-ingest/` (HMAC-signed machine ingest)

## Audit
- `GET /api/v1/audit/logs/`
- `GET /api/v1/audit/logs/tool-query/` (normalized read-only tool query)
- `GET /api/v1/audit/logs/{id}/`

## Automation
- `GET /api/v1/automation/jobs/`
- `GET /api/v1/automation/jobs/tool-query/` (normalized read-only tool query)
- `GET /api/v1/automation/jobs/handoff/` (read-only execution handoff feed for OpenClaw/adapter consumers)
- `POST /api/v1/automation/jobs/`
- `GET /api/v1/automation/jobs/{id}/`
- `PUT /api/v1/automation/jobs/{id}/`
- `PATCH /api/v1/automation/jobs/{id}/`
- `DELETE /api/v1/automation/jobs/{id}/`
- `POST /api/v1/automation/jobs/{id}/approve/`
- `POST /api/v1/automation/jobs/{id}/reject/`
- `POST /api/v1/automation/jobs/{id}/mark-ready/`
- `POST /api/v1/automation/jobs/{id}/claim/`
- `POST /api/v1/automation/jobs/{id}/complete/`
- `POST /api/v1/automation/jobs/{id}/fail/`
- `POST /api/v1/automation/jobs/{id}/cancel/`

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
