# Frontend Bootstrap

This frontend is a contract-first React + Vite workspace for the ChatOps CMDB project.

## Principles

- Treat `../docs/api/openapi.yaml` as the source of truth.
- Keep auth flow aligned with JWT bearer conventions from `../docs/api/conventions.md`.
- Start with API integration and data views before deeper page workflows.

## Local start

1. Copy `.env.example` to `.env`.
2. Set `VITE_API_BASE_URL` to the backend host, for example `http://127.0.0.1:8000`.
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

## Current scope

- routed workspace shell
- JWT login and token validation
- current user lookup
- overview page with backend health probe
- CMDB server list query with selectable detail panel
- automation job list with approval-state detail panel
- automation job creation form and approve/reject actions
- dedicated automation detail route
- audit log list and detail panel
- RBAC summary synced from backend conventions
- embedded API contract summary for frontend collaboration

## Current routes

- `/login`
- `/overview`
- `/servers`
- `/automation`
- `/automation/:jobId`
- `/audit`
- `/contract`
