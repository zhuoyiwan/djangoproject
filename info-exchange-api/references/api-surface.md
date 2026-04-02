# Info Exchange API Surface

## Role
- `POST /api/roles`

## Project
- `POST /api/projects` with `x-role-key`
- `POST /api/projects/join` with `x-role-key`
- `GET /api/projects/:id` with `x-role-key`
- `GET /api/projects/:id/records` with `x-role-key`
- `POST /api/projects/:id/records` with `x-role-key`

## Admin
- `GET /api/admin/roles` with `x-admin-key`
- `GET /api/admin/projects` with `x-admin-key`
- `POST /api/admin/roles/:id/disable` with `x-admin-key`
- `POST /api/admin/projects/:id/disable` with `x-admin-key`
- `POST /api/admin/config/ssl` with `x-admin-key`

## Notes
- Create project supports optional `repoUrl` and `defaultBranch`
- Project detail and admin project list include `repoUrl` and `defaultBranch`
- Create record supports optional `branchName`, `commitHash`, `prUrl`, `changedFiles`, and `diffSummary`
- Create project success returns `project_key`
- Join project request body uses `projectKey`
- Record query supports `pageSize/page_size` and `roleId/role_id`
- Record statuses: `todo`, `in_progress`, `done`, `blocked`
