# ChatOps CMDB Backend Roadmap (Django + DRF)

## 1. Project goal and scope

Build a backend-first foundation for an intelligent operations asset platform (ChatOps CMDB) with:
- standardized asset data model
- secure API access with JWT
- auditable operations
- API contract and documentation stable enough for frontend collaboration

Current scope is backend only. Frontend implementation is intentionally out of this phase.

---

## 2. Architectural principles

1. API-first contract
- Keep endpoint and schema compatibility as a top priority.
- Expose OpenAPI schema continuously.

2. Security-by-default
- Protected API defaults to authenticated access.
- Keep secrets out of git and docs.

3. Auditable writes
- Record mutating operations with actor + action + target + details.

4. Evolvable CMDB model
- Start with IDC + Server as MVP.
- Keep source and metadata fields for future agent ingestion.

5. Module boundaries
- `accounts`: identity/auth
- `cmdb`: asset domain
- `audit`: operation logs
- `automation`: workflow/job abstraction
- `core`: cross-cutting capabilities

---

## 3. Implemented baseline (Phase 1)

### 3.1 Runtime and settings
- Django 5 + DRF + drf-spectacular + simplejwt
- Local env uses SQLite for frictionless startup
- Production settings reserved for MySQL + Redis paths
- CORS and django-filter already integrated

### 3.2 Auth
- Register/login/refresh/me endpoints available
- JWT bearer authentication configured globally

### 3.3 CMDB
- `IDC` and `Server` models implemented
- Server attributes include lifecycle, environment, source, metadata, and last_seen_at
- Server list supports search/order + exact filtering by:
  - hostname
  - internal_ip
  - external_ip
  - idc
  - environment
  - lifecycle_status
  - source

### 3.4 Audit
- `AuditLog` model implemented
- Server create/update writes audit entries

### 3.5 API docs
- OpenAPI: `/api/schema/`
- Swagger: `/api/docs/`
- Redoc: `/api/redoc/`
- Written docs under `docs/api/`

### 3.6 Error contract
- Centralized exception handler with stable error codes:
  - validation_error
  - unauthorized
  - forbidden
  - not_found
  - rate_limited
  - request_error
  - internal_error
- Includes `request_id` in body and `X-Request-ID` in header

---

## 4. API contract summary

Base path: `/api/v1/`

Main endpoint groups:
- Auth: `/api/v1/auth/*`
- Users: `/api/v1/users/*`
- CMDB: `/api/v1/cmdb/idcs/*`, `/api/v1/cmdb/servers/*`
- Audit: `/api/v1/audit/logs/*`
- Automation: `/api/v1/automation/jobs/*`

Contract references:
- `docs/api/conventions.md`
- `docs/api/endpoints.md`
- `docs/api/openapi.yaml`

---

## 5. Security baseline and hardening path

Already in place:
- JWT auth
- request ID middleware
- write audit trail for server mutations
- local secret exclusion via `.gitignore`

Next hardening steps:
1. enforce role-based permissions for audit and write endpoints
2. add API throttling policies by endpoint class
3. add security event audit category (auth failures / permission denies)
4. require strong JWT signing key via environment validation

---

## 6. Near-term milestones

### M1: API stabilization (current)
- freeze endpoint naming and response conventions
- freeze enum values for CMDB statuses
- keep schema synced with code

### M2: Collector-ready ingestion
- add signed ingestion endpoint for agent reports (HMAC-SHA256 + timestamp window)
- support idempotent upsert by host identity
- write ingestion-specific audit logs

### M3: Approval-ready automation
- extend automation job model for risk levels
- add approval-state fields for high-risk operations
- keep default automation permissions read-only for AI flows

### M4: OpenClaw integration boundary
- define tool-facing query endpoints (safe read-first)
- add normalized response templates for LLM tool calls
- isolate OpenClaw execution adapter from CMDB core domain

---

## 7. Collaboration protocol for frontend teammate

Backend responsibilities:
- keep OpenAPI up to date
- keep docs/api conventions authoritative
- avoid breaking path/field changes without migration notice

Frontend collaborator responsibilities:
- consume `openapi.yaml` as source of truth
- align query parameter usage with documented filters
- report contract gaps through schema-driven feedback

---

## 8. Operational checklist (backend)

For each backend change:
1. run tests (`manage.py test accounts cmdb audit automation`)
2. run checks (`manage.py check`)
3. regenerate schema (`manage.py spectacular --file docs/api/openapi.yaml`)
4. update written API docs if endpoint/contract changed
5. record significant milestones in info-exchange project records

---

## 9. Out of scope for this phase

- frontend page implementation
- production deployment orchestration details
- full approval workflow execution engine
- deep OpenClaw runtime integration
- distributed collector fleet management
