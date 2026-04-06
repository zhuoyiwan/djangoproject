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

from .serializers import HealthcheckSerializer, OverviewSummarySerializer


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
