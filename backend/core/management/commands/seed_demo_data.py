from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth.models import Group
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from audit.models import AuditLog
from automation.models import Job, JobApprovalStatus, JobExecutionStatus, JobRiskLevel
from cmdb.models import IDC, DataSourceType, EnvironmentType, IDCStatus, Server, ServerLifecycleStatus
from core.permissions import ROLE_APPROVER, ROLE_AUDITOR, ROLE_OPS_ADMIN, ROLE_PLATFORM_ADMIN, ROLE_VIEWER


User = get_user_model()


IDC_BLUEPRINTS = [
    {
        "code": "HZ-A1",
        "name": "Hangzhou West Lake Core Park",
        "location": "Hangzhou",
        "status": IDCStatus.ACTIVE,
        "description": "华东核心生产资源池，承载主业务流量与核心数据库集群。",
    },
    {
        "code": "SH-B2",
        "name": "Shanghai Lingang Cloud Hub",
        "location": "Shanghai",
        "status": IDCStatus.ACTIVE,
        "description": "面向交易链路和分析平台的混合云接入节点。",
    },
    {
        "code": "SZ-C1",
        "name": "Shenzhen Nanshan Edge Facility",
        "location": "Shenzhen",
        "status": IDCStatus.MAINTENANCE,
        "description": "负责南区边缘接入与低时延业务分发，当前处于窗口维护期。",
    },
    {
        "code": "BJ-R1",
        "name": "Beijing Research Sandbox",
        "location": "Beijing",
        "status": IDCStatus.ACTIVE,
        "description": "研发验证与自动化回归环境，服务于预发与测试链路。",
    },
    {
        "code": "CD-DR",
        "name": "Chengdu Disaster Recovery Vault",
        "location": "Chengdu",
        "status": IDCStatus.INACTIVE,
        "description": "历史容灾中心，保留核心资产编目和灾备切换预案信息。",
    },
]


