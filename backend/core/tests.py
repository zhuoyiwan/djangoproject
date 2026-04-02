from django.core.exceptions import ImproperlyConfigured
from django.test import TestCase

from config.settings.base import require_strong_jwt_signing_key


class HealthcheckTests(TestCase):
    def test_healthcheck(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertIn("request_id", response.json())
        self.assertIn("X-Request-ID", response.headers)


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
