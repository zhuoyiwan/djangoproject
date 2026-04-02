from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework.test import APIClient

from audit.models import AuditLog


class UserModelTests(TestCase):
    def test_display_name_falls_back_to_username(self):
        user = get_user_model()(username="alice")
        self.assertEqual(str(user), "alice")


class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_me_without_auth_writes_security_auth_failure_audit_log(self):
        response = self.client.get("/api/v1/auth/me/")
        self.assertEqual(response.status_code, 401)
        entry = AuditLog.objects.get(action="security.auth.failed")
        self.assertIsNone(entry.actor)
        self.assertEqual(entry.target, "GET /api/v1/auth/me/")
        self.assertEqual(entry.detail["status_code"], 401)

    def test_register_endpoint_creates_user(self):
        response = self.client.post(
            "/api/v1/auth/register/",
            {
                "username": "alice",
                "email": "alice@example.com",
                "password": "password123",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["username"], "alice")

    def test_login_endpoint_returns_jwt_pair(self):
        get_user_model().objects.create_user(username="alice", password="password123")
        response = self.client.post(
            "/api/v1/auth/login/",
            {"username": "alice", "password": "password123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)


class UserApiPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="alice", password="password123")
        self.client.force_authenticate(self.user)

    def test_non_admin_cannot_list_users(self):
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 403)

    def test_platform_admin_can_list_users(self):
        admin_group = Group.objects.create(name="platform_admin")
        self.user.groups.add(admin_group)
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 200)

    def test_non_admin_user_list_denial_writes_security_audit_log(self):
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 403)
        entry = AuditLog.objects.get(action="security.permission.denied")
        self.assertEqual(entry.actor, self.user)
        self.assertEqual(entry.target, "GET /api/v1/users/")
        self.assertEqual(entry.detail["status_code"], 403)
        self.assertEqual(entry.detail["username"], "alice")