SERVER_BLUEPRINTS = [
    {
        "hostname": "prod-gateway-01",
        "internal_ip": "10.20.1.11",
        "external_ip": "47.98.11.21",
        "os_version": "Ubuntu 22.04 LTS",
        "cpu_cores": 16,
        "memory_gb": Decimal("64.00"),
        "disk_summary": "系统盘 200GB NVMe / 数据盘 1TB NVMe",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.PROD,
        "idc_code": "HZ-A1",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 1,
        "metadata": {"service": "api-gateway", "owner_team": "核心接入平台", "role": "ingress"},
    },
    {
        "hostname": "prod-order-02",
        "internal_ip": "10.20.1.42",
        "external_ip": None,
        "os_version": "Rocky Linux 9.3",
        "cpu_cores": 32,
        "memory_gb": Decimal("128.00"),
        "disk_summary": "系统盘 300GB SSD / 数据盘 2TB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.PROD,
        "idc_code": "HZ-A1",
        "source": DataSourceType.API,
        "last_seen_offset_hours": 2,
        "metadata": {"service": "order-core", "owner_team": "交易中台", "role": "application"},
    },
    {
        "hostname": "prod-risk-01",
        "internal_ip": "10.20.2.18",
        "external_ip": None,
        "os_version": "Ubuntu 20.04 LTS",
        "cpu_cores": 24,
        "memory_gb": Decimal("96.00"),
        "disk_summary": "系统盘 200GB SSD / 模型盘 1.5TB NVMe",
        "lifecycle_status": ServerLifecycleStatus.MAINTENANCE,
        "environment": EnvironmentType.PROD,
        "idc_code": "SH-B2",
        "source": DataSourceType.AGENT,
        "last_seen_offset_hours": 7,
        "metadata": {"service": "risk-engine", "owner_team": "智能风控", "role": "compute"},
    },
    {
        "hostname": "prod-cache-03",
        "internal_ip": "10.20.3.26",
        "external_ip": None,
        "os_version": "Debian 12",
        "cpu_cores": 8,
        "memory_gb": Decimal("32.00"),
        "disk_summary": "系统盘 120GB SSD / 缓存盘 800GB NVMe",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.PROD,
        "idc_code": "SH-B2",
        "source": DataSourceType.AGENT,
        "last_seen_offset_hours": 1,
        "metadata": {"service": "redis-cluster", "owner_team": "基础中间件", "role": "cache"},
    },
    {
        "hostname": "preprod-app-01",
        "internal_ip": "10.31.4.15",
        "external_ip": None,
        "os_version": "Ubuntu 22.04 LTS",
        "cpu_cores": 16,
        "memory_gb": Decimal("48.00"),
        "disk_summary": "系统盘 150GB SSD / 数据盘 600GB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.TEST,
        "idc_code": "BJ-R1",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 3,
        "metadata": {"service": "release-verification", "owner_team": "质量工程", "role": "preprod"},
    },
    {
        "hostname": "preprod-batch-02",
        "internal_ip": "10.31.4.37",
        "external_ip": None,
        "os_version": "Rocky Linux 8.10",
        "cpu_cores": 12,
        "memory_gb": Decimal("32.00"),
        "disk_summary": "系统盘 120GB SSD / 作业盘 500GB HDD",
        "lifecycle_status": ServerLifecycleStatus.OFFLINE,
        "environment": EnvironmentType.TEST,
        "idc_code": "BJ-R1",
        "source": DataSourceType.API,
        "last_seen_offset_hours": 72,
        "metadata": {"service": "batch-runner", "owner_team": "数据平台", "role": "scheduler"},
    },
    {
        "hostname": "uat-web-01",
        "internal_ip": "10.32.8.11",
        "external_ip": None,
        "os_version": "Ubuntu 22.04 LTS",
        "cpu_cores": 8,
        "memory_gb": Decimal("16.00"),
        "disk_summary": "系统盘 100GB SSD / 静态资源盘 300GB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.TEST,
        "idc_code": "BJ-R1",
        "source": DataSourceType.AGENT,
        "last_seen_offset_hours": 4,
        "metadata": {"service": "user-console", "owner_team": "前端平台", "role": "web"},
    },
    {
        "hostname": "dr-sync-01",
        "internal_ip": "10.88.0.21",
        "external_ip": None,
        "os_version": "Debian 11",
        "cpu_cores": 16,
        "memory_gb": Decimal("64.00"),
        "disk_summary": "系统盘 160GB SSD / 备份盘 4TB HDD",
        "lifecycle_status": ServerLifecycleStatus.PRE_ALLOCATED,
        "environment": EnvironmentType.PROD,
        "idc_code": "CD-DR",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 240,
        "metadata": {"service": "disaster-recovery", "owner_team": "基础设施稳定性", "role": "backup"},
    },
    {
        "hostname": "edge-ingress-01",
        "internal_ip": "10.55.1.9",
        "external_ip": "119.29.18.65",
        "os_version": "Ubuntu 20.04 LTS",
        "cpu_cores": 12,
        "memory_gb": Decimal("24.00"),
        "disk_summary": "系统盘 120GB SSD / 日志盘 400GB SSD",
        "lifecycle_status": ServerLifecycleStatus.MAINTENANCE,
        "environment": EnvironmentType.PROD,
        "idc_code": "SZ-C1",
        "source": DataSourceType.AGENT,
        "last_seen_offset_hours": 16,
        "metadata": {"service": "edge-ingress", "owner_team": "边缘网络", "role": "proxy"},
    },
    {
        "hostname": "dev-observability-01",
        "internal_ip": "10.41.6.30",
        "external_ip": None,
        "os_version": "Ubuntu 22.04 LTS",
        "cpu_cores": 8,
        "memory_gb": Decimal("24.00"),
        "disk_summary": "系统盘 100GB SSD / 监控盘 500GB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.DEV,
        "idc_code": "BJ-R1",
        "source": DataSourceType.API,
        "last_seen_offset_hours": 2,
        "metadata": {"service": "observability-lab", "owner_team": "SRE", "role": "monitoring"},
    },
    {
        "hostname": "dev-aiops-02",
        "internal_ip": "10.41.6.44",
        "external_ip": None,
        "os_version": "Rocky Linux 9.3",
        "cpu_cores": 20,
        "memory_gb": Decimal("80.00"),
        "disk_summary": "系统盘 200GB SSD / 模型盘 1TB NVMe",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.DEV,
        "idc_code": "HZ-A1",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 1,
        "metadata": {"service": "aiops-lab", "owner_team": "AIOps", "role": "inference"},
    },
    {
        "hostname": "finance-report-01",
        "internal_ip": "10.22.9.17",
        "external_ip": None,
        "os_version": "Windows Server 2022",
        "cpu_cores": 12,
        "memory_gb": Decimal("32.00"),
        "disk_summary": "系统盘 120GB SSD / 报表盘 1TB HDD",
        "lifecycle_status": ServerLifecycleStatus.OFFLINE,
        "environment": EnvironmentType.PROD,
        "idc_code": "HZ-A1",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 120,
        "metadata": {"service": "finance-reporting", "owner_team": "财务数据服务", "role": "reporting"},
    },
    {
        "hostname": "prod-search-01",
        "internal_ip": "10.20.5.31",
        "external_ip": None,
        "os_version": "Rocky Linux 9.3",
        "cpu_cores": 24,
        "memory_gb": Decimal("96.00"),
        "disk_summary": "系统盘 200GB SSD / 索引盘 3TB NVMe",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.PROD,
        "idc_code": "SH-B2",
        "source": DataSourceType.API,
        "last_seen_offset_hours": 1,
        "metadata": {"service": "search-cluster", "owner_team": "搜索平台", "role": "index"},
    },
    {
        "hostname": "prod-ledger-01",
        "internal_ip": "10.20.6.14",
        "external_ip": None,
        "os_version": "Ubuntu 22.04 LTS",
        "cpu_cores": 16,
        "memory_gb": Decimal("64.00"),
        "disk_summary": "系统盘 160GB SSD / 数据盘 1TB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.PROD,
        "idc_code": "HZ-A1",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 3,
        "metadata": {"service": "ledger-service", "owner_team": "清结算平台", "role": "application"},
    },
    {
        "hostname": "uat-mobile-01",
        "internal_ip": "10.32.9.22",
        "external_ip": None,
        "os_version": "Ubuntu 22.04 LTS",
        "cpu_cores": 8,
        "memory_gb": Decimal("24.00"),
        "disk_summary": "系统盘 100GB SSD / 构建盘 300GB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.TEST,
        "idc_code": "BJ-R1",
        "source": DataSourceType.AGENT,
        "last_seen_offset_hours": 5,
        "metadata": {"service": "mobile-api", "owner_team": "移动客户端平台", "role": "uat"},
    },
    {
        "hostname": "qa-regression-01",
        "internal_ip": "10.33.2.41",
        "external_ip": None,
        "os_version": "Debian 12",
        "cpu_cores": 12,
        "memory_gb": Decimal("32.00"),
        "disk_summary": "系统盘 120GB SSD / 报告盘 500GB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.TEST,
        "idc_code": "BJ-R1",
        "source": DataSourceType.API,
        "last_seen_offset_hours": 6,
        "metadata": {"service": "regression-farm", "owner_team": "测试平台", "role": "qa"},
    },
    {
        "hostname": "dev-feature-03",
        "internal_ip": "10.41.7.18",
        "external_ip": None,
        "os_version": "Ubuntu 24.04 LTS",
        "cpu_cores": 10,
        "memory_gb": Decimal("20.00"),
        "disk_summary": "系统盘 100GB SSD / 工作盘 300GB SSD",
        "lifecycle_status": ServerLifecycleStatus.ONLINE,
        "environment": EnvironmentType.DEV,
        "idc_code": "BJ-R1",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 2,
        "metadata": {"service": "feature-sandbox", "owner_team": "体验创新组", "role": "sandbox"},
    },
    {
        "hostname": "dev-release-01",
        "internal_ip": "10.41.7.39",
        "external_ip": None,
        "os_version": "Windows Server 2022",
        "cpu_cores": 8,
        "memory_gb": Decimal("16.00"),
        "disk_summary": "系统盘 120GB SSD / 制品盘 400GB SSD",
        "lifecycle_status": ServerLifecycleStatus.MAINTENANCE,
        "environment": EnvironmentType.DEV,
        "idc_code": "HZ-A1",
        "source": DataSourceType.MANUAL,
        "last_seen_offset_hours": 20,
        "metadata": {"service": "release-orchestrator", "owner_team": "发布工程", "role": "orchestration"},
    },
    {
        "hostname": "dr-archive-02",
        "internal_ip": "10.88.0.34",
        "external_ip": None,
        "os_version": "Debian 11",
        "cpu_cores": 12,
        "memory_gb": Decimal("48.00"),
        "disk_summary": "系统盘 120GB SSD / 归档盘 8TB HDD",
        "lifecycle_status": ServerLifecycleStatus.PRE_ALLOCATED,
        "environment": EnvironmentType.PROD,
        "idc_code": "CD-DR",
        "source": DataSourceType.API,
        "last_seen_offset_hours": 360,
        "metadata": {"service": "archive-store", "owner_team": "灾备平台", "role": "archive"},
    },
]


