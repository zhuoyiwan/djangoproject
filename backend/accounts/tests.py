from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core import mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from audit.models import AuditLog


class UserModelTests(TestCase):
    def test_display_name_falls_back_to_username(self):
        user = get_user_model()(username="alice")
        self.assertEqual(str(user), "alice")


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "accounts-auth-tests",
        }
    }
)
class AuthenticationApiTests(TestCase):
    def setUp(self):
        cache.clear()
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

    def test_login_endpoint_is_throttled_after_rate_limit(self):
        get_user_model().objects.create_user(username="alice", password="password123")
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "auth": "2/min"}}):
            first = self.client.post("/api/v1/auth/login/", {"username": "alice", "password": "password123"}, format="json")
            second = self.client.post("/api/v1/auth/login/", {"username": "alice", "password": "password123"}, format="json")
            third = self.client.post("/api/v1/auth/login/", {"username": "alice", "password": "password123"}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_change_password_updates_current_user_password(self):
        user = get_user_model().objects.create_user(username="alice", password="password123")
        self.client.force_authenticate(user)

        response = self.client.post(
            "/api/v1/auth/change-password/",
            {"current_password": "password123", "new_password": "AlicePassword#2026"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password("AlicePassword#2026"))
        entry = AuditLog.objects.get(action="accounts.auth.password_changed")
        self.assertEqual(entry.actor, user)
        self.assertEqual(entry.target, f"user:{user.id}:alice")

    def test_logout_revokes_refresh_token(self):
        get_user_model().objects.create_user(username="alice", password="password123")
        tokens = self.client.post(
            "/api/v1/auth/login/",
            {"username": "alice", "password": "password123"},
            format="json",
        ).data
        user = get_user_model().objects.get(username="alice")
        self.client.force_authenticate(user)

        response = self.client.post(
            "/api/v1/auth/logout/",
            {"refresh": tokens["refresh"]},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        refresh_response = self.client.post(
            "/api/v1/auth/refresh/",
            {"refresh": tokens["refresh"]},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, 401)
        entry = AuditLog.objects.get(action="accounts.auth.logged_out")
        self.assertEqual(entry.actor, user)

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
    def test_password_reset_request_and_confirm_flow(self):
        user = get_user_model().objects.create_user(
            username="alice",
            email="alice@example.com",
            password="password123",
        )

        request_response = self.client.post(
            "/api/v1/auth/password-reset/request/",
            {"account": "alice@example.com"},
            format="json",
        )

        self.assertEqual(request_response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        message = mail.outbox[0].body
        token = next(line.split(": ", 1)[1] for line in message.splitlines() if line.startswith("Reset token: "))

        confirm_response = self.client.post(
            "/api/v1/auth/password-reset/confirm/",
            {"token": token, "new_password": "ResetPassword#2026"},
            format="json",
        )

        self.assertEqual(confirm_response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password("ResetPassword#2026"))
        self.assertTrue(AuditLog.objects.filter(action="accounts.auth.password_reset_requested").exists())
        self.assertTrue(AuditLog.objects.filter(action="accounts.auth.password_reset_completed").exists())


@override_settings(
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "accounts-user-api-tests",
        }
    }
)
class UserApiPermissionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="alice", password="password123")
        self.target_user = get_user_model().objects.create_user(username="bob", password="password123", email="bob@example.com")
        self.client.force_authenticate(self.user)

    def test_non_admin_cannot_list_users(self):
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 403)

    def test_platform_admin_can_list_users(self):
        admin_group = Group.objects.create(name="platform_admin")
        self.user.groups.add(admin_group)
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 200)

    def test_user_list_is_throttled_after_user_admin_rate_limit(self):
        admin_group = Group.objects.create(name="platform_admin")
        self.user.groups.add(admin_group)
        with override_settings(REST_FRAMEWORK={**settings.REST_FRAMEWORK, "DEFAULT_THROTTLE_RATES": {**settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"], "user_admin": "2/min"}}):
            first = self.client.get("/api/v1/users/")
            second = self.client.get("/api/v1/users/")
            third = self.client.get("/api/v1/users/")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)
        self.assertEqual(third.data["error"]["code"], "rate_limited")

    def test_non_admin_user_list_denial_writes_security_audit_log(self):
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 403)
        entry = AuditLog.objects.get(action="security.permission.denied")
        self.assertEqual(entry.actor, self.user)
        self.assertEqual(entry.target, "GET /api/v1/users/")
        self.assertEqual(entry.detail["status_code"], 403)
        self.assertEqual(entry.detail["username"], "alice")

    def test_me_returns_current_user_roles(self):
        approver_group = Group.objects.create(name="approver")
        self.user.groups.add(approver_group)
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "alice")
        self.assertEqual(response.data["roles"], ["approver"])

    def test_platform_admin_can_update_user_profile_and_active_state(self):
        admin_group = Group.objects.create(name="platform_admin")
        self.user.groups.add(admin_group)
        response = self.client.patch(
            f"/api/v1/users/{self.target_user.id}/",
            {
                "display_name": "Bob Lee",
                "email": "bob.lee@example.com",
                "is_active": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.target_user.refresh_from_db()
        self.assertEqual(self.target_user.display_name, "Bob Lee")
        self.assertEqual(self.target_user.email, "bob.lee@example.com")
        self.assertFalse(self.target_user.is_active)
        entry = AuditLog.objects.get(action="accounts.user.updated")
        self.assertEqual(entry.actor, self.user)
        self.assertEqual(entry.target, f"user:{self.target_user.id}:bob")

    def test_platform_admin_can_list_available_roles(self):
        admin_group = Group.objects.create(name="platform_admin")
        self.user.groups.add(admin_group)
        response = self.client.get("/api/v1/users/roles/")
        self.assertEqual(response.status_code, 200)
        role_names = [item["name"] for item in response.data["items"]]
        self.assertCountEqual(role_names, ["platform_admin", "ops_admin", "auditor", "viewer", "approver"])

    def test_platform_admin_can_assign_roles_to_user(self):
        admin_group = Group.objects.create(name="platform_admin")
        self.user.groups.add(admin_group)
        response = self.client.post(
            f"/api/v1/users/{self.target_user.id}/set-roles/",
            {"roles": ["ops_admin", "auditor"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertCountEqual(list(self.target_user.groups.values_list("name", flat=True)), ["ops_admin", "auditor"])
        entry = AuditLog.objects.get(action="accounts.user.roles_updated")
        self.assertEqual(entry.actor, self.user)
        self.assertCountEqual(entry.detail["roles"], ["ops_admin", "auditor"])

    def test_platform_admin_can_reset_user_password(self):
        admin_group = Group.objects.create(name="platform_admin")
        self.user.groups.add(admin_group)
        response = self.client.post(
            f"/api/v1/users/{self.target_user.id}/set-password/",
            {"password": "new-password-123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.target_user.refresh_from_db()
        self.assertTrue(self.target_user.check_password("new-password-123"))
        entry = AuditLog.objects.get(action="accounts.user.password_reset")
        self.assertEqual(entry.actor, self.user)
        self.assertEqual(entry.target, f"user:{self.target_user.id}:bob")

    def test_non_admin_cannot_assign_roles(self):
        response = self.client.post(
            f"/api/v1/users/{self.target_user.id}/set-roles/",
            {"roles": ["ops_admin"]},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
