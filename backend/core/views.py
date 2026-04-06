import uuid
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from django.urls import URLPattern, URLResolver, reverse
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from audit.models import AuditLog
from automation.models import Job, JobApprovalStatus, JobExecutionStatus, JobRiskLevel
from cmdb.models import Server, ServerLifecycleStatus

from .serializers import AgentRunnerOverviewSerializer, ContractWorkbenchSerializer, HealthcheckSerializer, OverviewSummarySerializer


class HealthcheckView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = HealthcheckSerializer

    def get(self, request, *args, **kwargs):
        payload, http_status = build_healthcheck_payload(getattr(request, "request_id", ""))
        return Response(payload, status=http_status)


class OverviewSummaryView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = OverviewSummarySerializer

    def get(self, request, *args, **kwargs):
        payload = build_overview_summary_payload(getattr(request, "request_id", ""))
        return Response(payload, status=status.HTTP_200_OK)


class AgentRunnerOverviewView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = AgentRunnerOverviewSerializer

    def get(self, request, *args, **kwargs):
        payload = build_agent_runner_overview_payload(getattr(request, "request_id", ""))
        return Response(payload, status=status.HTTP_200_OK)


class ContractWorkbenchView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = ContractWorkbenchSerializer

    def get(self, request, *args, **kwargs):
        payload = build_contract_workbench_payload(getattr(request, "request_id", ""))
        return Response(payload, status=status.HTTP_200_OK)


def healthcheck(request):
    payload, http_status = build_healthcheck_payload(getattr(request, "request_id", ""))
    return JsonResponse(payload, status=http_status)


def check_database():
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return {"status": "ok", "detail": connection.vendor}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


def check_cache():
    cache_key = f"healthcheck:{uuid.uuid4()}"
    try:
        cache.set(cache_key, "ok", timeout=5)
        cached_value = cache.get(cache_key)
        cache.delete(cache_key)
        if cached_value != "ok":
            raise RuntimeError("Cache round-trip verification failed.")
        return {"status": "ok", "detail": cache.__class__.__name__}
    except Exception as exc:
        return {"status": "error", "detail": str(exc)}


def build_healthcheck_payload(request_id: str):
    database_check = check_database()
    cache_check = check_cache()
    overall_status = "ok"
    http_status = status.HTTP_200_OK

    if database_check["status"] != "ok" or cache_check["status"] != "ok":
        overall_status = "degraded"
        http_status = status.HTTP_503_SERVICE_UNAVAILABLE

    payload = {
        "status": overall_status,
        "request_id": request_id,
        "checks": {
            "database": database_check,
            "cache": cache_check,
        },
        "features": {
            "agent_ingest_enabled": settings.AGENT_INGEST_ENABLED,
            "automation_agent_claim_enabled": settings.AUTOMATION_AGENT_CLAIM_ENABLED,
            "automation_agent_report_enabled": settings.AUTOMATION_AGENT_REPORT_ENABLED,
        },
    }
    return payload, http_status


def build_overview_summary_payload(request_id: str):
    now = timezone.now()
    last_24h = now - timedelta(hours=24)

    server_queryset = Server.objects.all()
    job_queryset = Job.objects.all()
    audit_queryset = AuditLog.objects.all()

    payload = {
        "status": "ok",
        "request_id": request_id,
        "summary": {
            "servers": {
                "total": server_queryset.count(),
                "online": server_queryset.filter(lifecycle_status=ServerLifecycleStatus.ONLINE).count(),
                "offline": server_queryset.filter(lifecycle_status=ServerLifecycleStatus.OFFLINE).count(),
                "maintenance": server_queryset.filter(lifecycle_status=ServerLifecycleStatus.MAINTENANCE).count(),
                "pre_allocated": server_queryset.filter(lifecycle_status=ServerLifecycleStatus.PRE_ALLOCATED).count(),
            },
            "automation": {
                "total": job_queryset.count(),
                "draft": job_queryset.filter(status=JobExecutionStatus.DRAFT).count(),
                "awaiting_approval": job_queryset.filter(status=JobExecutionStatus.AWAITING_APPROVAL).count(),
                "ready": job_queryset.filter(status=JobExecutionStatus.READY).count(),
                "claimed": job_queryset.filter(status=JobExecutionStatus.CLAIMED).count(),
                "completed": job_queryset.filter(status=JobExecutionStatus.COMPLETED).count(),
                "failed": job_queryset.filter(status=JobExecutionStatus.FAILED).count(),
                "canceled": job_queryset.filter(status=JobExecutionStatus.CANCELED).count(),
                "high_risk_pending": job_queryset.filter(
                    risk_level=JobRiskLevel.HIGH,
                    approval_status=JobApprovalStatus.PENDING,
                ).count(),
            },
            "audit": {
                "total": audit_queryset.count(),
                "last_24h": audit_queryset.filter(created_at__gte=last_24h).count(),
                "security_events_last_24h": audit_queryset.filter(
                    created_at__gte=last_24h,
                    action__startswith="security.",
                ).count(),
            },
        },
    }
    return payload


