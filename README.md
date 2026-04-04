# Django 智能运维平台

Django 智能运维平台是一个前后端分离的企业级运维工作台项目。后端基于 Django + DRF，前端基于 React + Vite，当前仓库已经包含认证、CMDB 资产、自动化任务、审批执行、审计记录、OpenAPI 文档、本地自动化脚本以及 info-exchange 项目协作配置。

本文档以当前仓库真实状态为准，覆盖项目结构、启动方式、页面路由、开发流程、常见问题和协作约定。

## 1. 项目概览

项目目标是提供一个可继续扩展的智能运维基础平台，核心能力包括：

- 统一认证与访问控制
- CMDB 资产管理
- 自动化任务与审批执行链路
- 审计日志与过程追踪
- 中文企业级前端工作台
- 标准化 API 契约和 OpenAPI 文档
- 本地夜间自动化 loop 与协作记录能力

当前仓库为单仓结构，目录中同时包含：

- `backend/`：Django 后端
- `frontend/`：React 前端
- `docs/`：接口文档与架构文档
- `.claude/`：自动化脚本、日志、临时运行脚本
- `.info.config`：info-exchange 本地配置
- `info-exchange-api/`：本地 skill 目录

## 2. 技术栈

### 后端

- Python 3
- Django 5.1
- Django REST Framework
- drf-spectacular
- djangorestframework-simplejwt
- django-filter
- django-cors-headers
- mysqlclient
- redis
- django-redis

依赖文件：

- `backend/requirements.txt`

### 前端

- React 18
- TypeScript
- Vite 5
- React Router DOM 6
- motion
- three

依赖文件：

- `frontend/package.json`

## 3. 仓库结构

```text
D:\commonfiles\Codex\djangoproject
├─ backend/                  Django 后端
│  ├─ accounts/              认证、用户、JWT 相关能力
│  ├─ audit/                 审计日志域
│  ├─ automation/            自动化任务、审批、执行、agent 接口
│  ├─ cmdb/                  IDC / Server 资产域
│  ├─ config/                Django settings、urls、API 入口
│  ├─ core/                  异常、分页、权限、中间件等通用能力
│  ├─ manage.py
│  └─ requirements.txt
├─ frontend/                 React + Vite 前端
│  ├─ src/
│  │  ├─ app/                布局、认证上下文、受保护路由
│  │  ├─ components/         视觉与交互组件
│  │  ├─ hooks/              资源查询 hooks
│  │  ├─ lib/                API 请求、错误映射、格式化逻辑
│  │  ├─ pages/              登录、总览、服务器、自动化、审计等页面
│  │  ├─ App.tsx             前端路由入口
│  │  ├─ main.tsx            React 挂载入口
│  │  ├─ styles.css          全局样式
│  │  └─ types.ts            前端类型定义
│  ├─ package.json
│  └─ vite.config.ts
├─ docs/
│  ├─ api/
│  │  ├─ conventions.md
│  │  ├─ endpoints.md
│  │  └─ openapi.yaml
│  └─ architecture/
├─ .claude/
├─ info-exchange-api/
├─ .env
├─ .env.example
├─ .info.config
└─ README.md
```

## 4. 后端能力

当前后端已经具备以下能力：

- JWT 登录、刷新、当前用户查询
- 用户信息读取
- IDC 管理
- 服务器资产管理
- Server agent ingest 上报
- 审计日志查询与 Tool Query
- 自动化任务创建、更新、审批、状态流转
- 高风险任务审批
- agent claim / report 签名接口
- Swagger / Redoc / OpenAPI 文档
- 统一错误响应结构
- 请求 ID、节流、审计补录等通用能力

### 业务域说明

#### `accounts`

负责：

- 登录
- JWT 刷新
- 当前用户查询
- 用户基本信息

#### `cmdb`

负责：

- IDC 数据中心
- Server 资产
- 资产查询和详情
- Agent 上报入口

#### `automation`

负责：

- 自动化任务创建与列表
- 任务审批
- ready / claim / complete / fail / cancel / requeue 状态流转
- agent claim / report
- Tool Query 与 handoff

#### `audit`

负责：

- 安全事件记录
- 审批和执行过程日志
- 审计列表与详情

#### `core`

负责：

- 统一异常响应
- 分页
- 节流
- 权限
- 请求 ID 中间件
- 通用基础模型

## 5. 前端能力

当前前端已经具备以下能力：

- 中文登录页
- 账号密码登录
- 手动令牌登录
- 本地 `baseUrl` / token 持久化
- 总览页
- 服务器列表与详情页
- 自动化任务列表页
- 自动化任务详情页
- 审计页
- 契约工作台页面
- 企业级液态玻璃风格 UI

