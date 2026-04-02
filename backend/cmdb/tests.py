from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import IDC, Server


class IDCModelTests(TestCase):
    def test_string_representation(self):
        idc = IDC(code="cn-hz-1", name="Hangzhou IDC")
        self.assertIn("cn-hz-1", str(idc))


class ServerModelTests(TestCase):
    def test_string_representation(self):
        idc = IDC.objects.create(code="cn-hz-1", name="Hangzhou IDC")
        server = Server(
            hostname="db-primary",
            internal_ip="10.0.0.10",
            os_version="Ubuntu 22.04",
            cpu_cores=8,
            memory_gb=Decimal("32.00"),
            idc=idc,
        )
        self.assertIn("db-primary", str(server))


class ServerApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="alice", password="password123")
        self.client.force_authenticate(self.user)
        self.idc = IDC.objects.create(code="cn-hz-1", name="Hangzhou IDC")

    def test_list_servers(self):
        Server.objects.create(
            hostname="db-primary",
            internal_ip="10.0.0.10",
            os_version="Ubuntu 22.04",
            cpu_cores=8,
            memory_gb=Decimal("32.00"),
            idc=self.idc,
        )
        response = self.client.get("/api/v1/cmdb/servers/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)

    def test_filter_servers_by_environment(self):
        Server.objects.create(
            hostname="db-dev",
            internal_ip="10.0.0.11",
            os_version="Ubuntu 22.04",
            cpu_cores=4,
            memory_gb=Decimal("16.00"),
            environment="dev",
            idc=self.idc,
        )
        Server.objects.create(
            hostname="db-prod",
            internal_ip="10.0.0.12",
            os_version="Ubuntu 22.04",
            cpu_cores=16,
            memory_gb=Decimal("64.00"),
            environment="prod",
            idc=self.idc,
        )
        response = self.client.get("/api/v1/cmdb/servers/?environment=prod")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