def build_agent_runner_overview_payload(request_id: str):
    items = []
    items.extend(_build_agent_channel_items())
    items.extend(_build_claim_runner_items())
    items.extend(_build_report_runner_items())

    summary = {
        "total": len(items),
        "available": sum(1 for item in items if item["available"]),
        "unavailable": sum(1 for item in items if not item["available"]),
    }

    return {
        "status": "ok",
        "request_id": request_id,
        "summary": summary,
        "items": items,
    }


def _build_agent_channel_items():
    key_id = getattr(settings, "AGENT_INGEST_HMAC_KEY_ID", "").strip()
    secret = getattr(settings, "AGENT_INGEST_HMAC_SECRET", "").strip()
    if not key_id:
        return []

    latest_log = (
        AuditLog.objects.filter(action="server.agent_ingested", detail__agent_key_id=key_id)
        .order_by("-created_at", "-id")
        .first()
    )

    return [
        {
            "key_id": key_id,
            "channel": "server_ingest",
            "feature_enabled": settings.AGENT_INGEST_ENABLED,
            "configured": bool(secret),
            "available": settings.AGENT_INGEST_ENABLED and bool(secret),
            "active_jobs": 0,
            "last_seen_at": latest_log.created_at if latest_log else None,
            "last_status": _build_server_ingest_status(latest_log),
        }
    ]


def _build_claim_runner_items():
    return _build_runner_items(
        channel="automation_claim",
        feature_enabled=settings.AUTOMATION_AGENT_CLAIM_ENABLED,
        configured_keys=_resolve_agent_key_configs(
            getattr(settings, "AUTOMATION_AGENT_CLAIM_HMAC_KEYS", {}),
            getattr(settings, "AUTOMATION_AGENT_CLAIM_HMAC_KEY_ID", ""),
            getattr(settings, "AUTOMATION_AGENT_CLAIM_HMAC_SECRET", ""),
        ),
        audit_actions=["automation.job.agent_claimed"],
        active_jobs_by_key=_active_claim_counts(),
    )


def _build_report_runner_items():
    return _build_runner_items(
        channel="automation_report",
        feature_enabled=settings.AUTOMATION_AGENT_REPORT_ENABLED,
        configured_keys=_resolve_agent_key_configs(
            getattr(settings, "AUTOMATION_AGENT_REPORT_HMAC_KEYS", {}),
            getattr(settings, "AUTOMATION_AGENT_REPORT_HMAC_KEY_ID", ""),
            getattr(settings, "AUTOMATION_AGENT_REPORT_HMAC_SECRET", ""),
        ),
        audit_actions=["automation.job.agent_reported_completed", "automation.job.agent_reported_failed"],
        active_jobs_by_key=_active_report_counts(),
    )


def _build_runner_items(channel: str, feature_enabled: bool, configured_keys: dict[str, bool], audit_actions: list[str], active_jobs_by_key: dict[str, int]):
    items = []
    for key_id, is_configured in configured_keys.items():
        latest_log = (
            AuditLog.objects.filter(action__in=audit_actions, detail__agent_key_id=key_id)
            .order_by("-created_at", "-id")
            .first()
        )
        items.append(
            {
                "key_id": key_id,
                "channel": channel,
                "feature_enabled": feature_enabled,
                "configured": is_configured,
                "available": feature_enabled and is_configured,
                "active_jobs": active_jobs_by_key.get(key_id, 0),
                "last_seen_at": latest_log.created_at if latest_log else None,
                "last_status": _build_runner_status(latest_log),
            }
        )
    return items


def _resolve_agent_key_configs(configured_map: dict[str, str] | None, fallback_key_id: str, fallback_secret: str):
    normalized = {
        key_id.strip(): bool(secret.strip())
        for key_id, secret in (configured_map or {}).items()
        if key_id.strip()
    }
    if normalized:
        return normalized
    fallback_key_id = fallback_key_id.strip()
    if fallback_key_id:
        normalized[fallback_key_id] = bool(fallback_secret.strip())
    return normalized