JOB_BLUEPRINTS = [
    {
        "name": "华东生产网关证书轮换",
        "status": JobExecutionStatus.DRAFT,
        "risk_level": JobRiskLevel.LOW,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "api-gateway", "scope": "hz-prod-ingress", "change_window": "今晚 23:00-23:30"},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 2,
    },
    {
        "name": "核心订单链路限流策略升级",
        "status": JobExecutionStatus.AWAITING_APPROVAL,
        "risk_level": JobRiskLevel.HIGH,
        "approval_status": JobApprovalStatus.PENDING,
        "payload": {"service": "order-core", "plan": "rate-limit-v3", "expected_impact": "瞬时峰值削峰"},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {"change_ticket": "CHG-20260404-031"},
        "requested_by": "li.chen",
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 6,
    },
    {
        "name": "支付风控规则集灰度发布",
        "status": JobExecutionStatus.DRAFT,
        "risk_level": JobRiskLevel.HIGH,
        "approval_status": JobApprovalStatus.APPROVED,
        "payload": {"service": "risk-engine", "release_batch": "risk-rules-2026-04", "gray_ratio": "15%"},
        "execution_summary": "",
        "approval_comment": "已核对回滚预案与监控项，可进入执行准备。",
        "execution_metadata": {"change_ticket": "CHG-20260403-118"},
        "requested_by": "li.chen",
        "approved_by": "wen.shi",
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 10,
    },
    {
        "name": "用户工作台静态资源预热",
        "status": JobExecutionStatus.READY,
        "risk_level": JobRiskLevel.LOW,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "user-console", "region": "all", "artifact": "frontend-2026.04.04.1"},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {"expected_duration_minutes": 20},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": "yu.zhao",
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 12,
    },
    {
        "name": "南区边缘节点配置校准",
        "status": JobExecutionStatus.CLAIMED,
        "risk_level": JobRiskLevel.MEDIUM,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "edge-ingress", "node_group": "sz-c1-edge", "template": "edge-profile-v2"},
        "execution_summary": "执行器已认领，正在进行配置漂移对齐。",
        "approval_comment": "",
        "execution_metadata": {"progress": "62%", "current_step": "diff apply", "ticket": "OPS-14628"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": "min.gao",
        "agent": "agent-sz-edge-02",
        "reported_agent": "agent-sz-edge-02",
        "hours_ago": 18,
    },
    {
        "name": "华东缓存集群参数收敛",
        "status": JobExecutionStatus.COMPLETED,
        "risk_level": JobRiskLevel.MEDIUM,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "redis-cluster", "target": "prod-cache-03", "profile": "cache-optim-2026q2"},
        "execution_summary": "参数收敛完成，主从延迟恢复到健康区间。",
        "approval_comment": "",
        "execution_metadata": {"latency_before_ms": 22, "latency_after_ms": 8, "verification": "passed"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 24,
    },
    {
        "name": "预发批处理节点补丁加固",
        "status": JobExecutionStatus.FAILED,
        "risk_level": JobRiskLevel.HIGH,
        "approval_status": JobApprovalStatus.APPROVED,
        "payload": {"service": "batch-runner", "target": "preprod-batch-02", "patch_bundle": "linux-security-2026w14"},
        "execution_summary": "补丁安装阶段校验失败，需在下一个窗口重新编排。",
        "approval_comment": "允许在预发环境先行验证，失败后直接回收到重试队列。",
        "execution_metadata": {"failed_step": "kernel validation", "exit_code": 17, "rollback": "completed"},
        "requested_by": "li.chen",
        "approved_by": "wen.shi",
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 30,
    },
    {
        "name": "财务报表节点资源回收",
        "status": JobExecutionStatus.CANCELED,
        "risk_level": JobRiskLevel.LOW,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "finance-reporting", "target": "finance-report-01", "action": "resource-reclaim"},
        "execution_summary": "业务方临时冻结变更，任务已终止。",
        "approval_comment": "",
        "execution_metadata": {"reason": "business freeze", "ticket": "FINOPS-2204"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 40,
    },
    {
        "name": "生产数据库连接池扩容审批",
        "status": JobExecutionStatus.DRAFT,
        "risk_level": JobRiskLevel.HIGH,
        "approval_status": JobApprovalStatus.REJECTED,
        "payload": {"service": "order-core", "target": "db-pool-prod", "desired_pool_size": 240},
        "execution_summary": "",
        "approval_comment": "监控回溯不足，需补充连接峰值与回滚策略后重新发起。",
        "execution_metadata": {"change_ticket": "CHG-20260402-084"},
        "requested_by": "li.chen",
        "approved_by": None,
        "rejected_by": "wen.shi",
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 54,
    },
    {
        "name": "AIOps 推理节点镜像更新",
        "status": JobExecutionStatus.READY,
        "risk_level": JobRiskLevel.MEDIUM,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "aiops-lab", "target": "dev-aiops-02", "image": "aiops-infer:2026.04.04"},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {"expected_duration_minutes": 35, "owner_team": "AIOps"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": "yu.zhao",
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 8,
    },
    {
        "name": "观测平台指标链路重建",
        "status": JobExecutionStatus.COMPLETED,
        "risk_level": JobRiskLevel.HIGH,
        "approval_status": JobApprovalStatus.APPROVED,
        "payload": {"service": "observability-lab", "scope": "metrics-pipeline", "playbook": "rebuild-prometheus-link"},
        "execution_summary": "链路恢复完成，告警收敛正常，数据回补无缺口。",
        "approval_comment": "涉及共享监控入口，审批通过后已安排值守窗口。",
        "execution_metadata": {"recovery_minutes": 26, "incident_id": "INC-20260403-19"},
        "requested_by": "li.chen",
        "approved_by": "wen.shi",
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 16,
    },
    {
        "name": "上海交易链路压测预检",
        "status": JobExecutionStatus.DRAFT,
        "risk_level": JobRiskLevel.MEDIUM,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "trade-core", "region": "sh", "checklist": ["quota", "network", "shadow-data"]},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {"owner_team": "交易基础架构"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 4,
    },
    {
        "name": "清结算服务 JVM 参数优化审批",
        "status": JobExecutionStatus.AWAITING_APPROVAL,
        "risk_level": JobRiskLevel.HIGH,
        "approval_status": JobApprovalStatus.PENDING,
        "payload": {"service": "ledger-service", "profile": "jvm-prod-2026q2", "window": "周日 01:00"},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {"change_ticket": "CHG-20260404-067"},
        "requested_by": "hao.lin",
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 14,
    },
    {
        "name": "移动端发布白名单切换",
        "status": JobExecutionStatus.READY,
        "risk_level": JobRiskLevel.LOW,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "mobile-api", "release": "2026.04.04-mobile", "scope": "uat"},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {"operator_note": "等待产品确认切换时点"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": "test.ops",
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 11,
    },
    {
        "name": "搜索集群分片重平衡",
        "status": JobExecutionStatus.CLAIMED,
        "risk_level": JobRiskLevel.MEDIUM,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "search-cluster", "target": "prod-search-01", "strategy": "rebalance-hot-shards"},
        "execution_summary": "执行器已开始重平衡热点分片，预计 40 分钟完成。",
        "approval_comment": "",
        "execution_metadata": {"progress": "41%", "current_shard": "order-history-2026-04", "ticket": "OPS-14712"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": "ops.demo",
        "agent": "agent-search-01",
        "reported_agent": "agent-search-01",
        "hours_ago": 9,
    },
    {
        "name": "灾备归档链路演练",
        "status": JobExecutionStatus.COMPLETED,
        "risk_level": JobRiskLevel.MEDIUM,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "archive-store", "target": "dr-archive-02", "playbook": "archive-drill-v2"},
        "execution_summary": "归档链路演练完成，抽样恢复与校验结果正常。",
        "approval_comment": "",
        "execution_metadata": {"restored_samples": 120, "checksum_status": "passed"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 22,
    },
    {
        "name": "UAT 登录链路回放验证",
        "status": JobExecutionStatus.FAILED,
        "risk_level": JobRiskLevel.LOW,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "user-console", "target": "uat-web-01", "scenario": "login-replay"},
        "execution_summary": "回放过程中第三方依赖超时，未能完成全链路验证。",
        "approval_comment": "",
        "execution_metadata": {"failed_dependency": "captcha-service", "timeout_seconds": 30},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 27,
    },
    {
        "name": "夜间批量任务限速回调",
        "status": JobExecutionStatus.CANCELED,
        "risk_level": JobRiskLevel.MEDIUM,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "batch-runner", "target": "preprod-batch-02", "policy": "rate-limit-reset"},
        "execution_summary": "上游窗口取消，限速回调计划终止。",
        "approval_comment": "",
        "execution_metadata": {"owner_confirmation": "received", "ticket": "OPS-14601"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 36,
    },
    {
        "name": "对账平台从库切换评估",
        "status": JobExecutionStatus.DRAFT,
        "risk_level": JobRiskLevel.HIGH,
        "approval_status": JobApprovalStatus.REJECTED,
        "payload": {"service": "finance-reporting", "target": "finance-report-01", "proposal": "switch-to-standby"},
        "execution_summary": "",
        "approval_comment": "业务峰值评估不充分，请补充对账高峰期指标后重提。",
        "execution_metadata": {"change_ticket": "CHG-20260401-044"},
        "requested_by": "hao.lin",
        "approved_by": None,
        "rejected_by": "approver.demo",
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 60,
    },
    {
        "name": "监控告警收敛策略上线",
        "status": JobExecutionStatus.DRAFT,
        "risk_level": JobRiskLevel.LOW,
        "approval_status": JobApprovalStatus.NOT_REQUIRED,
        "payload": {"service": "observability-lab", "scope": "prometheus-alerts", "strategy": "noise-reduction-v4"},
        "execution_summary": "",
        "approval_comment": "",
        "execution_metadata": {"owner_team": "SRE", "expected_drop": "18%"},
        "requested_by": None,
        "approved_by": None,
        "rejected_by": None,
        "ready_by": None,
        "claimed_by": None,
        "agent": "",
        "reported_agent": "",
        "hours_ago": 7,
    },
]


