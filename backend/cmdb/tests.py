import hashlib
import hmac
import json
import time
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.test import TestCase, override_settings
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

    def test_non_ops_cannot_create_server(self):
        payload = {
            "hostname": "db-new",
            "internal_ip": "10.0.0.13",
            "os_version": "Ubuntu 22.04",
            "cpu_cores": 4,
            "memory_gb": "8.00",
            "lifecycle_status": "online",
            "environment": "dev",
            "idc": self.idc.id,
        }
        response = self.client.post("/api/v1/cmdb/servers/", payload, format="json")
        self.assertEqual(response.status_code, 403)

    def test_ops_admin_can_create_server(self):
        ops_group = Group.objects.create(name="ops_admin")
        self.user.groups.add(ops_group)
        payload = {
            "hostname": "db-new",
            "internal_ip": "10.0.0.13",
            "os_version": "Ubuntu 22.04",
            "cpu_cores": 4,
            "memory_gb": "8.00",
            "lifecycle_status": "online",
            "environment": "dev",
            "idc": self.idc.id,
        }
        response = self.client.post("/api/v1/cmdb/servers/", payload, format="json")
        self.assertEqual(response.status_code, 201)


@override_settings(
    AGENT_INGEST_ENABLED=True,
    AGENT_INGEST_HMAC_KEY_ID="agent-default",
    AGENT_INGEST_HMAC_SECRET="agent-secret-for-tests",
    AGENT_INGEST_TIMESTAMP_TOLERANCE_SECONDS=300,
    CACHES={
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "agent-ingest-tests",
        }
    },
)
class AgentIngestApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.idc = IDC.objects.create(code="cn-hz-1", name="Hangzhou IDC")

    def _signed_headers(self, payload, timestamp=None, key_id="agent-default", secret="agent-secret-for-tests"):
        ts = str(timestamp or int(time.time()))
        body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        body_hash = hashlib.sha256(body).hexdigest()
        canonical = f"POST\n/api/v1/cmdb/servers/agent-ingest/\n{ts}\n{body_hash}"
        signature = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
        return {
            "HTTP_X_AGENT_KEY_ID": key_id,
            "HTTP_X_AGENT_TIMESTAMP": ts,
            "HTTP_X_AGENT_SIGNATURE": f"sha256={signature}",
            "content_type": "application/json",
        }, body

    def _base_payload(self):
        return {
            "hostname": "agent-host-01",
            "internal_ip": "10.10.10.10",
            "external_ip": "1.1.1.1",
            "os_version": "Ubuntu 22.04",
            "cpu_cores": 8,
            "memory_gb": "32.00",
            "disk_summary": "system:100G,data:500G",
            "lifecycle_status": "online",
            "environment": "prod",
            "idc_code": "cn-hz-1",
            "metadata": {"agent_version": "1.0.0"},
        }

    def test_agent_ingest_creates_server_with_valid_signature(self):
        payload = self._base_payload()
        headers, body = self._signed_headers(payload)
        response = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body, **headers)
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["ok"])
        self.assertEqual(response.data["result"], "created")
        self.assertEqual(Server.objects.count(), 1)

    def test_agent_ingest_updates_existing_server(self):
        payload = self._base_payload()
        headers, body = self._signed_headers(payload)
        first = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body, **headers)
        self.assertEqual(first.status_code, 201)

        payload["memory_gb"] = "64.00"
        headers2, body2 = self._signed_headers(payload, timestamp=int(time.time()) + 1)
        response = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body2, **headers2)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"], "updated")
        self.assertEqual(Server.objects.count(), 1)

    def test_agent_ingest_rejects_missing_headers(self):
        payload = self._base_payload()
        response = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=payload, format="json")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

    def test_agent_ingest_rejects_invalid_signature(self):
        payload = self._base_payload()
        headers, body = self._signed_headers(payload, secret="wrong-secret")
        response = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body, **headers)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

    def test_agent_ingest_rejects_stale_timestamp(self):
        payload = self._base_payload()
        headers, body = self._signed_headers(payload, timestamp=int(time.time()) - 1000)
        response = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body, **headers)
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["error"]["code"], "unauthorized")

    def test_agent_ingest_rejects_replay(self):
        payload = self._base_payload()
        headers, body = self._signed_headers(payload)
        first = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body, **headers)
        second = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body, **headers)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 401)

    def test_agent_ingest_rejects_unknown_idc_code(self):
        payload = self._base_payload()
        payload["idc_code"] = "not-exists"
        headers, body = self._signed_headers(payload)
        response = self.client.post("/api/v1/cmdb/servers/agent-ingest/", data=body, **headers)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["error"]["code"], "validation_error")