### 当前前端页面与地址

当前前端主要页面如下：

- `/login`：登录页
- `/overview`：总览页
- `/servers`：服务器页
- `/automation`：自动化任务页
- `/automation/:jobId`：自动化任务详情页
- `/audit`：审计页
- `/contract`：契约页

如果你已登录，通常会从登录页跳转到：

- `/overview`

## 6. API 概览

后端 API 基础路径：

- `/api/v1/`

文档入口：

- `/api/schema/`
- `/api/docs/`
- `/api/redoc/`

健康检查：

- `/health/`
- `/api/v1/health/`

### 认证接口

- `POST /api/v1/auth/register/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/refresh/`
- `GET /api/v1/auth/me/`

### 用户接口

- `GET /api/v1/users/`
- `GET /api/v1/users/{id}/`

### CMDB 接口

IDC：

- `GET /api/v1/cmdb/idcs/`
- `GET /api/v1/cmdb/idcs/tool-query/`
- `POST /api/v1/cmdb/idcs/`
- `GET /api/v1/cmdb/idcs/{id}/`
- `PUT /api/v1/cmdb/idcs/{id}/`
- `PATCH /api/v1/cmdb/idcs/{id}/`
- `DELETE /api/v1/cmdb/idcs/{id}/`

Server：

- `GET /api/v1/cmdb/servers/`
- `GET /api/v1/cmdb/servers/tool-query/`
- `POST /api/v1/cmdb/servers/`
- `GET /api/v1/cmdb/servers/{id}/`
- `PUT /api/v1/cmdb/servers/{id}/`
- `PATCH /api/v1/cmdb/servers/{id}/`
- `DELETE /api/v1/cmdb/servers/{id}/`
- `POST /api/v1/cmdb/servers/agent-ingest/`

### 自动化接口

- `GET /api/v1/automation/jobs/`
- `GET /api/v1/automation/jobs/tool-query/`
- `GET /api/v1/automation/jobs/handoff/`
- `POST /api/v1/automation/jobs/`
- `GET /api/v1/automation/jobs/{id}/`
- `PUT /api/v1/automation/jobs/{id}/`
- `PATCH /api/v1/automation/jobs/{id}/`
- `DELETE /api/v1/automation/jobs/{id}/`
- `POST /api/v1/automation/jobs/{id}/approve/`
- `POST /api/v1/automation/jobs/{id}/reject/`
- `POST /api/v1/automation/jobs/{id}/mark-ready/`
- `POST /api/v1/automation/jobs/{id}/claim/`
- `POST /api/v1/automation/jobs/{id}/agent-claim/`
- `POST /api/v1/automation/jobs/{id}/complete/`
- `POST /api/v1/automation/jobs/{id}/fail/`
- `POST /api/v1/automation/jobs/{id}/cancel/`
- `POST /api/v1/automation/jobs/{id}/requeue/`
- `POST /api/v1/automation/jobs/{id}/agent-report/`

### 审计接口

- `GET /api/v1/audit/logs/`
- `GET /api/v1/audit/logs/tool-query/`
- `GET /api/v1/audit/logs/{id}/`

更详细契约请查看：

- `docs/api/conventions.md`
- `docs/api/endpoints.md`
- `docs/api/openapi.yaml`

## 7. 权限与认证

后端默认使用 Bearer Token：

```http
Authorization: Bearer <access_token>
```

当前项目存在面向平台角色的权限控制，常见角色包括：

- `platform_admin`
- `ops_admin`
- `approver`
- `auditor`
- `viewer`

自动化与 agent 相关接口还涉及基于 HMAC 的签名认证。

## 8. 错误响应与前端错误映射

后端错误响应遵循统一结构：

```json
{
  "ok": false,
  "error": {
    "code": "validation_error",
    "message": "Request validation failed.",
    "details": {}
  },
  "request_id": "<uuid>"
}
```

前端在 `frontend/src/lib/errors.ts` 中会把常见英文错误映射成中文用户提示，例如：

- 网络错误
- 401 未认证
- 403 无权限
- 404 资源不存在
- 429 请求过频
- 500 服务端错误
- 指定业务英文文案的中文映射

## 9. 本地环境准备

推荐环境：

- Windows PowerShell
- Python 3.11 或兼容版本
- Node.js 18+
- npm
- 可选 Redis

### 首次准备

```powershell
cd D:\commonfiles\Codex\djangoproject
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd frontend
npm install
```

## 10. 正确启动方式

下面是当前项目最稳的本地启动方案。