AUDIT_BLUEPRINTS = [
    {
        "action": "cmdb.server.synced",
        "target": "server:prod-order-02:10.20.1.42",
        "actor": "yu.zhao",
        "detail": {"source": "api", "result": "ok", "changed_fields": ["metadata", "last_seen_at"]},
        "hours_ago": 1,
    },
    {
        "action": "cmdb.server.maintenance_window_scheduled",
        "target": "server:prod-risk-01:10.20.2.18",
        "actor": "min.gao",
        "detail": {"window": "2026-04-05 01:00-03:00", "reason": "kernel tuning"},
        "hours_ago": 5,
    },
    {
        "action": "automation.job.handoff_snapshot_viewed",
        "target": "queue:execution-ready",
        "actor": "li.chen",
        "detail": {"visible_jobs": 3, "focus_service": "frontend"},
        "hours_ago": 9,
    },
    {
        "action": "platform.dashboard.login",
        "target": "workspace:overview",
        "actor": "wen.shi",
        "detail": {"ip": "127.0.0.1", "client": "web-console"},
        "hours_ago": 12,
    },
    {
        "action": "audit.log.tool_query",
        "target": "audit:recent-high-risk",
        "actor": "anita.sun",
        "detail": {"filters": {"action": "automation.job.approved"}, "result_count": 8},
        "hours_ago": 20,
    },
    {
        "action": "cmdb.idc.capacity_reviewed",
        "target": "idc:HZ-A1:Hangzhou West Lake Core Park",
        "actor": "wen.shi",
        "detail": {"cpu_utilization": "61%", "memory_utilization": "68%", "comment": "capacity healthy"},
        "hours_ago": 28,
    },
    {
        "action": "automation.job.approval_requested",
        "target": "job:清结算服务 JVM 参数优化审批",
        "actor": "hao.lin",
        "detail": {"risk_level": "high", "approval_status": "pending", "window": "周日 01:00"},
        "hours_ago": 14,
    },
    {
        "action": "automation.job.claimed",
        "target": "job:搜索集群分片重平衡",
        "actor": "ops.demo",
        "detail": {"assigned_agent_key_id": "agent-search-01", "comment": "按热点索引优先处理"},
        "hours_ago": 9,
    },
    {
        "action": "automation.job.completed",
        "target": "job:灾备归档链路演练",
        "actor": "yu.zhao",
        "detail": {"verification": "passed", "duration_minutes": 54},
        "hours_ago": 22,
    },
    {
        "action": "automation.job.failed",
        "target": "job:UAT 登录链路回放验证",
        "actor": "test.ops",
        "detail": {"dependency": "captcha-service", "retryable": True},
        "hours_ago": 27,
    },
    {
        "action": "cmdb.server.asset_registered",
        "target": "server:prod-search-01:10.20.5.31",
        "actor": "li.chen",
        "detail": {"source": "manual", "owner_team": "搜索平台"},
        "hours_ago": 32,
    },
    {
        "action": "platform.user.login",
        "target": "workspace:login",
        "actor": "viewer.demo",
        "detail": {"client": "web-console", "result": "success"},
        "hours_ago": 3,
    },
]


