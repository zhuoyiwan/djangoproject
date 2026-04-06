import uuid
from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from audit.models import AuditLog
from automation.models import Job, JobApprovalStatus, JobExecutionStatus, JobRiskLevel
from cmdb.models import Server, ServerLifecycleStatus

from .serializers import AgentRunnerOverviewSerializer, HealthcheckSerializer, OverviewSummarySerializer


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
