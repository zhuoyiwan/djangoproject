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
- `GET /api/v1/users/` (throttle scope: `user_admin`)
- `GET /api/v1/users/{id}/` (throttle scope: `user_admin`)

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
- `GET /api/v1/audit/logs/tool-query/` (normalized read-only tool query, throttle scope: `tool_query`; filters: `q`, `action`, `target`, `actor_username`, `detail_reason`, `detail_path`, `detail_status_code`, `limit`)
- `GET /api/v1/audit/logs/{id}/` (throttle scope: `audit_read`)

Audit log behavior:
- Includes CMDB write events, automation approval/execution events, and security events.
- Canonical security event actions:
  - `security.auth.failed` for `401` responses
  - `security.permission.denied` for authenticated `403` responses
  - `server.agent_ingest.auth_failed` for signed ingest auth failures
- Security audit entries use `target="<METHOD> <PATH>"` for request-driven denial events.
- Security event `detail` payloads may include `request_id`, `status_code`, `username`, `reason`, and `path`.

## Automation
- `GET /api/v1/automation/jobs/` (throttle scope: `api_read`)
- `GET /api/v1/automation/jobs/tool-query/` (normalized read-only tool query, throttle scope: `tool_query`; filters: `q`, `name`, `status`, `risk_level`, `approval_status`, `assigned_agent_key_id`, `limit`)
- `GET /api/v1/automation/jobs/handoff/` (read-only execution handoff feed for OpenClaw/adapter consumers, throttle scope: `handoff`; filters: `q`, `name`, `status`, `risk_level`, `approval_status`, `assigned_agent_key_id`, `limit`; items include `assigned_agent_key_id` for runner-bound claims)
- `POST /api/v1/automation/jobs/` (throttle scope: `api_write`)
- `GET /api/v1/automation/jobs/{id}/` (throttle scope: `api_read`)
- `PUT /api/v1/automation/jobs/{id}/` (throttle scope: `api_write`)
- `PATCH /api/v1/automation/jobs/{id}/` (throttle scope: `api_write`)
- `DELETE /api/v1/automation/jobs/{id}/` (throttle scope: `api_write`)
- `POST /api/v1/automation/jobs/{id}/approve/` (throttle scope: `approval_write`)
- `POST /api/v1/automation/jobs/{id}/reject/` (throttle scope: `approval_write`)
- `POST /api/v1/automation/jobs/{id}/mark-ready/` (throttle scope: `execution_write`)
- `POST /api/v1/automation/jobs/{id}/claim/` (throttle scope: `execution_write`; optional body field: `agent_key_id` to bind a claimed job to a specific runner)
- `POST /api/v1/automation/jobs/{id}/agent-claim/` (HMAC-signed machine claim callback for ready jobs, throttle scope: `agent_claim`)
- `POST /api/v1/automation/jobs/{id}/complete/` (throttle scope: `execution_write`)
- `POST /api/v1/automation/jobs/{id}/fail/` (throttle scope: `execution_write`)
- `POST /api/v1/automation/jobs/{id}/cancel/` (throttle scope: `execution_write`)
- `POST /api/v1/automation/jobs/{id}/agent-report/` (HMAC-signed machine execution result callback, throttle scope: `agent_report`)

Automation job behavior:
- low/medium-risk jobs return `approval_status=not_required` and `status=draft`
- high-risk jobs return `approval_status=pending` and `status=awaiting_approval` until approved
- approve/reject actions are for `approver` or `platform_admin`
- approved jobs return to `status=draft` until an ops user marks them ready
- mark-ready/claim/complete/fail/cancel actions are for `ops_admin` or `platform_admin`
- `claim` may assign `agent_key_id` to bind a claimed job to a specific runner key
- `agent-claim` accepts HMAC-authenticated machine callbacks for ready jobs, transitions them to `claimed`, and binds the runner key from the signature
- `agent-report` accepts HMAC-authenticated machine callbacks for claimed jobs, enforces any assigned runner key, and records execution summary/metadata plus audit events

## API docs
- `GET /api/schema/`
- `GET /api/docs/`
- `GET /api/redoc/`