USERS = [
    {"username": "li.chen", "display_name": "陈立", "email": "li.chen@example.com", "first_name": "立", "last_name": "陈"},
    {"username": "wen.shi", "display_name": "时雯", "email": "wen.shi@example.com", "first_name": "雯", "last_name": "时"},
    {"username": "yu.zhao", "display_name": "赵宇", "email": "yu.zhao@example.com", "first_name": "宇", "last_name": "赵"},
    {"username": "min.gao", "display_name": "高敏", "email": "min.gao@example.com", "first_name": "敏", "last_name": "高"},
    {"username": "anita.sun", "display_name": "孙安妮", "email": "anita.sun@example.com", "first_name": "安妮", "last_name": "孙"},
    {"username": "hao.lin", "display_name": "林昊", "email": "hao.lin@example.com", "first_name": "昊", "last_name": "林"},
    {"username": "jing.qi", "display_name": "齐静", "email": "jing.qi@example.com", "first_name": "静", "last_name": "齐"},
    {"username": "rui.he", "display_name": "何锐", "email": "rui.he@example.com", "first_name": "锐", "last_name": "何"},
    {"username": "ops.demo", "display_name": "运维演示账号", "email": "ops.demo@example.com", "first_name": "演示", "last_name": "运维"},
    {"username": "approver.demo", "display_name": "审批演示账号", "email": "approver.demo@example.com", "first_name": "演示", "last_name": "审批"},
    {"username": "auditor.demo", "display_name": "审计演示账号", "email": "auditor.demo@example.com", "first_name": "演示", "last_name": "审计"},
    {"username": "viewer.demo", "display_name": "只读演示账号", "email": "viewer.demo@example.com", "first_name": "演示", "last_name": "查看"},
    {"username": "test.ops", "display_name": "测试运维账号", "email": "test.ops@example.com", "first_name": "测试", "last_name": "运维"},
    {"username": "test.approver", "display_name": "测试审批账号", "email": "test.approver@example.com", "first_name": "测试", "last_name": "审批"},
    {"username": "test.viewer", "display_name": "测试查看账号", "email": "test.viewer@example.com", "first_name": "测试", "last_name": "查看"},
]


