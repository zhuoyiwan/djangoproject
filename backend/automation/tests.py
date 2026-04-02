from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from audit.models import AuditLog
from core.permissions import ROLE_APPROVER, ROLE_OPS_ADMIN

from .adapters import build_job_handoff_response
from .models import Job, JobApprovalStatus, JobExecutionStatus, JobRiskLevel


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
        self.client.force_authenticate(self.user)

    def test_list_jobs(self):
        Job.objects.create(name="sync-assets")
        response = self.client.get("/api/v1/automation/jobs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

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
        )
        self.client.force_authenticate(self.approver)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/approve/", {"comment": "approved"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.APPROVED)
        self.assertEqual(response.data["approved_by"], self.approver.id)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)

    def test_approver_can_reject_pending_high_risk_job(self):
        self.approver.groups.add(Group.objects.create(name=ROLE_APPROVER))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            status=JobExecutionStatus.AWAITING_APPROVAL,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        self.client.force_authenticate(self.approver)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/reject/", {"comment": "missing change window"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.REJECTED)
        self.assertEqual(response.data["rejected_by"], self.approver.id)
        self.assertEqual(response.data["status"], JobExecutionStatus.DRAFT)

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
