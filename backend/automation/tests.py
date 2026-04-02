import hashlib
import hmac
import json
import time

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from audit.models import AuditLog
from core.permissions import ROLE_APPROVER, ROLE_OPS_ADMIN, ROLE_PLATFORM_ADMIN

from .adapters import build_job_handoff_response
from .models import Job, JobApprovalStatus, JobExecutionStatus, JobRiskLevel


TEST_AGENT_KEYS = {
    "automation-agent-default": "automation-agent-secret-for-tests",
    "automation-agent-blue": "automation-agent-blue-secret-for-tests",
}


class JobModelTests(TestCase):
    def test_string_representation(self):
        job = Job(name="sync-assets")
        self.assertEqual(str(job), "sync-assets")


class JobHandoffAdapterTests(TestCase):
    def test_build_job_handoff_response_returns_normalized_adapter_shape(self):
        user = get_user_model().objects.create_user(username="alice", password="password123")
        job = Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            ready_by=user,
            payload={"target": "prod"},
        )
        request = Request(APIRequestFactory().get("/api/v1/automation/jobs/handoff/?status=ready&limit=5"))
        request.request_id = "req-123"

        response = build_job_handoff_response(request, [job], {"status": JobExecutionStatus.READY, "limit": 5})

        self.assertTrue(response.data["ok"])
        self.assertEqual(response.data["request_id"], "req-123")
        self.assertEqual(response.data["query"]["status"], JobExecutionStatus.READY)
        self.assertEqual(response.data["summary"]["count"], 1)
        self.assertEqual(response.data["summary"]["returned"], 1)
        self.assertFalse(response.data["summary"]["truncated"])
        self.assertEqual(response.data["items"][0]["id"], job.id)
        self.assertEqual(response.data["items"][0]["ready_by_username"], "alice")
        self.assertEqual(response.data["items"][0]["payload"], {"target": "prod"})


