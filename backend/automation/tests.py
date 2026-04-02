from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from audit.models import AuditLog
from core.permissions import ROLE_APPROVER, ROLE_OPS_ADMIN

from .models import Job, JobApprovalStatus, JobRiskLevel


class JobModelTests(TestCase):
    def test_string_representation(self):
        job = Job(name="sync-assets")
        self.assertEqual(str(job), "sync-assets")


class JobApiTests(TestCase):
    def setUp(self):
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
            {"name": "sync-assets", "status": "pending", "risk_level": JobRiskLevel.LOW, "payload": {}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.NOT_REQUIRED)
        self.assertEqual(response.data["risk_level"], JobRiskLevel.LOW)

    def test_ops_admin_can_create_high_risk_job_pending_approval(self):
        self.user.groups.add(Group.objects.create(name=ROLE_OPS_ADMIN))
        response = self.client.post(
            "/api/v1/automation/jobs/",
            {"name": "restart-prod", "status": "pending", "risk_level": JobRiskLevel.HIGH, "payload": {"target": "prod"}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.PENDING)
        self.assertEqual(response.data["approval_requested_by"], self.user.id)

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
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        self.client.force_authenticate(self.approver)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/approve/", {"comment": "approved"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.APPROVED)
        self.assertEqual(response.data["approved_by"], self.approver.id)

    def test_approver_can_reject_pending_high_risk_job(self):
        self.approver.groups.add(Group.objects.create(name=ROLE_APPROVER))
        job = Job.objects.create(
            name="restart-prod",
            risk_level=JobRiskLevel.HIGH,
            approval_status=JobApprovalStatus.PENDING,
            approval_requested_by=self.user,
        )
        self.client.force_authenticate(self.approver)
        response = self.client.post(f"/api/v1/automation/jobs/{job.id}/reject/", {"comment": "missing change window"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["approval_status"], JobApprovalStatus.REJECTED)
        self.assertEqual(response.data["rejected_by"], self.approver.id)

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
            {"name": "restart-prod", "status": "pending", "risk_level": JobRiskLevel.HIGH, "payload": {"target": "prod"}},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(AuditLog.objects.filter(action="automation.job.created").exists())
        self.assertTrue(AuditLog.objects.filter(action="automation.job.approval_requested").exists())
