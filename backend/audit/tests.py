from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from .models import AuditLog


class AuditLogModelTests(TestCase):
    def test_string_representation(self):
        entry = AuditLog(action="server.created", target="db-primary@10.0.0.10")
        self.assertEqual(str(entry), "server.created")


class AuditLogApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="alice", password="password123")
        self.client.force_authenticate(self.user)

    def test_non_auditor_cannot_list_audit_logs(self):
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10")
        response = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(response.status_code, 403)

    def test_auditor_can_list_audit_logs(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10")
        response = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_tool_query_requires_at_least_one_filter(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        response = self.client.get("/api/v1/audit/logs/tool-query/")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")

    def test_auditor_can_query_audit_logs_with_normalized_response(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10", detail={"environment": "prod"})
        AuditLog.objects.create(actor=self.user, action="automation.job.claimed", target="job:1:sync-assets", detail={"status": "claimed"})

        response = self.client.get("/api/v1/audit/logs/tool-query/?q=server&limit=5")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["ok"])
        self.assertEqual(response.data["summary"]["count"], 1)
        self.assertEqual(response.data["summary"]["returned"], 1)
        self.assertFalse(response.data["summary"]["truncated"])
        self.assertEqual(response.data["query"]["q"], "server")
        self.assertEqual(response.data["query"]["limit"], 5)
        self.assertEqual(response.data["items"][0]["action"], "server.created")
        self.assertEqual(response.data["items"][0]["actor_username"], "alice")

    def test_tool_query_supports_structured_filters(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10")
        AuditLog.objects.create(actor=self.user, action="server.updated", target="db-replica@10.0.0.11")

        response = self.client.get("/api/v1/audit/logs/tool-query/?action=server.updated&actor_username=alice")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["target"], "db-replica@10.0.0.11")