def _active_claim_counts():
    rows = (
        Job.objects.filter(status=JobExecutionStatus.CLAIMED)
        .exclude(assigned_agent_key_id="")
        .values("assigned_agent_key_id")
    )
    counts = {}
    for row in rows:
        key_id = row["assigned_agent_key_id"]
        counts[key_id] = counts.get(key_id, 0) + 1
    return counts


def _active_report_counts():
    rows = (
        Job.objects.exclude(last_reported_by_agent_key="")
        .values("last_reported_by_agent_key")
    )
    counts = {}
    for row in rows:
        key_id = row["last_reported_by_agent_key"]
        counts[key_id] = counts.get(key_id, 0) + 1
    return counts


def _build_server_ingest_status(latest_log: AuditLog | None):
    if latest_log is None:
        return ""
    result = latest_log.detail.get("result", "")
    if result:
        return f"ingested_{result}"
    return "ingested"


def _build_runner_status(latest_log: AuditLog | None):
    if latest_log is None:
        return ""
    if latest_log.action.endswith("agent_claimed"):
        return "claimed"
    if latest_log.action.endswith("agent_reported_completed"):
        return "reported_completed"
    if latest_log.action.endswith("agent_reported_failed"):
        return "reported_failed"
    return latest_log.action.rsplit(".", 1)[-1]


def build_contract_workbench_payload(request_id: str):
    docs = {
        "schema_path": reverse("schema"),
        "swagger_path": reverse("swagger-ui"),
        "redoc_path": reverse("redoc"),
    }
    endpoint_groups, sensitive_items = _build_contract_endpoint_groups()
    auth_count = next((len(group["items"]) for group in endpoint_groups if group["label"] == "认证"), 0)
    user_count = next((len(group["items"]) for group in endpoint_groups if group["label"] == "用户"), 0)
    cmdb_count = next((len(group["items"]) for group in endpoint_groups if group["label"] == "CMDB"), 0)
    audit_count = next((len(group["items"]) for group in endpoint_groups if group["label"] == "审计"), 0)
    automation_count = next((len(group["items"]) for group in endpoint_groups if group["label"] == "自动化"), 0)
    collaboration_count = next((len(group["items"]) for group in endpoint_groups if group["label"] == "平台协作"), 0)

    return {
        "status": "ok",
        "request_id": request_id,
        "docs": docs,
        "highlights": [
            {
                "title": "文档入口",
                "body": f"Schema、Swagger 与 Redoc 已按当前项目路由注册，入口分别为 {docs['schema_path']}、{docs['swagger_path']}、{docs['redoc_path']}",
            },
            {
                "title": "认证与用户",
                "body": f"已发现 {auth_count} 条认证接口与 {user_count} 条用户管理接口，均来自当前运行中的真实路由",
            },
            {
                "title": "CMDB 与审计",
                "body": f"当前 CMDB 路由 {cmdb_count} 条，审计路由 {audit_count} 条，支持列表、详情、工具查询与导出能力",
            },
            {
                "title": "自动化能力",
                "body": f"当前自动化路由 {automation_count} 条，已包含 handoff、timeline、comments、审批动作与执行动作",
            },
            {
                "title": "平台协作",
                "body": f"当前平台协作路由 {collaboration_count} 条，覆盖健康检查、总览摘要、执行器通道与契约工作台",
            },
            {
                "title": "权限敏感路由",
                "body": f"已从真实视图权限中识别出 {len(sensitive_items)} 条角色敏感路由，可直接用于联调边界核对",
            },
        ],
        "endpoint_groups": endpoint_groups + [{"label": "权限敏感路由", "items": sensitive_items}],
    }


def _build_contract_endpoint_groups():
    from config.api import urlpatterns

    grouped_items: dict[str, list[str]] = {
        "认证": [],
        "用户": [],
        "CMDB": [],
        "审计": [],
        "自动化": [],
        "平台协作": [],
    }
    sensitive_items: list[str] = []

    for endpoint in _collect_api_endpoints(urlpatterns):
        category = _categorize_contract_endpoint(endpoint["path"])
        if not category:
            continue

        rendered = f"{endpoint['method']} {endpoint['path']}"
        permission_label = endpoint["permission"]
        if permission_label not in {"anonymous", "authenticated"}:
            sensitive_items.append(f"{rendered}  ({permission_label})")

        grouped_items[category].append(rendered)

    endpoint_groups = []
    for label, items in grouped_items.items():
        if items:
            endpoint_groups.append({"label": label, "items": sorted(dict.fromkeys(items))})

    return endpoint_groups, sorted(dict.fromkeys(sensitive_items))