### 方案 A：标准联调方案

适用于：

- 本机 Redis 已可用
- 你要用正常 Django 本地服务联调

#### 1. 启动后端

```powershell
cd D:\commonfiles\Codex\djangoproject
.\.venv\Scripts\python.exe backend\manage.py migrate
.\.venv\Scripts\python.exe backend\manage.py runserver 127.0.0.1:8000
```

#### 2. 启动前端

```powershell
cd D:\commonfiles\Codex\djangoproject\frontend
npm run dev
```

#### 3. 打开页面

- 前端：`http://127.0.0.1:5173/login`
- 后端：`http://127.0.0.1:8000`
- Swagger：`http://127.0.0.1:8000/api/docs/`

### 方案 B：无 Redis 的本地烟测方案

适用于：

- 你本机没有 Docker
- 你暂时没有 Redis
- 你只想快速验证前端交互和基础接口流程

仓库里已有一个本地烟测后端脚本：

- `.claude/tmp/playwright_backend.py`

运行方式：

```powershell
cd D:\commonfiles\Codex\djangoproject
.\.venv\Scripts\python.exe .claude\tmp\playwright_backend.py
```

这个脚本会让后端使用本地内存缓存，默认监听：

- `http://127.0.0.1:8001`

前端则保持：

```powershell
cd D:\commonfiles\Codex\djangoproject\frontend
npm run dev
```

如果走这套组合，请把前端连接地址设置成：

- `http://127.0.0.1:8001`

## 11. Redis 说明

当前本地开发里一个高频问题是：

- Django 能启动
- 但登录后某些接口会报错

常见原因是：

- 本机 Redis 没启动

因为当前本地配置中，数据库可以切本地 SQLite，但缓存仍可能沿用 Redis 配置。

如果你没有 Docker，可以自行在本机安装 Redis，或直接使用前面提到的：

- `.claude/tmp/playwright_backend.py`

## 12. 前端使用说明

### 登录方式

前端支持两种进入方式：

- 用户名 + 密码登录
- 手动粘贴访问令牌登录

### 本地存储

前端会自动保存以下信息到浏览器本地存储：

- `chatops-cmdb-base-url`
- `chatops-cmdb-access-token`

### 当前本地演示账号

当前本地开发环境中，前端默认使用的演示账号为：

- 用户名：`frontenddemo`
- 密码：`FrontendDemo123!`

注意：

- 这只是当前本地数据环境下可用的示例
- 如果你切换数据库或重建环境，该账号可能不存在

## 13. 前端视觉说明

当前前端 UI 已经演进为：

- 中文企业级控制台风格
- iOS / Apple Human Interface Guidelines 启发
- 雾霾蓝、白灰、低饱和蓝为主色
- 玻璃质感与连续圆角矩形容器
- 顶部品牌区域采用自定义 SVG Logo
- Logo 包含四芒星、无限符号和 ShapeBlur 外层流光

关键视觉相关文件包括：

- `frontend/src/styles.css`
- `frontend/src/app/AppLayout.tsx`
- `frontend/src/components/BorderGlow.tsx`
- `frontend/src/components/ShapeBlur.tsx`
- `frontend/src/components/RotatingText.tsx`

## 14. 构建与验证

### 后端检查

```powershell
cd D:\commonfiles\Codex\djangoproject
.\.venv\Scripts\python.exe backend\manage.py check
```

### 后端测试

```powershell
cd D:\commonfiles\Codex\djangoproject
.\.venv\Scripts\python.exe backend\manage.py test
```

### 前端构建

```powershell
cd D:\commonfiles\Codex\djangoproject\frontend
npm run build
```

### OpenAPI 导出

```powershell
cd D:\commonfiles\Codex\djangoproject
.\.venv\Scripts\python.exe backend\manage.py spectacular --file docs\api\openapi.yaml
```

## 15. Playwright 与烟测脚本

仓库中存在用于本地烟测和自动化验证的临时脚本，例如：

- `.claude/tmp/playwright_backend.py`
- `.claude/tmp/playwright_smoke.py`

这些脚本主要用于：

- 无 Redis 情况下启动后端
- 登录流程验证
- 页面关键路径烟测
- 自动化联调

相关日志和中间结果通常位于：

- `.claude/logs/`

## 16. `.claude` 自动化脚本

`.claude/` 目录中包含项目协作时用到的自动化脚本和配置。

常见文件包括：

- `.claude/settings.json`
- `.claude/bin/night_backend_loop.ps1`
- `.claude/bin/night_frontend_loop.ps1`
- `.claude/bin/post_backend_write.py`
- `.claude/bin/auto_finish_backend.py`
- `.claude/next_backend_task.md`
- `.claude/next_frontend_task.md`

