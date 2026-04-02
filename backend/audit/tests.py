from django.contrib.auth import get_user_model
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

    def test_list_audit_logs(self):
        AuditLog.objects.create(actor=self.user, action="server.created", target="db-primary@10.0.0.10")
        response = self.client.get("/api/v1/audit/logs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
