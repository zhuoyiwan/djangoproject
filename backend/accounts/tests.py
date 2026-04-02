from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class UserModelTests(TestCase):
    def test_display_name_falls_back_to_username(self):
        user = get_user_model()(username="alice")
        self.assertEqual(str(user), "alice")


class AuthenticationApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

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