GROUP_MEMBERSHIP = {
    ROLE_PLATFORM_ADMIN: ["wen.shi"],
    ROLE_OPS_ADMIN: ["li.chen", "yu.zhao", "min.gao", "hao.lin", "ops.demo", "test.ops"],
    ROLE_APPROVER: ["wen.shi", "jing.qi", "approver.demo", "test.approver"],
    ROLE_AUDITOR: ["anita.sun", "auditor.demo"],
    ROLE_VIEWER: ["viewer.demo", "test.viewer", "rui.he"],
}


class Command(BaseCommand):
    help = "Seed realistic demo data for local development, including users, IDCs, servers, jobs, and audit logs."

    @transaction.atomic
    def handle(self, *args, **options):
        users = self._seed_users()
        self._seed_groups(users)
        idcs = self._seed_idcs()
        servers_count = self._seed_servers(idcs)
        jobs_count = self._seed_jobs(users)
        audits_count = self._seed_audits(users)

        self.stdout.write(self.style.SUCCESS("Demo data has been seeded successfully."))
        self.stdout.write(
            f"Users: {len(users)} | IDCs: {len(idcs)} | Servers touched: {servers_count} | Jobs touched: {jobs_count} | Audit logs touched: {audits_count}"
        )

    def _seed_users(self):
        users = {}
        for item in USERS:
            user, _ = User.objects.update_or_create(
                username=item["username"],
                defaults={
                    "email": item["email"],
                    "display_name": item["display_name"],
                    "first_name": item["first_name"],
                    "last_name": item["last_name"],
                    "is_active": True,
                    "is_staff": item["username"] in {"wen.shi", "ops.demo", "approver.demo", "auditor.demo"},
                },
            )
            user.set_password("Welcome123!")
            user.save(update_fields=["password"])
            users[item["username"]] = user
        return users

    def _seed_groups(self, users):
        groups = {}
        for group_name in GROUP_MEMBERSHIP:
            group, _ = Group.objects.get_or_create(name=group_name)
            groups[group_name] = group

        seeded_usernames = set(users.keys())
        for user in users.values():
            user.groups.remove(*user.groups.filter(name__in=GROUP_MEMBERSHIP.keys()))

        for group_name, usernames in GROUP_MEMBERSHIP.items():
            group = groups[group_name]
            for username in usernames:
                if username in seeded_usernames:
                    group.user_set.add(users[username])

    def _seed_idcs(self):
        idcs = {}
        now = timezone.now()
        for index, item in enumerate(IDC_BLUEPRINTS):
            idc, _ = IDC.objects.update_or_create(
                code=item["code"],
                defaults={
                    "name": item["name"],
                    "location": item["location"],
                    "status": item["status"],
                    "description": item["description"],
                },
            )
            created_at = now - timedelta(days=150 - index * 9)
            updated_at = now - timedelta(days=max(1, 20 - index * 2))
            IDC.objects.filter(pk=idc.pk).update(created_at=created_at, updated_at=updated_at)
            idcs[item["code"]] = IDC.objects.get(pk=idc.pk)
        return idcs

    def _seed_servers(self, idcs):
        now = timezone.now()
        touched = 0
        for index, item in enumerate(SERVER_BLUEPRINTS):
            server, _ = Server.objects.update_or_create(
                hostname=item["hostname"],
                internal_ip=item["internal_ip"],
                defaults={
                    "external_ip": item["external_ip"],
                    "os_version": item["os_version"],
                    "cpu_cores": item["cpu_cores"],
                    "memory_gb": item["memory_gb"],
                    "disk_summary": item["disk_summary"],
                    "lifecycle_status": item["lifecycle_status"],
                    "environment": item["environment"],
                    "idc": idcs[item["idc_code"]],
                    "source": item["source"],
                    "last_seen_at": now - timedelta(hours=item["last_seen_offset_hours"]),
                    "metadata": item["metadata"],
                },
            )
            created_at = now - timedelta(days=90 - index * 4, hours=index)
            updated_at = now - timedelta(hours=item["last_seen_offset_hours"])
            Server.objects.filter(pk=server.pk).update(created_at=created_at, updated_at=updated_at)
            touched += 1
        return touched

    def _seed_jobs(self, users):
        now = timezone.now()
        touched = 0
        for index, item in enumerate(JOB_BLUEPRINTS):
            happened_at = now - timedelta(hours=item["hours_ago"])
            requested_user = users.get(item["requested_by"]) if item["requested_by"] else None
            approved_user = users.get(item["approved_by"]) if item["approved_by"] else None
            rejected_user = users.get(item["rejected_by"]) if item["rejected_by"] else None
            ready_user = users.get(item["ready_by"]) if item["ready_by"] else None
            claimed_user = users.get(item["claimed_by"]) if item["claimed_by"] else None

            ready_at = happened_at + timedelta(minutes=20) if ready_user else None
            claimed_at = happened_at + timedelta(minutes=55) if claimed_user else None
            completed_at = happened_at + timedelta(hours=2, minutes=10) if item["status"] == JobExecutionStatus.COMPLETED else None
            failed_at = happened_at + timedelta(hours=1, minutes=35) if item["status"] == JobExecutionStatus.FAILED else None
            approval_requested_at = happened_at + timedelta(minutes=5) if requested_user else None
            approved_at = happened_at + timedelta(minutes=40) if approved_user else None
            rejected_at = happened_at + timedelta(minutes=35) if rejected_user else None

            job, _ = Job.objects.update_or_create(
                name=item["name"],
                defaults={
                    "status": item["status"],
                    "risk_level": item["risk_level"],
                    "approval_status": item["approval_status"],
                    "execution_summary": item["execution_summary"],
                    "execution_metadata": item["execution_metadata"],
                    "completed_at": completed_at,
                    "failed_at": failed_at,
                    "assigned_agent_key_id": item["agent"],
                    "last_reported_by_agent_key": item["reported_agent"],
                    "approval_requested_by": requested_user,
                    "approval_requested_at": approval_requested_at,
                    "approved_by": approved_user,
                    "approved_at": approved_at,
                    "rejected_by": rejected_user,
                    "rejected_at": rejected_at,
                    "ready_by": ready_user,
                    "ready_at": ready_at,
                    "claimed_by": claimed_user,
                    "claimed_at": claimed_at,
                    "approval_comment": item["approval_comment"],
                    "payload": item["payload"],
                },
            )
            created_at = happened_at - timedelta(hours=4 + index)
            updated_at = max(
                value
                for value in [
                    happened_at,
                    approval_requested_at,
                    approved_at,
                    rejected_at,
                    ready_at,
                    claimed_at,
                    completed_at,
                    failed_at,
                ]
                if value is not None
            )
            Job.objects.filter(pk=job.pk).update(created_at=created_at, updated_at=updated_at)
            touched += 1
        return touched

    def _seed_audits(self, users):
        now = timezone.now()
        touched = 0
        for item in AUDIT_BLUEPRINTS:
            AuditLog.objects.update_or_create(
                action=item["action"],
                target=item["target"],
                defaults={
                    "actor": users.get(item["actor"]) if item["actor"] else None,
                    "detail": item["detail"],
                },
            )
            log = AuditLog.objects.get(action=item["action"], target=item["target"])
            happened_at = now - timedelta(hours=item["hours_ago"])
            AuditLog.objects.filter(pk=log.pk).update(created_at=happened_at, updated_at=happened_at)
            touched += 1
        return touched