### 前端 loop 启动示例

```powershell
cd D:\commonfiles\Codex\djangoproject
pwsh .claude\bin\night_frontend_loop.ps1 -Iterations 6
```

### 后端 loop 启动示例

```powershell
cd D:\commonfiles\Codex\djangoproject
pwsh .claude\bin\night_backend_loop.ps1 -Iterations 6
```

## 17. info-exchange 集成

项目当前已经接入 info-exchange 的本地工作方式。

关键文件：

- `.info.config`
- `info-exchange-api/`

当前协作规则包括：

- 优先从 `.info.config` 与环境变量读取配置
- 使用本地 skill 而不是手写裸请求
- 阶段完成后可向 info 平台写入记录
- 在共享仓库协作前需先做 git fetch 和状态检查

注意：

- 不要在文档、日志、总结中暴露完整的 `rk_`、`pk_`、`ak_` 密钥

## 18. 常见问题

### 1. 为什么我在 `backend/` 里执行 `npm run dev` 报错？

因为前端项目在：

- `frontend/`

正确命令是：

```powershell
cd D:\commonfiles\Codex\djangoproject\frontend
npm run dev
```

### 2. 为什么打开 `http://127.0.0.1:8000/` 会 404？

这是正常的。Django 后端没有实现根路径首页，后端主要提供 API 和文档。可以直接访问：

- `http://127.0.0.1:8000/api/docs/`
- `http://127.0.0.1:8000/api/redoc/`
- `http://127.0.0.1:8000/api/schema/`

### 3. 为什么登录时报 `Internal server error` 或 401？

常见原因包括：

- 后端没正确启动
- 前端 `baseUrl` 指到了错误端口
- Redis 未启动导致部分认证链路异常
- token 已过期
- 当前环境并不存在示例账号

建议按本文第 10 节的启动方案重新检查。

### 4. 为什么前端页面没更新？

优先检查：

- 当前是否真的在 `frontend/` 里跑 `npm run dev`
- 是否打开了正确的 Vite 页面地址
- 是否需要浏览器强刷 `Ctrl+F5`
- 是否需要重启前端 dev server

### 5. 为什么构建时提示 chunk 过大？

当前构建会出现 Vite 的大 chunk 警告，但这不是构建失败。后续如果要优化，可以考虑：

- 路由级懒加载
- `manualChunks`
- 进一步拆分可选页面模块

## 19. 推荐阅读顺序

如果你第一次接手本项目，建议按下面顺序阅读：

1. `README.md`
2. `docs/api/conventions.md`
3. `docs/api/endpoints.md`
4. `docs/api/openapi.yaml`
5. `backend/config/settings/`
6. `frontend/src/App.tsx`
7. `frontend/src/app/auth.tsx`
8. `frontend/src/lib/api.ts`
9. `frontend/src/pages/`
10. `frontend/src/styles.css`

## 20. 推荐开发流程

### 后端开发流程

1. 修改后端代码
2. 运行 `manage.py check`
3. 运行相关测试
4. 如接口变更，更新 OpenAPI
5. 同步接口文档
6. 如有协作要求，检查 git 状态和远端差异
7. 记录阶段成果

### 前端开发流程

1. 参考 `docs/api/openapi.yaml` 或接口文档
2. 修改页面、组件、样式、调用层
3. 运行 `npm run build`
4. 必要时做烟测
5. 记录阶段成果

## 21. 一套最稳的启动方案

如果你只是想最快在本地跑起来，推荐使用下面这套：

### 后端

```powershell
cd D:\commonfiles\Codex\djangoproject
.\.venv\Scripts\python.exe backend\manage.py migrate
.\.venv\Scripts\python.exe .claude\tmp\playwright_backend.py
```

### 前端

```powershell
cd D:\commonfiles\Codex\djangoproject\frontend
npm install
npm run dev
```

### 打开地址

- 前端：`http://127.0.0.1:5173/login`
- 后端：`http://127.0.0.1:8001`
- Swagger：`http://127.0.0.1:8001/api/docs/`

---

如果后续还要继续扩展项目，优先建议做这几件事：

1. 把 Redis 缓存切换做成真正可配置的本地模式。
2. 把 `.claude/tmp` 中的临时烟测脚本收敛为正式测试目录。
3. 把 OpenAPI 文档和 README 更新流程标准化。
4. 继续完善自动化执行链路与 agent 对接说明。
5. 对前端做路由级代码拆分，优化构建体积。