def _collect_api_endpoints(patterns, prefix="/api/v1/"):
    items = []
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            items.extend(_collect_api_endpoints(pattern.url_patterns, prefix + _normalize_route_pattern(str(pattern.pattern))))
            continue
        if not isinstance(pattern, URLPattern):
            continue
        if "format" in str(pattern.pattern):
            continue
        callback_cls = getattr(pattern.callback, "cls", None)
        if callback_cls is None or callback_cls.__name__ == "APIRootView":
            continue

        path = prefix + _normalize_route_pattern(str(pattern.pattern))
        methods = _resolve_pattern_methods(pattern)
        permission = _resolve_permission_label(pattern, methods)
        for method in methods:
            items.append({"path": _normalize_full_api_path(path), "method": method, "permission": permission})
    return items


def _normalize_route_pattern(raw: str):
    import re

    cleaned = re.sub(r"^\^", "", raw)
    cleaned = re.sub(r"\$$", "", cleaned)
    cleaned = cleaned.replace("\\", "")
    cleaned = re.sub(r"\(\?P<([a-zA-Z_][a-zA-Z0-9_]*)>\[\^/\.\]\+\)", r"{\1}", cleaned)
    cleaned = cleaned.replace("{pk}", "{id}")
    cleaned = cleaned.replace(".?", "")
    return cleaned


def _normalize_full_api_path(path: str):
    normalized = path.replace("//", "/")
    if not normalized.startswith("/"):
        normalized = f"/{normalized}"
    if not normalized.endswith("/"):
        normalized = f"{normalized}/"
    return normalized


def _resolve_pattern_methods(pattern: URLPattern):
    actions = getattr(pattern.callback, "actions", None)
    if actions:
        return sorted({method.upper() for method in actions.keys()})

    callback_cls = getattr(pattern.callback, "cls", None)
    methods = []
    for method in ("get", "post", "put", "patch", "delete"):
        if callback_cls and callable(getattr(callback_cls, method, None)):
            methods.append(method.upper())
    return methods or ["GET"]


def _resolve_permission_label(pattern: URLPattern, methods: list[str]):
    callback_cls = getattr(pattern.callback, "cls", None)
    if callback_cls is None:
        return "authenticated"

    actions = getattr(pattern.callback, "actions", None)
    action_name = next(iter(actions.values())) if actions else None
    view = callback_cls()
    if action_name:
        view.action = action_name

    if hasattr(view, "get_permissions"):
        permission_instances = view.get_permissions()
        permission_names = [permission.__class__.__name__ for permission in permission_instances]
    else:
        permission_names = [permission.__name__ for permission in getattr(callback_cls, "permission_classes", [])]

    if "AllowAny" in permission_names:
        return "anonymous"
    if "IsPlatformAdmin" in permission_names:
        return "platform_admin"
    if "IsAuditorOrPlatformAdmin" in permission_names:
        return "auditor | platform_admin"
    if "IsApproverOrPlatformAdmin" in permission_names:
        return "approver | platform_admin"
    if "IsOpsOrPlatformAdmin" in permission_names:
        return "ops_admin | platform_admin"
    if "IsAuthenticatedReadOnlyOrOps" in permission_names:
        if any(method in {"POST", "PUT", "PATCH", "DELETE"} for method in methods):
            return "ops_admin | platform_admin"
        return "authenticated"
    if "IsAuthenticated" in permission_names:
        return "authenticated"
    return "authenticated"


def _categorize_contract_endpoint(path: str):
    if path.startswith("/api/v1/auth/"):
        return "认证"
    if path.startswith("/api/v1/users/"):
        return "用户"
    if path.startswith("/api/v1/cmdb/"):
        return "CMDB"
    if path.startswith("/api/v1/audit/"):
        return "审计"
    if path.startswith("/api/v1/automation/"):
        return "自动化"
    if path in {
        "/api/v1/health/",
        "/api/v1/overview/summary/",
        "/api/v1/agents/runners/",
        "/api/v1/contract/workbench/",
    }:
        return "平台协作"
    return None
