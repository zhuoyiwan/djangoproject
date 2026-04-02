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
- `POST /api/v1/cmdb/idcs/`
- `GET /api/v1/cmdb/idcs/{id}/`
- `PUT /api/v1/cmdb/idcs/{id}/`
- `PATCH /api/v1/cmdb/idcs/{id}/`
- `DELETE /api/v1/cmdb/idcs/{id}/`

### Servers
- `GET /api/v1/cmdb/servers/`
- `POST /api/v1/cmdb/servers/`
- `GET /api/v1/cmdb/servers/{id}/`
- `PUT /api/v1/cmdb/servers/{id}/`
- `PATCH /api/v1/cmdb/servers/{id}/`
- `DELETE /api/v1/cmdb/servers/{id}/`
- `POST /api/v1/cmdb/servers/agent-ingest/` (HMAC-signed machine ingest)

## Audit
- `GET /api/v1/audit/logs/`
- `GET /api/v1/audit/logs/{id}/`

## Automation
- `GET /api/v1/automation/jobs/`
- `POST /api/v1/automation/jobs/`
- `GET /api/v1/automation/jobs/{id}/`
- `PUT /api/v1/automation/jobs/{id}/`
- `PATCH /api/v1/automation/jobs/{id}/`
- `DELETE /api/v1/automation/jobs/{id}/`
- `POST /api/v1/automation/jobs/{id}/approve/`
- `POST /api/v1/automation/jobs/{id}/reject/`

Automation job approval behavior:
- low/medium-risk jobs return `approval_status=not_required`
- high-risk jobs return `approval_status=pending` until approved or rejected
- approve/reject actions are for `approver` or `platform_admin`

## API docs
- `GET /api/schema/`
- `GET /api/docs/`
- `GET /api/redoc/`
