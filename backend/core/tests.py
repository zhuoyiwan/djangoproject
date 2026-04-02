from django.test import TestCase


class HealthcheckTests(TestCase):
    def test_healthcheck(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertIn("request_id", response.json())
        self.assertIn("X-Request-ID", response.headers)