@override_settings(
    AUTOMATION_AGENT_CLAIM_ENABLED=True,
    AUTOMATION_AGENT_CLAIM_HMAC_KEY_ID="automation-agent-default",
    AUTOMATION_AGENT_CLAIM_HMAC_SECRET="automation-agent-secret-for-tests",
    AUTOMATION_AGENT_CLAIM_HMAC_KEYS=TEST_AGENT_KEYS,
    AUTOMATION_AGENT_CLAIM_TIMESTAMP_TOLERANCE_SECONDS=300,
    AUTOMATION_AGENT_REPORT_ENABLED=True,
    AUTOMATION_AGENT_REPORT_HMAC_KEY_ID="automation-agent-default",
    AUTOMATION_AGENT_REPORT_HMAC_SECRET="automation-agent-secret-for-tests",
    AUTOMATION_AGENT_REPORT_HMAC_KEYS=TEST_AGENT_KEYS,
    AUTOMATION_AGENT_REPORT_TIMESTAMP_TOLERANCE_SECONDS=300,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "automation-job-api-tests",
        }
    }
)
class JobApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="alice", password="password123")
        self.approver = get_user_model().objects.create_user(username="bob", password="password123")
        self.other_ops = get_user_model().objects.create_user(username="carol", password="password123")
        self.platform_admin = get_user_model().objects.create_user(username="dave", password="password123")
        self.client.force_authenticate(self.user)

    def _agent_signed_headers(self, job_id, payload, path_suffix, timestamp=None, key_id="automation-agent-default", secret=None):
        secret = secret or TEST_AGENT_KEYS.get(key_id, "automation-agent-secret-for-tests")
        ts = str(timestamp or int(time.time()))
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        body_hash = hashlib.sha256(body).hexdigest()
        canonical = f"POST\n/api/v1/automation/jobs/{job_id}/{path_suffix}/\n{ts}\n{body_hash}"
        signature = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
        return {
            "HTTP_X_AGENT_KEY_ID": key_id,
            "HTTP_X_AGENT_TIMESTAMP": ts,
            "HTTP_X_AGENT_SIGNATURE": f"sha256={signature}",
            "content_type": "application/json",
        }, body

    def _agent_claim_signed_headers(self, job_id, payload, timestamp=None, key_id="automation-agent-default", secret=None):
        return self._agent_signed_headers(job_id, payload, "agent-claim", timestamp=timestamp, key_id=key_id, secret=secret)

    def _agent_report_signed_headers(self, job_id, payload, timestamp=None, key_id="automation-agent-default", secret=None):
        return self._agent_signed_headers(job_id, payload, "agent-report", timestamp=timestamp, key_id=key_id, secret=secret)

    def test_list_jobs(self):
        Job.objects.create(name="sync-assets")
        response = self.client.get("/api/v1/automation/jobs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_unauthenticated_user_cannot_list_jobs(self):
        Job.objects.create(name="sync-assets")
        self.client.force_authenticate(user=None)

        response = self.client.get("/api/v1/automation/jobs/")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

    def test_non_ops_cannot_create_job(self):
        response = self.client.post(
            "/api/v1/automation/jobs/",
            {"name": "sync-assets", "status": "pending", "risk_level": JobRiskLevel.LOW, "payload": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_ops_admin_can_create_low_risk_job_without_approval(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        response = self.client.post(
            "/api/v1/automation/jobs/",
            {"name": "sync-assets", "status": JobExecutionStatus.DRAFT, "risk_level": JobRiskLevel.LOW, "payload": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.NOT_REQUIRED)
        self.assertEqual(response.data["risk_level"], JobRiskLevel.LOW)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)

    def test_ops_admin_can_create_high_risk_job_pending_approval(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        response = self.client.post(
            "/api/v1/automation/jobs/",
            {"name": "restart-prod", "status": JobExecutionStatus.DRAFT, "risk_level": JobRiskLevel.HIGH, "payload": {"target": "prod"}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.PENDING)
        self.assertEqual(response.data["approval_requested_by"], self.user.id)
        self.assertEqual(response.data["status"], JobExecutionStatus.AWAITING_APPROVAL)

    def test_non_approver_cannot_approve_job(self):
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/approve/", {"comment": "ok"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_approver_can_approve_pending_high_risk_job(self):
        Group.objects.create(name=ROLE_OPS_ADMIN)
        self.approver.groups.add(Group.objects.create(name=ROLE_APPROVER))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-123"},
            completed_at=timezone.now(),
            failed_at=timezone.now(),
            last_reported_by_agent_key="stale-agent",
        )
        self.client.force_authenticate(self.approver)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/approve/", {"comment": "approved"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.APPROVED)
        self.assertEqual(response.data["approved_by"], self.approver.id)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)
        self.assertEqual(response.data["approval_comment"], "approved")
        self.assertIsNotNone(response.data["approved_at"])
        self.assertIsNone(response.data["rejected_by"])
        self.assertIsNone(response.data["rejected_at"])

        job.refresh_from_db()
        self.assertEqual(job.approval_comment, "approved")
        self.assertEqual(job.approved_by_id, self.approver.id)
        self.assertIsNotNone(job.approved_at)
        self.assertIsNone(job.rejected_by_id)
        self.assertIsNone(job.rejected_at)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertIsNone(job.completed_at)
        self.assertIsNone(job.failed_at)
        self.assertEqual(job.assigned_agent_key_id, "")
        self.assertEqual(job.last_reported_by_agent_key, "")

        audit = AuditLog.objects.get(action="automation.job.approved")
        self.assertEqual(audit.actor_id, self.approver.id)
        self.assertEqual(audit.detail["approved_by"], self.approver.id)
        self.assertEqual(audit.detail["approval_comment"], "approved")
        self.assertIn("request_id", audit.detail)

    def test_approver_can_reject_pending_high_risk_job(self):
        self.approver.groups.add(Group.objects.create(name=ROLE_APPROVER))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-456"},
            completed_at=timezone.now(),
            failed_at=timezone.now(),
            last_reported_by_agent_key="stale-agent",
        )
        self.client.force_authenticate(self.approver)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/reject/", {"comment": "missing change window"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.REJECTED)
        self.assertEqual(response.data["rejected_by"], self.approver.id)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)
        self.assertEqual(response.data["approval_comment"], "missing change window")
        self.assertIsNotNone(response.data["rejected_at"])
        self.assertIsNone(response.data["approved_by"])
        self.assertIsNone(response.data["approved_at"])

        job.refresh_from_db()
        self.assertEqual(job.approval_comment, "missing change window")
        self.assertEqual(job.rejected_by_id, self.approver.id)
        self.assertIsNotNone(job.rejected_at)
        self.assertIsNone(job.approved_by_id)
        self.assertIsNone(job.approved_at)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertIsNone(job.completed_at)
        self.assertIsNone(job.failed_at)
        self.assertEqual(job.assigned_agent_key_id, "")
        self.assertEqual(job.last_reported_by_agent_key, "")

        audit = AuditLog.objects.get(action="automation.job.rejected")
        self.assertEqual(audit.actor_id, self.approver.id)
        self.assertEqual(audit.detail["rejected_by"], self.approver.id)
        self.assertEqual(audit.detail["approval_comment"], "missing change window")
        self.assertIn("request_id", audit.detail)

    def test_requester_cannot_self_approve(self):
        self.user.groups.add(Group.objects.create(name=ROLE_APPROVER))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/approve/", {"comment": "self-approve"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "forbidden")

    def test_requester_cannot_self_reject(self):
        self.user.groups.add(Group.objects.create(name=ROLE_APPROVER))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/reject/", {"comment": "self-reject"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "forbidden")

    def test_platform_admin_can_approve_pending_high_risk_job(self):
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/approve/", {"comment": "approved by platform"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.APPROVED)
        self.assertEqual(response.data["approved_by"], self.platform_admin.id)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)

    def test_platform_admin_can_reject_pending_high_risk_job(self):
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/reject/", {"comment": "rejected by platform"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.REJECTED)
        self.assertEqual(response.data["rejected_by"], self.platform_admin.id)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)

    def test_cannot_approve_non_pending_job(self):
        self.approver.groups.add(Group.objects.create(name=ROLE_APPROVER))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        self.client.force_authenticate(self.approver)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/approve/", {"comment": "ok"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_high_risk_job_writes_approval_audit_entries(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        response = self.client.post(
            "/api/v1/automation/jobs/",
            {"name": "restart-prod", "status": JobExecutionStatus.DRAFT, "risk_level": JobRiskLevel.HIGH, "payload": {"target": "prod"}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action="automation.job.created").exists())
        self.assertTrue(AuditLog.objects.filter(action="automation.job.approval_requested").exists())

    def test_updating_approved_high_risk_job_re_requests_approval_and_clears_execution_fields(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.APPROVED,
            approval_requested_by=self.user,
            approved_by=self.approver,
            ready_by=self.user,
            ready_at=timezone.now(),
            payload={"target": "prod"},
        )

        response = self.client.patch(
            f"/api/v1/automation/jobs/{job.id}/",
            {"payload": {"target": "prod", "window": "night"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.PENDING)
        self.assertEqual(response.data["status"], JobExecutionStatus.AWAITING_APPROVAL)
        self.assertEqual(response.data["approval_requested_by"], self.user.id)
        self.assertIsNone(response.data["approved_by"])
        self.assertIsNone(response.data["approved_at"])
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertIsNone(response.data["completed_at"])
        self.assertIsNone(response.data["failed_at"])
        self.assertEqual(response.data["last_reported_by_agent_key"], "")

        job.refresh_from_db()
        self.assertEqual(job.approval_status, JobApprovalStatus.PENDING)
        self.assertEqual(job.status, JobExecutionStatus.AWAITING_APPROVAL)
        self.assertEqual(job.approval_requested_by_id, self.user.id)
        self.assertIsNone(job.approved_by_id)
        self.assertIsNone(job.approved_at)
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertIsNone(job.completed_at)
        self.assertIsNone(job.failed_at)
        self.assertEqual(job.last_reported_by_agent_key, "")

        self.assertTrue(AuditLog.objects.filter(action="automation.job.updated").exists())
        self.assertTrue(AuditLog.objects.filter(action="automation.job.approval_requested").exists())

    def test_updating_job_to_low_risk_clears_approval_metadata(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        requested_at = timezone.now()
        approved_at = timezone.now()
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.APPROVED,
            approval_requested_by=self.user,
            approval_requested_at=requested_at,
            approved_by=self.approver,
            approved_at=approved_at,
            approval_comment="approved",
            payload={"target": "prod"},
        )

        response = self.client.patch(
            f"/api/v1/automation/jobs/{job.id}/",
            {"risk_level": JobRiskLevel.LOW},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["risk_level"], JobRiskLevel.LOW)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.NOT_REQUIRED)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)
        self.assertIsNone(response.data["approval_requested_by"])
        self.assertIsNone(response.data["approval_requested_at"])
        self.assertIsNone(response.data["approved_by"])
        self.assertIsNone(response.data["approved_at"])
        self.assertEqual(response.data["approval_comment"], "")

        job.refresh_from_db()
        self.assertEqual(job.risk_level, JobRiskLevel.LOW)
        self.assertEqual(job.approval_status, JobApprovalStatus.NOT_REQUIRED)
        self.assertEqual(job.status, JobExecutionStatus.DRAFT)
        self.assertIsNone(job.approval_requested_by_id)
        self.assertIsNone(job.approval_requested_at)
        self.assertIsNone(job.approved_by_id)
        self.assertIsNone(job.approved_at)
        self.assertEqual(job.approval_comment, "")

    def test_updating_completed_job_clears_execution_result_fields(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        completed_at = timezone.now()
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.COMPLETED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            execution_summary="completed by executor",
            execution_metadata={"run_id": "run-123"},
            completed_at=completed_at,
            last_reported_by_agent_key="automation-agent-default",
            payload={"target": "dev"},
        )

        response = self.client.patch(
            f"/api/v1/automation/jobs/{job.id}/",
            {"payload": {"target": "prod"}},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertIsNone(response.data["completed_at"])
        self.assertIsNone(response.data["failed_at"])
        self.assertEqual(response.data["last_reported_by_agent_key"], "")

        job.refresh_from_db()
        self.assertEqual(job.status, JobExecutionStatus.DRAFT)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertIsNone(job.completed_at)
        self.assertIsNone(job.failed_at)
        self.assertEqual(job.last_reported_by_agent_key, "")

    def test_tool_query_requires_at_least_one_filter(self):
        response = self.client.get("/api/v1/automation/jobs/tool-query/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_tool_query_returns_normalized_matches(self):
        Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            approved_by=self.approver,
        )
        Job.objects.create(
            name="sync-dev",
            status=JobExecutionStatus.DRAFT,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )

        response = self.client.get("/api/v1/automation/jobs/tool-query/?q=restart&limit=5")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["ok"])
        self.assertEqual(response.data["summary"]["count"], 1)
        self.assertEqual(response.data["summary"]["returned"], 1)
        self.assertFalse(response.data["summary"]["truncated"])
        self.assertEqual(response.data["query"]["q"], "restart")
        self.assertEqual(response.data["query"]["limit"], 5)
        self.assertEqual(response.data["items"][0]["name"], "restart-prod")
        self.assertEqual(response.data["items"][0]["approval_status"], JobApprovalStatus.APPROVED)
        self.assertEqual(response.data["items"][0]["approved_by_username"], "bob")

    def test_tool_query_supports_structured_filters(self):
        Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.AWAITING_APPROVAL,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        Job.objects.create(
            name="sync-assets",
            status=JobExecutionStatus.DRAFT,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )

        response = self.client.get("/api/v1/automation/jobs/tool-query/?risk_level=high&approval_status=pending")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["name"], "restart-prod")

    def test_tool_query_supports_assigned_agent_key_filter(self):
        matching_job = Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            assigned_agent_key_id="automation-agent-blue",
        )
        Job.objects.create(
            name="sync-assets",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            assigned_agent_key_id="automation-agent-default",
        )

        response = self.client.get("/api/v1/automation/jobs/tool-query/?assigned_agent_key_id=automation-agent-blue")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], matching_job.id)
        self.assertEqual(response.data["query"]["assigned_agent_key_id"], "automation-agent-blue")

    def test_tool_query_does_not_mark_exact_limit_as_truncated(self):
        Job.objects.create(
            name="restart-prod-1",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
        )
        Job.objects.create(
            name="restart-prod-2",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
        )

        response = self.client.get("/api/v1/automation/jobs/tool-query/?q=restart&limit=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["count"], 2)
        self.assertEqual(response.data["summary"]["returned"], 2)
        self.assertFalse(response.data["summary"]["truncated"])
        self.assertEqual(len(response.data["items"]), 2)

    def test_tool_query_marks_over_limit_as_truncated(self):
        Job.objects.create(
            name="restart-prod-1",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
        )
        Job.objects.create(
            name="restart-prod-2",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
        )
        Job.objects.create(
            name="restart-prod-3",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
        )

        response = self.client.get("/api/v1/automation/jobs/tool-query/?q=restart&limit=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["count"], 2)
        self.assertEqual(response.data["summary"]["returned"], 2)
        self.assertTrue(response.data["summary"]["truncated"])
        self.assertEqual(len(response.data["items"]), 2)

    def test_tool_query_is_throttled_after_rate_limit(self):
        Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
        )
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "tool_query": "2/min"}}):
            first = self.client.get("/api/v1/automation/jobs/tool-query/?q=restart")
            second = self.client.get("/api/v1/automation/jobs/tool-query/?q=restart")
            third = self.client.get("/api/v1/automation/jobs/tool-query/?q=restart")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_approve_is_throttled_after_approval_write_rate_limit(self):
        self.approver.groups.add(Group.objects.create(name=ROLE_APPROVER))
        first_job = Job.objects.create(
            name="restart-prod-1",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        second_job = Job.objects.create(
            name="restart-prod-2",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        third_job = Job.objects.create(
            name="restart-prod-3",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )

        self.client.force_authenticate(self.approver)
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "approval_write": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/approve/", {"comment": "ok"}, format="json")
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/approve/", {"comment": "ok"}, format="json")
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/approve/", {"comment": "ok"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_mark_ready_is_throttled_after_execution_write_rate_limit(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        first_job = Job.objects.create(
            name="sync-assets-1",
            status=JobExecutionStatus.DRAFT,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        second_job = Job.objects.create(
            name="sync-assets-2",
            status=JobExecutionStatus.DRAFT,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        third_job = Job.objects.create(
            name="sync-assets-3",
            status=JobExecutionStatus.DRAFT,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )

        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "execution_write": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/mark-ready/", {"comment": "ready"}, format="json")
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/mark-ready/", {"comment": "ready"}, format="json")
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/mark-ready/", {"comment": "ready"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_claim_is_throttled_after_execution_write_rate_limit(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        first_job = Job.objects.create(
            name="claim-job-1",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        second_job = Job.objects.create(
            name="claim-job-2",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        third_job = Job.objects.create(
            name="claim-job-3",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "execution_write": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/claim/", {"comment": "claim"}, format="json")
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/claim/", {"comment": "claim"}, format="json")
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/claim/", {"comment": "claim"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_complete_is_throttled_after_execution_write_rate_limit(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        first_job = Job.objects.create(
            name="complete-job-1",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        second_job = Job.objects.create(
            name="complete-job-2",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        third_job = Job.objects.create(
            name="complete-job-3",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )

        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "execution_write": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/complete/", {"comment": "done"}, format="json")
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/complete/", {"comment": "done"}, format="json")
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/complete/", {"comment": "done"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_fail_is_throttled_after_execution_write_rate_limit(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        first_job = Job.objects.create(
            name="fail-job-1",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        second_job = Job.objects.create(
            name="fail-job-2",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        third_job = Job.objects.create(
            name="fail-job-3",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )

        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "execution_write": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/fail/", {"comment": "error"}, format="json")
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/fail/", {"comment": "error"}, format="json")
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/fail/", {"comment": "error"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_cancel_is_throttled_after_execution_write_rate_limit(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        first_job = Job.objects.create(
            name="cancel-job-1",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        second_job = Job.objects.create(
            name="cancel-job-2",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        third_job = Job.objects.create(
            name="cancel-job-3",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "execution_write": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/cancel/", {"comment": "stop"}, format="json")
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/cancel/", {"comment": "stop"}, format="json")
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/cancel/", {"comment": "stop"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_handoff_requires_at_least_one_filter(self):
        response = self.client.get("/api/v1/automation/jobs/handoff/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_handoff_returns_ready_and_claimed_jobs(self):
        ready_job = Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            ready_by=self.user,
            payload={"target": "prod"},
        )
        claimed_job = Job.objects.create(
            name="sync-assets",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
            payload={"target": "dev"},
        )
        Job.objects.create(
            name="draft-job",
            status=JobExecutionStatus.DRAFT,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?status=ready&limit=5")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["ok"])
        self.assertEqual(response.data["summary"]["count"], 1)
        self.assertEqual(response.data["items"][0]["id"], ready_job.id)
        self.assertEqual(response.data["items"][0]["name"], "restart-prod")
        self.assertEqual(response.data["items"][0]["status"], JobExecutionStatus.READY)
        self.assertEqual(response.data["items"][0]["ready_by_username"], "alice")
        self.assertEqual(response.data["items"][0]["payload"], {"target": "prod"})
        self.assertNotEqual(response.data["items"][0]["id"], claimed_job.id)

    def test_handoff_supports_claimed_status_filter(self):
        Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            ready_by=self.user,
        )
        claimed_job = Job.objects.create(
            name="sync-assets",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?status=claimed")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], claimed_job.id)
        self.assertEqual(response.data["items"][0]["claimed_by_username"], "alice")

    def test_handoff_supports_risk_and_approval_filters(self):
        matching_job = Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            ready_by=self.user,
        )
        Job.objects.create(
            name="sync-assets",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        Job.objects.create(
            name="approved-draft",
            status=JobExecutionStatus.DRAFT,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?risk_level=high&approval_status=approved")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], matching_job.id)
        self.assertEqual(response.data["query"]["risk_level"], JobRiskLevel.HIGH)
        self.assertEqual(response.data["query"]["approval_status"], JobApprovalStatus.APPROVED)

    def test_handoff_supports_text_search_filters(self):
        matching_job = Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            ready_by=self.user,
        )
        Job.objects.create(
            name="sync-assets",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?q=restart")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], matching_job.id)
        self.assertEqual(response.data["query"]["q"], "restart")

    def test_handoff_supports_exact_name_filter(self):
        matching_job = Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            ready_by=self.user,
        )
        Job.objects.create(
            name="restart-dev",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            ready_by=self.user,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?name=restart-prod")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], matching_job.id)
        self.assertEqual(response.data["query"]["name"], "restart-prod")

    def test_handoff_supports_combined_status_and_risk_filters(self):
        matching_job = Job.objects.create(
            name="restart-prod",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            claimed_by=self.user,
        )
        Job.objects.create(
            name="sync-assets",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?status=claimed&risk_level=high")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], matching_job.id)
        self.assertEqual(response.data["query"]["status"], JobExecutionStatus.CLAIMED)
        self.assertEqual(response.data["query"]["risk_level"], JobRiskLevel.HIGH)

    def test_handoff_supports_assigned_agent_key_filter(self):
        Job.objects.create(
            name="ready-job",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        matching_job = Job.objects.create(
            name="claimed-blue",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            claimed_by=self.user,
            assigned_agent_key_id="automation-agent-blue",
        )
        Job.objects.create(
            name="claimed-default",
            status=JobExecutionStatus.CLAIMED,
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.APPROVED,
            claimed_by=self.user,
            assigned_agent_key_id="automation-agent-default",
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?assigned_agent_key_id=automation-agent-blue")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], matching_job.id)
        self.assertEqual(response.data["query"]["assigned_agent_key_id"], "automation-agent-blue")

    def test_handoff_does_not_mark_exact_limit_as_truncated(self):
        Job.objects.create(
            name="ready-job-1",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        Job.objects.create(
            name="ready-job-2",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?status=ready&limit=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["count"], 2)
        self.assertEqual(response.data["summary"]["returned"], 2)
        self.assertFalse(response.data["summary"]["truncated"])
        self.assertEqual(len(response.data["items"]), 2)

    def test_handoff_marks_over_limit_as_truncated(self):
        Job.objects.create(
            name="ready-job-1",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        Job.objects.create(
            name="ready-job-2",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        Job.objects.create(
            name="ready-job-3",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        response = self.client.get("/api/v1/automation/jobs/handoff/?status=ready&limit=2")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["summary"]["count"], 2)
        self.assertEqual(response.data["summary"]["returned"], 2)
        self.assertTrue(response.data["summary"]["truncated"])
        self.assertEqual(len(response.data["items"]), 2)

    def test_handoff_is_throttled_after_rate_limit(self):
        Job.objects.create(
            name="ready-job",
            status=JobExecutionStatus.READY,
            risk_level=JobRiskLevel.LOW,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "handoff": "2/min"}}):
            first = self.client.get("/api/v1/automation/jobs/handoff/?status=ready")
            second = self.client.get("/api/v1/automation/jobs/handoff/?status=ready")
            third = self.client.get("/api/v1/automation/jobs/handoff/?status=ready")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_ops_admin_can_mark_low_risk_job_ready(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/mark-ready/", {"comment": "ready"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.READY)
        self.assertEqual(response.data["ready_by"], self.user.id)
        self.assertIsNotNone(response.data["ready_at"])
        self.assertIsNone(response.data["claimed_by"])
        self.assertIsNone(response.data["claimed_at"])

        job.refresh_from_db()
        self.assertEqual(job.ready_by_id, self.user.id)
        self.assertIsNotNone(job.ready_at)
        self.assertIsNone(job.claimed_by_id)
        self.assertIsNone(job.claimed_at)

        audit = AuditLog.objects.get(action="automation.job.ready_marked")
        self.assertEqual(audit.actor_id, self.user.id)
        self.assertEqual(audit.detail["ready_by"], self.user.id)
        self.assertEqual(audit.detail["comment"], "ready")
        self.assertIn("request_id", audit.detail)

    def test_mark_ready_clears_stale_execution_result_fields(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-123"},
            completed_at=timezone.now(),
            failed_at=timezone.now(),
            last_reported_by_agent_key="automation-agent-default",
        )

        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/mark-ready/", {"comment": "ready"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.READY)
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertIsNone(response.data["completed_at"])
        self.assertIsNone(response.data["failed_at"])
        self.assertEqual(response.data["last_reported_by_agent_key"], "")

        job.refresh_from_db()
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertIsNone(job.completed_at)
        self.assertIsNone(job.failed_at)
        self.assertEqual(job.last_reported_by_agent_key, "")

    def test_cannot_mark_pending_high_risk_job_ready(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/mark-ready/", {"comment": "ready"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_ops_admin_can_mark_approved_high_risk_job_ready(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.APPROVED,
            approved_by=self.approver,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/mark-ready/", {"comment": "ready"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.READY)

    def test_non_ops_cannot_mark_ready(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/mark-ready/", {"comment": "ready"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_platform_admin_can_mark_low_risk_job_ready(self):
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )

        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/mark-ready/", {"comment": "ready"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.READY)
        self.assertEqual(response.data["ready_by"], self.platform_admin.id)

        audit = AuditLog.objects.get(action="automation.job.ready_marked")
        self.assertEqual(audit.actor_id, self.platform_admin.id)
        self.assertEqual(audit.detail["ready_by"], self.platform_admin.id)
        self.assertEqual(audit.detail["comment"], "ready")

    def test_non_ops_cannot_claim_ready_job(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/claim/", {"comment": "claim"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_ops_admin_can_claim_ready_job(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/claim/", {"comment": "claim"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CLAIMED)
        self.assertEqual(response.data["claimed_by"], self.user.id)
        self.assertEqual(response.data["assigned_agent_key_id"], "")
        self.assertIsNotNone(response.data["claimed_at"])

        job.refresh_from_db()
        self.assertEqual(job.claimed_by_id, self.user.id)
        self.assertEqual(job.assigned_agent_key_id, "")
        self.assertIsNotNone(job.claimed_at)

        audit = AuditLog.objects.get(action="automation.job.claimed")
        self.assertEqual(audit.actor_id, self.user.id)
        self.assertEqual(audit.detail["claimed_by"], self.user.id)
        self.assertEqual(audit.detail["assigned_agent_key_id"], "")
        self.assertEqual(audit.detail["comment"], "claim")
        self.assertIn("request_id", audit.detail)

    def test_platform_admin_can_claim_ready_job(self):
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/claim/", {"comment": "claim"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CLAIMED)
        self.assertEqual(response.data["claimed_by"], self.platform_admin.id)
        self.assertEqual(response.data["assigned_agent_key_id"], "")

        audit = AuditLog.objects.get(action="automation.job.claimed")
        self.assertEqual(audit.actor_id, self.platform_admin.id)
        self.assertEqual(audit.detail["claimed_by"], self.platform_admin.id)
        self.assertEqual(audit.detail["assigned_agent_key_id"], "")
        self.assertEqual(audit.detail["comment"], "claim")

    def test_claim_clears_ready_metadata(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        ready_at = timezone.now()
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
            ready_at=ready_at,
        )

        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/claim/", {"comment": "claim"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CLAIMED)
        self.assertEqual(response.data["claimed_by"], self.user.id)
        self.assertEqual(response.data["assigned_agent_key_id"], "")
        self.assertIsNotNone(response.data["claimed_at"])
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])

        job.refresh_from_db()
        self.assertEqual(job.claimed_by_id, self.user.id)
        self.assertEqual(job.assigned_agent_key_id, "")
        self.assertIsNotNone(job.claimed_at)
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)

    def test_cannot_claim_non_ready_job(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/claim/", {"comment": "claim"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_claimed_job_cannot_be_updated(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        response = self.client.patch(f"/api/v1/automation/jobs/{job.id}/", {"name": "sync-assets-2"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_claimed_job_cannot_be_deleted(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        response = self.client.delete(f"/api/v1/automation/jobs/{job.id}/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_ops_admin_can_complete_claimed_job(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/complete/", {"comment": "done"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.COMPLETED)
        self.assertIsNotNone(response.data["completed_at"])
        self.assertIsNone(response.data["failed_at"])

    def test_complete_clears_ready_claim_and_stale_execution_report_fields(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.other_ops,
            ready_at=timezone.now(),
            claimed_by=self.user,
            claimed_at=timezone.now(),
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-123"},
            failed_at=timezone.now(),
            last_reported_by_agent_key="automation-agent-default",
        )

        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/complete/", {"comment": "done"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.COMPLETED)
        self.assertIsNotNone(response.data["completed_at"])
        self.assertIsNone(response.data["failed_at"])
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])
        self.assertIsNone(response.data["claimed_by"])
        self.assertIsNone(response.data["claimed_at"])
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertEqual(response.data["last_reported_by_agent_key"], "")

        job.refresh_from_db()
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)
        self.assertIsNone(job.claimed_by_id)
        self.assertIsNone(job.claimed_at)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertEqual(job.last_reported_by_agent_key, "")

    def test_non_claimant_ops_admin_cannot_complete_claimed_job(self):
        ops_group = Group.objects.create(name=ROLE_OPS_ADMIN)
        self.other_ops.groups.add(ops_group)
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        self.client.force_authenticate(self.other_ops)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/complete/", {"comment": "done"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "forbidden")

    def test_platform_admin_can_complete_other_users_claimed_job(self):
        Group.objects.create(name=ROLE_OPS_ADMIN)
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/complete/", {"comment": "override"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.COMPLETED)

        audit = AuditLog.objects.get(action="automation.job.completed")
        self.assertEqual(audit.actor_id, self.platform_admin.id)
        self.assertEqual(audit.detail["claimed_by"], self.user.id)
        self.assertEqual(audit.detail["comment"], "override")
        self.assertIn("request_id", audit.detail)

    def test_ops_admin_can_fail_claimed_job(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/fail/", {"comment": "error"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.FAILED)
        self.assertIsNotNone(response.data["failed_at"])
        self.assertIsNone(response.data["completed_at"])

    def test_non_ops_cannot_fail_claimed_job(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/fail/", {"comment": "error"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_fail_clears_ready_claim_and_stale_execution_report_fields(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.other_ops,
            ready_at=timezone.now(),
            claimed_by=self.user,
            claimed_at=timezone.now(),
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-123"},
            completed_at=timezone.now(),
            last_reported_by_agent_key="automation-agent-default",
        )

        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/fail/", {"comment": "error"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.FAILED)
        self.assertIsNotNone(response.data["failed_at"])
        self.assertIsNone(response.data["completed_at"])
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])
        self.assertIsNone(response.data["claimed_by"])
        self.assertIsNone(response.data["claimed_at"])
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertEqual(response.data["last_reported_by_agent_key"], "")

        job.refresh_from_db()
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)
        self.assertIsNone(job.claimed_by_id)
        self.assertIsNone(job.claimed_at)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertEqual(job.last_reported_by_agent_key, "")

    def test_non_claimant_ops_admin_cannot_fail_claimed_job(self):
        ops_group = Group.objects.create(name=ROLE_OPS_ADMIN)
        self.other_ops.groups.add(ops_group)
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        self.client.force_authenticate(self.other_ops)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/fail/", {"comment": "error"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "forbidden")

    def test_platform_admin_can_fail_other_users_claimed_job(self):
        Group.objects.create(name=ROLE_OPS_ADMIN)
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/fail/", {"comment": "override"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.FAILED)

        audit = AuditLog.objects.get(action="automation.job.failed")
        self.assertEqual(audit.actor_id, self.platform_admin.id)
        self.assertEqual(audit.detail["claimed_by"], self.user.id)
        self.assertEqual(audit.detail["comment"], "override")
        self.assertIn("request_id", audit.detail)

    def test_ops_admin_can_cancel_ready_job(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/cancel/", {"comment": "stop"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CANCELED)

    def test_non_ops_cannot_cancel_ready_job(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/cancel/", {"comment": "stop"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_platform_admin_can_cancel_ready_job(self):
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/cancel/", {"comment": "stop"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CANCELED)

        audit = AuditLog.objects.get(action="automation.job.canceled")
        self.assertEqual(audit.actor_id, self.platform_admin.id)
        self.assertIsNone(audit.detail["claimed_by"])
        self.assertEqual(audit.detail["comment"], "stop")

    def test_cancel_clears_ready_claim_and_stale_execution_report_fields(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.other_ops,
            ready_at=timezone.now(),
            claimed_by=self.user,
            claimed_at=timezone.now(),
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-123"},
            completed_at=timezone.now(),
            failed_at=timezone.now(),
            last_reported_by_agent_key="automation-agent-default",
        )

        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/cancel/", {"comment": "stop"}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CANCELED)
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])
        self.assertIsNone(response.data["claimed_by"])
        self.assertIsNone(response.data["claimed_at"])
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertEqual(response.data["last_reported_by_agent_key"], "")

        job.refresh_from_db()
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)
        self.assertIsNone(job.claimed_by_id)
        self.assertIsNone(job.claimed_at)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertEqual(job.last_reported_by_agent_key, "")

    def test_non_ops_cannot_complete_claimed_job(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/complete/", {"comment": "done"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_complete_requires_claimed_status(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/complete/", {"comment": "done"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_non_claimant_ops_admin_cannot_cancel_claimed_job(self):
        ops_group = Group.objects.create(name=ROLE_OPS_ADMIN)
        self.other_ops.groups.add(ops_group)
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        self.client.force_authenticate(self.other_ops)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/cancel/", {"comment": "stop"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["error"]["code"], "forbidden")

    def test_platform_admin_can_cancel_other_users_claimed_job(self):
        Group.objects.create(name=ROLE_OPS_ADMIN)
        self.platform_admin.groups.add(Group.objects.create(name=ROLE_PLATFORM_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        self.client.force_authenticate(self.platform_admin)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/cancel/", {"comment": "override"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CANCELED)

        audit = AuditLog.objects.get(action="automation.job.canceled")
        self.assertEqual(audit.actor_id, self.platform_admin.id)
        self.assertEqual(audit.detail["claimed_by"], self.user.id)
        self.assertEqual(audit.detail["comment"], "override")
        self.assertIn("request_id", audit.detail)

    def test_cancel_requires_ready_or_claimed_status(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/cancel/", {"comment": "stop"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_mark_ready_and_claim_write_audit_entries(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        ready_job = Job.objects.create(
            name="ready-job",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.DRAFT,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
        )
        claim_job = Job.objects.create(
            name="claim-job",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        ready = self.client.post(f"/api/v1/automation/jobs/{ready_job.id}/mark-ready/", {"comment": "ready"}, format="json")
        self.assertEqual(ready.status_code, 200)
        claim = self.client.post(f"/api/v1/automation/jobs/{claim_job.id}/claim/", {"comment": "claim", "agent_key_id": "automation-agent-blue"}, format="json")
        self.assertEqual(claim.status_code, 200)
        claim_job.refresh_from_db()
        self.assertEqual(claim_job.assigned_agent_key_id, "automation-agent-blue")
        audit = AuditLog.objects.get(action="automation.job.claimed")
        self.assertEqual(audit.detail["assigned_agent_key_id"], "automation-agent-blue")
        self.assertTrue(AuditLog.objects.filter(action="automation.job.ready_marked").exists())

    def test_execution_terminal_actions_write_audit_entries(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        complete_job = Job.objects.create(
            name="complete-job",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        fail_job = Job.objects.create(
            name="fail-job",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        cancel_job = Job.objects.create(
            name="cancel-job",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        complete = self.client.post(f"/api/v1/automation/jobs/{complete_job.id}/complete/", {"comment": "done"}, format="json")
        self.assertEqual(complete.status_code, 200)
        fail = self.client.post(f"/api/v1/automation/jobs/{fail_job.id}/fail/", {"comment": "error"}, format="json")
        self.assertEqual(fail.status_code, 200)
        cancel = self.client.post(f"/api/v1/automation/jobs/{cancel_job.id}/cancel/", {"comment": "stop"}, format="json")
        self.assertEqual(cancel.status_code, 200)
        self.assertTrue(AuditLog.objects.filter(action="automation.job.completed").exists())
        self.assertTrue(AuditLog.objects.filter(action="automation.job.failed").exists())
        self.assertTrue(AuditLog.objects.filter(action="automation.job.canceled").exists())

    def test_agent_claim_claims_ready_job_and_binds_agent_key(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
            ready_at=timezone.now(),
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-123"},
            completed_at=timezone.now(),
            failed_at=timezone.now(),
            last_reported_by_agent_key="stale-agent",
        )
        payload = {"summary": "claiming ready job"}
        headers, body = self._agent_claim_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-claim/", data=body, **headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.CLAIMED)
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertEqual(response.data["assigned_agent_key_id"], "automation-agent-default")
        self.assertEqual(response.data["last_reported_by_agent_key"], "")
        self.assertIsNone(response.data["completed_at"])
        self.assertIsNone(response.data["failed_at"])
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])
        self.assertIsNone(response.data["claimed_by"])
        self.assertIsNotNone(response.data["claimed_at"])

        job.refresh_from_db()
        self.assertEqual(job.status, JobExecutionStatus.CLAIMED)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertEqual(job.assigned_agent_key_id, "automation-agent-default")
        self.assertEqual(job.last_reported_by_agent_key, "")
        self.assertIsNone(job.completed_at)
        self.assertIsNone(job.failed_at)
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)
        self.assertIsNone(job.claimed_by_id)
        self.assertIsNotNone(job.claimed_at)

        audit = AuditLog.objects.get(action="automation.job.agent_claimed")
        self.assertEqual(audit.actor, None)
        self.assertEqual(audit.detail["agent_key_id"], "automation-agent-default")
        self.assertEqual(audit.detail["status"], JobExecutionStatus.CLAIMED)
        self.assertEqual(audit.detail["summary"], "claiming ready job")
        self.assertIn("request_id", audit.detail)

    def test_agent_claim_requires_ready_status(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            assigned_agent_key_id="automation-agent-blue",
        )
        payload = {"summary": "claiming claimed job"}
        headers, body = self._agent_claim_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-claim/", data=body, **headers)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_agent_claim_rejects_invalid_signature(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        payload = {"summary": "claiming ready job"}
        headers, body = self._agent_claim_signed_headers(job.id, payload, secret="wrong-secret")

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-claim/", data=body, **headers)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")
        self.assertTrue(AuditLog.objects.filter(action="automation.job.agent_claim.auth_failed").exists())

    def test_agent_claim_rejects_replay_request(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        payload = {"summary": "claiming ready job"}
        headers, body = self._agent_claim_signed_headers(job.id, payload, timestamp=int(time.time()))

        self.client.force_authenticate(user=None)
        first = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-claim/", data=body, **headers)
        second = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-claim/", data=body, **headers)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 401)
        self.assertEqual(second.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_claim.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "replay_detected")

    @override_settings(AUTOMATION_AGENT_CLAIM_ENABLED=False)
    def test_agent_claim_rejects_when_disabled(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        payload = {"summary": "claiming ready job"}
        headers, body = self._agent_claim_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-claim/", data=body, **headers)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_claim.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "agent_claim_disabled")

    def test_agent_claim_is_throttled_after_rate_limit(self):
        first_job = Job.objects.create(
            name="sync-assets-1",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        second_job = Job.objects.create(
            name="sync-assets-2",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        third_job = Job.objects.create(
            name="sync-assets-3",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )

        first_headers, first_body = self._agent_claim_signed_headers(first_job.id, {"summary": "claim-1"}, timestamp=int(time.time()))
        second_headers, second_body = self._agent_claim_signed_headers(second_job.id, {"summary": "claim-2"}, timestamp=int(time.time()) + 1)
        third_headers, third_body = self._agent_claim_signed_headers(third_job.id, {"summary": "claim-3"}, timestamp=int(time.time()) + 2)

        self.client.force_authenticate(user=None)
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "agent_claim": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/agent-claim/", data=first_body, **first_headers)
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/agent-claim/", data=second_body, **second_headers)
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/agent-claim/", data=third_body, **third_headers)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_agent_report_completes_claimed_job_and_records_metadata(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED, "summary": "completed by executor", "metadata": {"run_id": "run-123", "duration_seconds": 14}}
        headers, body = self._agent_report_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.COMPLETED)
        self.assertEqual(response.data["execution_summary"], "completed by executor")
        self.assertEqual(response.data["execution_metadata"], {"run_id": "run-123", "duration_seconds": 14})
        self.assertEqual(response.data["assigned_agent_key_id"], "")
        self.assertEqual(response.data["last_reported_by_agent_key"], "automation-agent-default")
        self.assertIsNotNone(response.data["completed_at"])
        self.assertIsNone(response.data["failed_at"])
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])
        self.assertIsNone(response.data["claimed_by"])
        self.assertIsNone(response.data["claimed_at"])

        job.refresh_from_db()
        self.assertEqual(job.status, JobExecutionStatus.COMPLETED)
        self.assertEqual(job.execution_summary, "completed by executor")
        self.assertEqual(job.execution_metadata, {"run_id": "run-123", "duration_seconds": 14})
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)
        self.assertIsNone(job.claimed_by_id)
        self.assertIsNone(job.claimed_at)

        audit = AuditLog.objects.get(action="automation.job.agent_reported_completed")
        self.assertEqual(audit.actor, None)
        self.assertEqual(audit.detail["claimed_by"], self.user.id)
        self.assertEqual(audit.detail["agent_key_id"], "automation-agent-default")
        self.assertEqual(audit.detail["status"], JobExecutionStatus.COMPLETED)
        self.assertEqual(audit.detail["summary"], "completed by executor")
        self.assertEqual(audit.detail["metadata"], {"run_id": "run-123", "duration_seconds": 14})
        self.assertIn("request_id", audit.detail)

    def test_agent_report_fails_claimed_job(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.FAILED, "summary": "executor failed", "metadata": {"error_code": "timeout"}}
        headers, body = self._agent_report_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.FAILED)
        self.assertEqual(response.data["execution_summary"], "executor failed")
        self.assertEqual(response.data["execution_metadata"], {"error_code": "timeout"})
        self.assertEqual(response.data["assigned_agent_key_id"], "")
        self.assertEqual(response.data["last_reported_by_agent_key"], "automation-agent-default")
        self.assertIsNotNone(response.data["failed_at"])
        self.assertIsNone(response.data["completed_at"])

        job.refresh_from_db()
        self.assertEqual(job.status, JobExecutionStatus.FAILED)
        self.assertEqual(job.execution_summary, "executor failed")
        self.assertEqual(job.execution_metadata, {"error_code": "timeout"})
        self.assertEqual(job.assigned_agent_key_id, "")
        self.assertEqual(job.last_reported_by_agent_key, "automation-agent-default")

        audit = AuditLog.objects.get(action="automation.job.agent_reported_failed")
        self.assertEqual(audit.actor, None)
        self.assertEqual(audit.detail["claimed_by"], self.user.id)
        self.assertEqual(audit.detail["agent_key_id"], "automation-agent-default")
        self.assertEqual(audit.detail["status"], JobExecutionStatus.FAILED)
        self.assertEqual(audit.detail["summary"], "executor failed")
        self.assertEqual(audit.detail["metadata"], {"error_code": "timeout"})
        self.assertIn("request_id", audit.detail)

    def test_agent_report_without_summary_or_metadata_clears_stale_execution_fields(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
            ready_by=self.other_ops,
            ready_at=timezone.now(),
            execution_summary="stale summary",
            execution_metadata={"run_id": "run-123"},
            completed_at=timezone.now(),
            last_reported_by_agent_key="stale-agent",
        )
        payload = {"outcome": JobExecutionStatus.FAILED}
        headers, body = self._agent_report_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], JobExecutionStatus.FAILED)
        self.assertEqual(response.data["execution_summary"], "")
        self.assertEqual(response.data["execution_metadata"], {})
        self.assertEqual(response.data["assigned_agent_key_id"], "")
        self.assertEqual(response.data["last_reported_by_agent_key"], "automation-agent-default")
        self.assertIsNotNone(response.data["failed_at"])
        self.assertIsNone(response.data["completed_at"])
        self.assertIsNone(response.data["ready_by"])
        self.assertIsNone(response.data["ready_at"])
        self.assertIsNone(response.data["claimed_by"])
        self.assertIsNone(response.data["claimed_at"])

        job.refresh_from_db()
        self.assertEqual(job.status, JobExecutionStatus.FAILED)
        self.assertEqual(job.execution_summary, "")
        self.assertEqual(job.execution_metadata, {})
        self.assertEqual(job.assigned_agent_key_id, "")
        self.assertEqual(job.last_reported_by_agent_key, "automation-agent-default")
        self.assertIsNone(job.ready_by_id)
        self.assertIsNone(job.ready_at)
        self.assertIsNone(job.claimed_by_id)
        self.assertIsNone(job.claimed_at)
        self.assertIsNone(job.completed_at)
        self.assertIsNotNone(job.failed_at)

        audit = AuditLog.objects.get(action="automation.job.agent_reported_failed")
        self.assertEqual(audit.detail["summary"], "")
        self.assertEqual(audit.detail["metadata"], {})

    def test_agent_report_requires_claimed_status(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.READY,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            ready_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED}
        headers, body = self._agent_report_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_agent_report_rejects_unassigned_agent_key(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
            assigned_agent_key_id="automation-agent-blue",
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED}
        headers, body = self._agent_report_signed_headers(job.id, payload, key_id="automation-agent-default")

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")
        self.assertEqual(response.data["error"]["details"]["agent_key_id"], ["Agent key does not match the claimed runner assignment."])

    def test_agent_report_rejects_invalid_signature(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED}
        headers, body = self._agent_report_signed_headers(job.id, payload, secret="wrong-secret")

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")
        self.assertTrue(AuditLog.objects.filter(action="automation.job.agent_report.auth_failed").exists())

    def test_agent_report_rejects_unknown_key_id(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED}
        headers, body = self._agent_report_signed_headers(job.id, payload, key_id="unknown-agent")

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_report.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "unknown_key_id")

    def test_agent_report_rejects_invalid_timestamp_format(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED}
        headers, body = self._agent_report_signed_headers(job.id, payload)
        headers["HTTP_X_AGENT_TIMESTAMP"] = "not-a-timestamp"

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_report.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "invalid_timestamp")

    def test_agent_report_rejects_replay_request(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED, "summary": "completed by executor"}
        headers, body = self._agent_report_signed_headers(job.id, payload, timestamp=int(time.time()))

        self.client.force_authenticate(user=None)
        first = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)
        second = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 401)
        self.assertEqual(second.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_report.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "replay_detected")

    def test_agent_report_rejects_stale_timestamp(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED}
        stale_timestamp = int(time.time()) - 1000
        headers, body = self._agent_report_signed_headers(job.id, payload, timestamp=stale_timestamp)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_report.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "stale_timestamp")

    def test_agent_report_rejects_missing_signature_headers(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )

        self.client.force_authenticate(user=None)
        response = self.client.post(
            f"/api/v1/automation/jobs/{job.id}/agent-report/",
            data=json.dumps({"outcome": JobExecutionStatus.COMPLETED}).encode("utf-8"),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_report.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "missing_headers")

    @override_settings(AUTOMATION_AGENT_REPORT_ENABLED=False)
    def test_agent_report_rejects_when_disabled(self):
        job = Job.objects.create(
            name="sync-assets",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        payload = {"outcome": JobExecutionStatus.COMPLETED}
        headers, body = self._agent_report_signed_headers(job.id, payload)

        self.client.force_authenticate(user=None)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/agent-report/", data=body, **headers)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

        audit = AuditLog.objects.filter(action="automation.job.agent_report.auth_failed").latest("id")
        self.assertEqual(audit.detail["reason"], "agent_report_disabled")

    def test_agent_report_is_throttled_after_rate_limit(self):
        first_job = Job.objects.create(
            name="sync-assets-1",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        second_job = Job.objects.create(
            name="sync-assets-2",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )
        third_job = Job.objects.create(
            name="sync-assets-3",
            risk_level=JobRiskLevel.LOW,
            status=JobExecutionStatus.CLAIMED,
            approval_status=JobApprovalStatus.NOT_REQUIRED,
            claimed_by=self.user,
        )

        first_headers, first_body = self._agent_report_signed_headers(first_job.id, {"outcome": JobExecutionStatus.COMPLETED}, timestamp=int(time.time()))
        second_headers, second_body = self._agent_report_signed_headers(second_job.id, {"outcome": JobExecutionStatus.COMPLETED}, timestamp=int(time.time()) + 1)
        third_headers, third_body = self._agent_report_signed_headers(third_job.id, {"outcome": JobExecutionStatus.COMPLETED}, timestamp=int(time.time()) + 2)

        self.client.force_authenticate(user=None)
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "agent_report": "2/min"}}):
            first = self.client.post(f"/api/v1/automation/jobs/{first_job.id}/agent-report/", data=first_body, **first_headers)
            second = self.client.post(f"/api/v1/automation/jobs/{second_job.id}/agent-report/", data=second_body, **second_headers)
            third = self.client.post(f"/api/v1/automation/jobs/{third_job.id}/agent-report/", data=third_body, **third_headers)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")
