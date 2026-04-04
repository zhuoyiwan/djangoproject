export const contractHighlights = [
  {
    title: "认证契约",
    body: "统一使用 JWT Bearer。登录走 /api/v1/auth/login/，刷新走 /api/v1/auth/refresh/，当前用户走 /api/v1/auth/me/。",
  },
  {
    title: "分页返回形状",
    body: "标准列表接口遵循 DRF 分页结构：count、next、previous、results。",
  },
  {
    title: "统一错误包",
    body: "错误返回保持 ok=false、error.code、error.message 与 request_id，便于前端追踪和可视化提示。",
  },
  {
    title: "只读 Tool Query",
    body: "IDC、服务器、审计和自动化任务都提供标准化 tool-query 读接口，至少需要一个过滤条件。",
  },
  {
    title: "执行交接面",
    body: "自动化任务额外提供 handoff 接口，仅暴露 ready / claimed 的执行可见字段，给 OpenClaw 或 runner 适配层消费。",
  },
  {
    title: "RBAC 约束",
    body: "platform_admin 全域管理，ops_admin 写 CMDB 与自动化执行，approver 审批高风险任务，auditor 读审计，viewer 保持只读。",
  },
];

export const endpointGroups = [
  {
    label: "认证",
    items: [
      "POST /api/v1/auth/register/",
      "POST /api/v1/auth/login/",
      "POST /api/v1/auth/refresh/",
      "GET /api/v1/auth/me/",
    ],
  },
  {
    label: "CMDB",
    items: [
      "GET /api/v1/cmdb/idcs/",
      "GET /api/v1/cmdb/idcs/tool-query/",
      "GET /api/v1/cmdb/servers/",
      "GET /api/v1/cmdb/servers/tool-query/",
      "POST /api/v1/cmdb/servers/agent-ingest/",
    ],
  },
  {
    label: "审计",
    items: [
      "GET /api/v1/audit/logs/  (auditor | platform_admin)",
      "GET /api/v1/audit/logs/{id}/",
      "GET /api/v1/audit/logs/tool-query/",
    ],
  },
  {
    label: "自动化",
    items: [
      "GET /api/v1/automation/jobs/",
      "GET /api/v1/automation/jobs/tool-query/",
      "GET /api/v1/automation/jobs/handoff/",
      "POST /api/v1/automation/jobs/",
      "DELETE /api/v1/automation/jobs/{id}/",
      "POST /api/v1/automation/jobs/{id}/approve/",
      "POST /api/v1/automation/jobs/{id}/reject/",
      "POST /api/v1/automation/jobs/{id}/mark-ready/",
      "POST /api/v1/automation/jobs/{id}/claim/",
      "POST /api/v1/automation/jobs/{id}/complete/",
      "POST /api/v1/automation/jobs/{id}/fail/",
      "POST /api/v1/automation/jobs/{id}/cancel/",
      "POST /api/v1/automation/jobs/{id}/requeue/",
    ],
  },
  {
    label: "权限敏感路由",
    items: [
      "GET /api/v1/users/  (platform_admin)",
      "CMDB POST/PUT/PATCH/DELETE  (ops_admin | platform_admin)",
      "Audit GET  (auditor | platform_admin)",
      "Automation DELETE  (ops_admin | platform_admin)",
      "Automation approve/reject  (approver | platform_admin)",
      "Automation mark-ready/claim/complete/fail/cancel/requeue  (ops_admin | platform_admin)",
    ],
  },
];
