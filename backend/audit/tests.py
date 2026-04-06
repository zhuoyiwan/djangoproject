from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from .models import AuditLog


class AuditLogModelTests(TestCase):
    def test_string_representation(self):
        entry = AuditLog(action="server.created", target="db-primary@10.0.0.10")
        self.assertEqual(str(entry), "server.created")


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "audit-log-api-tests",
        }
    }
)
class AuditLogApiTests(TestCase):
    def setUp(self):
        cache.clear()
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

    def test_audit_tool_query_is_throttled_after_rate_limit(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10")
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "tool_query": "2/min"}}):
            first = self.client.get("/api/v1/audit/logs/tool-query/?q=server")
            second = self.client.get("/api/v1/audit/logs/tool-query/?q=server")
            third = self.client.get("/api/v1/audit/logs/tool-query/?q=server")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_tool_query_supports_structured_filters(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10")
        AuditLog.objects.create(actor=self.user, action="server.updated", target="db-replica@10.0.0.11")

        response = self.client.get("/api/v1/audit/logs/tool-query/?action=server.updated&actor_username=alice")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["target"], "db-replica@10.0.0.11")

    def test_tool_query_supports_security_event_detail_filters(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(
            actor=None,
            action="server.agent_ingest.auth_failed",
            target="agent:unknown",
            detail={"reason": "missing_headers", "path": "/api/v1/cmdb/servers/agent-ingest/", "status_code": 401},
        )
        AuditLog.objects.create(
            actor=None,
            action="automation.job.agent_claim.auth_failed",
            target="agent:automation-agent-default",
            detail={"reason": "invalid_signature", "path": "/api/v1/automation/jobs/1/agent-claim/", "status_code": 401},
        )
        AuditLog.objects.create(
            actor=self.user,
            action="security.permission.denied",
            target="GET /api/v1/users/",
            detail={"reason": "role_missing", "path": "/api/v1/users/", "status_code": 403},
        )

        response = self.client.get(
            "/api/v1/audit/logs/tool-query/?detail_reason=invalid_signature&detail_path=/api/v1/automation/jobs/1/agent-claim/&detail_status_code=401"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["action"], "automation.job.agent_claim.auth_failed")

    def test_tool_query_keyword_search_matches_security_event_details(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(
            actor=None,
            action="server.agent_ingest.auth_failed",
            target="agent:unknown",
            detail={"reason": "missing_headers", "path": "/api/v1/cmdb/servers/agent-ingest/", "request_id": "req-123"},
        )

        response = self.client.get("/api/v1/audit/logs/tool-query/?q=missing_headers")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["target"], "agent:unknown")

    def test_auditor_can_export_audit_logs_as_csv(self):
        auditor_group = Group.objects.create(name="auditor")
        self.user.groups.add(auditor_group)
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10")

        response = self.client.get("/api/v1/audit/logs/export/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        self.assertIn("filename*=UTF-8''", response["Content-Disposition"])
        self.assertIn("%E6%93%8D%E4%BD%9C%E8%AE%B0%E5%BD%95%E6%98%8E%E7%BB%86_", response["Content-Disposition"])
        self.assertIn("server.created", response.content.decode("utf-8-sig"))
