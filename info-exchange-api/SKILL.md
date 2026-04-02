---
name: info-exchange-api
description: Use the AI project information exchange platform API via project-local .info.config to create roles, create or join projects, read project details, list records, add structured records, and perform admin actions.
---

# Info Exchange API Skill

Use this skill when the user wants Claude Code to operate the AI project information exchange platform as an API client.

## When to use

Trigger this skill for requests like:
- 创建信息交流角色
- 创建项目信息交流平台项目
- 加入某个项目
- 查看当前项目详情
- 查询项目记录
- 新增一条项目记录
- 管理员查看角色或项目
- 管理员禁用角色或项目
- 上传 SSL 证书

## Configuration

This skill reads a project-local `.info.config` file by searching upward from the current working directory.

Recommended `.info.config`:

```json
{
  "baseUrl": "http://127.0.0.1:3000",
  "defaults": {
    "projectId": "project_123",
    "pageSize": 20,
    "recordStatus": "in_progress"
  },
  "auth": {
    "roleKeyEnv": "INFO_ROLE_KEY",
    "adminKeyEnv": "INFO_ADMIN_KEY"
  },
  "ssl": {
    "certificatePath": "./certs/fullchain.pem",
    "privateKeyPath": "./certs/privkey.pem"
  },
  "timeouts": {
    "requestMs": 15000
  }
}
```

Resolve keys in this order:
1. explicit arguments
2. env vars named by `.info.config`
3. inline keys in `.info.config`

## Operations

Use the helper script:

- `python .claude/skills/info-exchange-api/scripts/info_client.py create-role --name ... --description ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py create-project --name ... --description ... --goal ... --notes ... --role-key ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py join-project --project-key ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py get-project --project-id ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py list-records --project-id ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py create-record --project-id ... --title ... --content ... --result ... --next-step ... --risk ... --status ... --occurred-at ... --branch-name ... --commit-hash ... --pr-url ... --changed-files ... --diff-summary ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py admin-list-roles`
- `python .claude/skills/info-exchange-api/scripts/info_client.py admin-list-projects`
- `python .claude/skills/info-exchange-api/scripts/info_client.py admin-disable-role --role-id ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py admin-disable-project --project-id ...`
- `python .claude/skills/info-exchange-api/scripts/info_client.py admin-upload-ssl --certificate-path ... --private-key-path ...`

## Git collaboration preflight

Before starting work in a shared repo, run this preflight when Git is available:

```bash
git rev-parse --is-inside-work-tree
git branch --show-current
git fetch --prune origin
git status --short --branch
git rev-list --left-right --count @{upstream}...HEAD
git log --oneline HEAD..@{upstream}
git diff --stat HEAD..@{upstream}
```

Rules:
- if not in a Git repo: skip Git checks and continue with platform context only
- if no upstream is configured: tell the user remote freshness cannot be determined
- if behind or diverged: surface the remote changes first, and do not treat the local checkout as current
- if up to date: continue with project detail, records, and normal work

Important collaboration behavior:
- collaborators do not automatically see each other's local unpushed changes
- they only see remote updates after `git fetch`
- they only see platform Git context after someone writes it into project records

## API facts

- Role endpoints use header `x-role-key`
- Admin endpoints use header `x-admin-key`
- Key prefixes: `rk_`, `pk_`, `ak_`
- Project creation supports optional `repoUrl` and `defaultBranch`
- Project detail and admin project list return `repoUrl` and `defaultBranch`
- Project records support optional `branchName`, `commitHash`, `prUrl`, `changedFiles`, and `diffSummary`
- Project creation returns `project_key`
- Join project request uses `projectKey`
- Record statuses: `todo`, `in_progress`, `done`, `blocked`

## Response handling

The helper script normalizes all outputs to:

```json
{
  "ok": true,
  "operation": "create-project",
  "status": 201,
  "data": {}
}
```

or

```json
{
  "ok": false,
  "operation": "create-project",
  "status": 401,
  "error": {
    "code": "invalid_role_key",
    "message": "Invalid role key"
  }
}
```

Never print full `rk_`, `pk_`, `ak_`, or private key contents in summaries.

## References

- `references/api-surface.md`
- `references/config.md`
- `examples/info.config.example`
