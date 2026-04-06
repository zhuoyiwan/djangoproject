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


class AgentRunnerOverviewApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="runner-admin", password="password123")
        self.client.force_authenticate(self.user)

    def test_agent_runner_overview_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/v1/agents/runners/")
        self.assertEqual(response.status_code, 401)

    @override_settings(
        AGENT_INGEST_ENABLED=True,
        AGENT_INGEST_HMAC_KEY_ID="agent-default",
        AGENT_INGEST_HMAC_SECRET="agent-secret",
        AUTOMATION_AGENT_CLAIM_ENABLED=True,
        AUTOMATION_AGENT_CLAIM_HMAC_KEYS={
            "runner-blue": "claim-blue-secret",
            "runner-red": "claim-red-secret",
        },
        AUTOMATION_AGENT_REPORT_ENABLED=True,
        AUTOMATION_AGENT_REPORT_HMAC_KEYS={
            "runner-blue": "report-blue-secret",
            "runner-green": "report-green-secret",
        },
    )
    def test_agent_runner_overview_returns_configured_keys_and_recent_activity(self):
        ingest_log = AuditLog.objects.create(
            action="server.agent_ingested",
            target="ops-web-01@10.0.0.10",
            detail={"agent_key_id": "agent-default", "result": "updated"},
        )
        claim_log = AuditLog.objects.create(
            action="automation.job.agent_claimed",
            target="job:1:deploy-prod",
            detail={"agent_key_id": "runner-blue", "status": JobExecutionStatus.CLAIMED},
        )
        report_log = AuditLog.objects.create(
            action="automation.job.agent_reported_failed",
            target="job:2:rotate-log",
            detail={"agent_key_id": "runner-green", "status": JobExecutionStatus.FAILED},
        )

        Job.objects.create(
            name="blue-running-job",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.MEDIUM,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            assigned_agent_key_id="runner-blue",
        )
        Job.objects.create(
            name="green-reported-job",
            status=JobExecutionStatus.FAILED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            last_reported_by_agent_key="runner-green",
        )

        response = self.client.get("/api/v1/agents/runners/")
        self.assertEqual(response.status_code, 200)

        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["summary"]["total"], 5)
        self.assertEqual(payload["summary"]["available"], 5)
        self.assertEqual(payload["summary"]["unavailable"], 0)

        items = {(item["channel"], item["key_id"]): item for item in payload["items"]}

        ingest_item = items[("server_ingest", "agent-default")]
        self.assertTrue(ingest_item["available"])
        self.assertEqual(ingest_item["last_status"], "ingested_updated")
        self.assertEqual(ingest_item["last_seen_at"], ingest_log.created_at.isoformat().replace("+00:00", "Z"))

        claim_item = items[("automation_claim", "runner-blue")]
        self.assertEqual(claim_item["active_jobs"], 1)
        self.assertEqual(claim_item["last_status"], "claimed")
        self.assertEqual(claim_item["last_seen_at"], claim_log.created_at.isoformat().replace("+00:00", "Z"))

        report_item = items[("automation_report", "runner-green")]
        self.assertEqual(report_item["active_jobs"], 1)
        self.assertEqual(report_item["last_status"], "reported_failed")
        self.assertEqual(report_item["last_seen_at"], report_log.created_at.isoformat().replace("+00:00", "Z"))

        idle_item = items[("automation_report", "runner-blue")]
        self.assertEqual(idle_item["active_jobs"], 0)
        self.assertIsNone(idle_item["last_seen_at"])
        self.assertEqual(idle_item["last_status"], "")


class ContractWorkbenchApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="contract-user", password="password123")
        self.client.force_authenticate(self.user)

    def test_contract_workbench_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.get("/api/v1/contract/workbench/")
        self.assertEqual(response.status_code, 401)

    def test_contract_workbench_returns_docs_highlights_and_groups(self):
        response = self.client.get("/api/v1/contract/workbench/")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["docs"]["schema_path"], "/api/schema/")
        self.assertEqual(payload["docs"]["swagger_path"], "/api/docs/")
        self.assertEqual(payload["docs"]["redoc_path"], "/api/redoc/")
        self.assertTrue(any(item["title"] == "文档入口" for item in payload["highlights"]))
        self.assertTrue(any(item["title"] == "权限敏感路由" for item in payload["highlights"]))
        self.assertTrue(any(group["label"] == "自动化" for group in payload["endpoint_groups"]))
        self.assertTrue(any(group["label"] == "认证" for group in payload["endpoint_groups"]))
        self.assertTrue(any(group["label"] == "权限敏感路由" for group in payload["endpoint_groups"]))
        automation_group = next(group for group in payload["endpoint_groups"] if group["label"] == "自动化")
        auth_group = next(group for group in payload["endpoint_groups"] if group["label"] == "认证")
        sensitive_group = next(group for group in payload["endpoint_groups"] if group["label"] == "权限敏感路由")
        self.assertIn("GET /api/v1/automation/jobs/{id}/timeline/", automation_group["items"])
        self.assertIn("POST /api/v1/automation/jobs/bulk-requeue/", automation_group["items"])
        self.assertIn("POST /api/v1/auth/login/", auth_group["items"])
        self.assertTrue(any("/api/v1/users/" in item for item in sensitive_group["items"]))
