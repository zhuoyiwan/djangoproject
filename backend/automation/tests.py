from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Job


class JobModelTests(TestCase):
    def test_string_representation(self):
        job = Job(name="sync-assets")
        self.assertEqual(str(job), "sync-assets")


class JobApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="alice", password="password123")
        self.client.force_authenticate(self.user)

    def test_list_jobs(self):
        Job.objects.create(name="sync-assets")
        response = self.client.get("/api/v1/automation/jobs/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
