# 本地演示数据与账号说明

本文档说明当前 `djangoproject` 本地开发环境中的演示数据来源、覆盖范围、测试账号与角色分配。

适用范围：
- 本地开发数据库
- `backend/core/management/commands/seed_demo_data.py` 生成或更新的数据

## 1. 数据来源

本地演示数据由以下管理命令生成：

```powershell
D:\commonfiles\Codex\djangoproject\.venv\Scripts\python.exe D:\commonfiles\Codex\djangoproject\backend\manage.py seed_demo_data
```

该命令为“可重复执行”设计：
- 会更新同名账号、机房、服务器、自动化任务和审计日志
- 不会只生成 `test1`、`test2` 这类无业务语义的数据
- 数据命名偏真实业务风格，适合前端联调、演示和本地测试

## 2. 当前本地数据概况

当前本地库中已确认包含以下规模的数据：

- 用户总数：17
- 服务器总数：22
- 自动化任务总数：20
- 审计日志总数：73

说明：
- 上述总量是当前本地数据库的实际统计结果
- 其中一部分可能来自你之前已有的数据
- `seed_demo_data` 会在现有基础上补充和更新演示数据

## 3. 自动化任务状态覆盖

当前演示任务已覆盖以下执行状态：

- `draft`
- `awaiting_approval`
- `ready`
- `claimed`
- `completed`
- `failed`
- `canceled`

当前演示任务已覆盖以下审批状态：

- `not_required`
- `pending`
- `approved`
- `rejected`

这意味着你在前端页面里可以直接看到：
- 草稿任务
- 待审批任务
- 可执行任务
- 已认领任务
- 已完成任务
- 执行失败任务
- 已取消任务

## 4. 服务器与资产数据覆盖

当前演示服务器数据覆盖了多种真实风格场景：

- 生产环境 `prod`
- 测试环境 `test`
- 开发环境 `dev`

生命周期覆盖：

- `online`
- `offline`
- `maintenance`
- `pre_allocated`

机房样例包括：

- `HZ-A1` Hangzhou West Lake Core Park
- `SH-B2` Shanghai Lingang Cloud Hub
- `SZ-C1` Shenzhen Nanshan Edge Facility
- `BJ-R1` Beijing Research Sandbox
- `CD-DR` Chengdu Disaster Recovery Vault

服务器命名风格示例：

- `prod-gateway-01`
- `prod-order-02`
- `prod-search-01`
- `uat-mobile-01`
- `qa-regression-01`
- `dev-aiops-02`
- `dr-archive-02`

## 5. 本地演示账号

以下账号由 `seed_demo_data` 明确创建或更新，适合本地登录和功能测试。

这些账号当前统一密码为：

```text
Welcome123!
```

### 5.1 业务风格账号

| 用户名 | 显示名 | 主要用途 |
| --- | --- | --- |
| `li.chen` | 陈立 | 运维/执行类演示 |
| `wen.shi` | 时雯 | 平台管理/审批演示 |
| `yu.zhao` | 赵宇 | 运维执行、机房与任务流转演示 |
| `min.gao` | 高敏 | 执行器认领、节点处理演示 |
| `anita.sun` | 孙安妮 | 审计与操作记录查看 |
| `hao.lin` | 林昊 | 任务申请、运维链路演示 |
| `jing.qi` | 齐静 | 审批链路演示 |
| `rui.he` | 何锐 | 只读浏览演示 |

### 5.2 演示账号

| 用户名 | 显示名 | 主要用途 |
| --- | --- | --- |
| `ops.demo` | 运维演示账号 | 适合演示运维执行类操作 |
| `approver.demo` | 审批演示账号 | 适合演示审批通过/驳回 |
| `auditor.demo` | 审计演示账号 | 适合查看审计记录 |
| `viewer.demo` | 只读演示账号 | 适合纯浏览演示 |

### 5.3 测试账号

| 用户名 | 显示名 | 主要用途 |
| --- | --- | --- |
| `test.ops` | 测试运维账号 | 自动化执行、任务处理联调 |
| `test.approver` | 测试审批账号 | 审批动作联调 |
| `test.viewer` | 测试查看账号 | 只读访问联调 |

## 6. 角色分配

演示账号当前写入了以下角色分组：

### `platform_admin`

- `wen.shi`

### `ops_admin`

- `li.chen`
- `yu.zhao`
- `min.gao`
- `hao.lin`
- `ops.demo`
- `test.ops`

### `approver`

- `wen.shi`
- `jing.qi`
- `approver.demo`
- `test.approver`

### `auditor`

- `anita.sun`
- `auditor.demo`

### `viewer`

- `viewer.demo`
- `test.viewer`
- `rui.he`

说明：
- 当前本地数据库里可能还存在你此前手动创建的其他用户
- 因此数据库中的组成员总数可能比本文件列出的 seed 账号稍多

## 7. 推荐登录用途

如果你只是想快速试功能，优先用这几组：

- 运维操作：`ops.demo`
- 审批操作：`approver.demo`
- 审计查看：`auditor.demo`
- 只读访问：`viewer.demo`

如果你想看更像真实业务人员的账号：

- 申请/运维：`li.chen`
- 审批：`wen.shi`
- 执行：`yu.zhao`
- 审计：`anita.sun`

## 8. 数据特点

这批数据不是随意命名的测试壳数据，而是尽量模拟真实业务场景：

- 服务器名称带有环境与业务角色
- 自动化任务名称更接近真实运维动作
- 审批、执行、失败、取消等状态均有覆盖
- 审计日志包含平台登录、任务审批、任务执行、资产更新等行为

示例任务包括：

- 华东生产网关证书轮换
- 核心订单链路限流策略升级
- 清结算服务 JVM 参数优化审批
- 搜索集群分片重平衡
- 灾备归档链路演练
- UAT 登录链路回放验证

## 9. 重新生成或刷新演示数据

如需补齐或刷新本地演示数据，执行：

```powershell
cd D:\commonfiles\Codex\djangoproject\backend
..\.venv\Scripts\python.exe manage.py seed_demo_data
```

更稳妥的完整写法：

```powershell
D:\commonfiles\Codex\djangoproject\.venv\Scripts\python.exe D:\commonfiles\Codex\djangoproject\backend\manage.py seed_demo_data
```

执行后建议再做一次基础检查：

```powershell
D:\commonfiles\Codex\djangoproject\.venv\Scripts\python.exe D:\commonfiles\Codex\djangoproject\backend\manage.py check
```

## 10. 相关文件

演示数据生成逻辑：
[seed_demo_data.py](D:/commonfiles/Codex/djangoproject/backend/core/management/commands/seed_demo_data.py)

本说明文档：
[DEMO_DATA_GUIDE.md](D:/commonfiles/Codex/djangoproject/DEMO_DATA_GUIDE.md)
