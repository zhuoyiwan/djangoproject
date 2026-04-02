# Next backend session task

Read this file first in unattended backend sessions.

## Task

Start the first M4 slice from `docs/architecture/backend-roadmap.md`.
Implement one small, safe, backend-only increment for the OpenClaw integration boundary:

- add a read-only tool-facing CMDB query capability
- keep it authenticated and safe-by-default
- prefer existing CMDB data instead of introducing new runtime integrations
- expose a normalized response shape suitable for LLM/tool consumers
- include tests and OpenAPI updates if the contract changes

If that exact slice is too large after inspection, narrow it to the smallest complete backend increment that moves M4 forward without touching the frontend.

## Constraints

- Backend only
- Keep changes small but complete
- Follow repository workflow strictly
- Update `docs/api/openapi.yaml` if the API contract changes
- Stop after one coherent increment
