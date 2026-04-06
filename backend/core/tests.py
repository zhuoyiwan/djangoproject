from unittest.mock import patch
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from audit.models import AuditLog
from automation.models import Job, JobApprovalStatus, JobExecutionStatus, JobRiskLevel
from cmdb.models import IDC, EnvironmentType, Server, ServerLifecycleStatus

from config.settings.base import require_strong_jwt_signing_key


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "core-healthcheck-tests",
        }
    }
)
class HealthcheckTests(TestCase):
    def test_healthcheck(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertIn("request_id", response.json())
        self.assertIn("checks", response.json())
        self.assertIn("database", response.json()["checks"])
        self.assertIn("cache", response.json()["checks"])
        self.assertIn("features", response.json())
        self.assertIn("X-Request-ID", response.headers)

    @patch("core.views.check_database")
    def test_healthcheck_returns_503_when_database_check_fails(self, mock_check_database):
        mock_check_database.return_value = {"status": "error", "detail": "db down"}
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["status"], "degraded")
        self.assertEqual(response.json()["checks"]["database"]["detail"], "db down")

    @patch("core.views.check_cache")
    def test_healthcheck_returns_503_when_cache_check_fails(self, mock_check_cache):
        mock_check_cache.return_value = {"status": "error", "detail": "cache down"}
        response = self.client.get("/api/v1/health/")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["status"], "degraded")
        self.assertEqual(response.json()["checks"]["cache"]["detail"], "cache down")


class JwtSigningKeyValidationTests(TestCase):
    def test_allows_debug_fallback(self):
        self.assertEqual(require_strong_jwt_signing_key("change-me", "change-me", debug=True), "change-me")

    def test_rejects_default_signing_key_when_debug_disabled(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "JWT_SIGNING_KEY must be set to a strong non-default value when DEBUG is False.",
        ):
            require_strong_jwt_signing_key("change-me", "change-me", debug=False)

    def test_rejects_reusing_django_secret_key_when_debug_disabled(self):
        with self.assertRaisesMessage(
            ImproperlyConfigured,
            "JWT_SIGNING_KEY must not reuse DJANGO_SECRET_KEY when DEBUG is False.",
        ):
            require_strong_jwt_signing_key("separate-secret", "separate-secret", debug=False)

    def test_accepts_distinct_non_default_signing_key_when_debug_disabled(self):
        self.assertEqual(
            require_strong_jwt_signing_key("django-secret", "jwt-secret", debug=False),
            "jwt-secret",
        )


class OverviewSummaryApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(get_user_model().objects.create_user(username="overview", password="password123"))
        self.idc = IDC.objects.create(code="HZ-A", name="Hangzhou-A")

    def test_overview_summary_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/v1/overview/summary/")
        self.assertEqual(response.status_code, 401)

    def test_overview_summary_returns_aggregated_counts(self):
        Server.objects.create(
            hostname="ops-web-01",
            internal_ip="10.0.0.10",
            os_version="Ubuntu 22.04",
            cpu_cores=4,
            memory_gb="16.00",
            lifecycle_status=ServerLifecycleStatus.ONLINE,
            environment=EnvironmentType.PROD,
            idc=self.idc,
        )
        Server.objects.create(
            hostname="ops-job-01",
            internal_ip="10.0.0.11",
            os_version="Ubuntu 22.04",
            cpu_cores=8,
            memory_gb="32.00",
            lifecycle_status=ServerLifecycleStatus.MAINTENANCE,
            environment=EnvironmentType.TEST,
            idc=self.idc,
        )
        Job.objects.create(
            name="deploy-prod",
            status=JobExecutionStatus.AWAITING_APPROVAL,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.PENDING,
        )
        Job.objects.create(
            name="rotate-log",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        AuditLog.objects.create(action="security.auth.failed", target="GET /api/v1/auth/me/")
        AuditLog.objects.create(action="automation.job.created", target="job:1:deploy-prod")
        stale_log = AuditLog.objects.create(action="security.permission.denied", target="GET /api/v1/users/")
        AuditLog.objects.filter(id=stale_log.id).update(created_at=timezone.now() - timedelta(days=2))

        response = self.client.get("/api/v1/overview/summary/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["summary"]["servers"]["total"], 2)
        self.assertEqual(payload["summary"]["servers"]["online"], 1)
        self.assertEqual(payload["summary"]["servers"]["maintenance"], 1)
        self.assertEqual(payload["summary"]["automation"]["total"], 2)
        self.assertEqual(payload["summary"]["automation"]["awaiting_approval"], 1)
        self.assertEqual(payload["summary"]["automation"]["ready"], 1)
        self.assertEqual(payload["summary"]["automation"]["high_risk_pending"], 1)
        self.assertEqual(payload["summary"]["audit"]["total"], 3)
        self.assertEqual(payload["summary"]["audit"]["last_24h"], 2)
        self.assertEqual(payload["summary"]["audit"]["security_events_last_24h"], 1)
