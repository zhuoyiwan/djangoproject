import hashlib
import hmac
import time

from django.conf import settings
from django.core.cache import cache
from rest_framework import authentication
from rest_framework.exceptions import AuthenticationFailed

from audit.models import AuditLog


class AutomationAgentPrincipal:
    is_authenticated = True

    def __init__(self, key_id: str):
        self.key_id = key_id
        self.pk = key_id


class AutomationAgentHMACAuthentication(authentication.BaseAuthentication):
    def authenticate_header(self, request):
        return "Agent-HMAC"

    def authenticate(self, request):
        if not getattr(settings, "AUTOMATION_AGENT_REPORT_ENABLED", False):
            self._audit_failure(request, "agent_report_disabled", "agent:disabled")
            raise AuthenticationFailed("Automation agent reporting is disabled.")

        key_id = request.headers.get("X-Agent-Key-Id", "")
        timestamp = request.headers.get("X-Agent-Timestamp", "")
        signature = request.headers.get("X-Agent-Signature", "")

        if not key_id or not timestamp or not signature:
            self._audit_failure(request, "missing_headers", f"agent:{key_id or 'unknown'}")
            raise AuthenticationFailed("Missing required agent signature headers.")

        keys = getattr(settings, "AUTOMATION_AGENT_REPORT_HMAC_KEYS", None)
        if keys is None:
            expected_key_id = getattr(settings, "AUTOMATION_AGENT_REPORT_HMAC_KEY_ID", "")
            secret = getattr(settings, "AUTOMATION_AGENT_REPORT_HMAC_SECRET", "")
            keys = {expected_key_id: secret} if expected_key_id and secret else {}
        secret = keys.get(key_id, "")
        if not secret:
            self._audit_failure(request, "unknown_key_id", f"agent:{key_id}")
            raise AuthenticationFailed("Invalid agent key id.")

        if not timestamp.isdigit():
            self._audit_failure(request, "invalid_timestamp", f"agent:{key_id}")
            raise AuthenticationFailed("Invalid agent timestamp.")

        now_ts = int(time.time())
        req_ts = int(timestamp)
        tolerance = int(getattr(settings, "AUTOMATION_AGENT_REPORT_TIMESTAMP_TOLERANCE_SECONDS", 300))
        if abs(now_ts - req_ts) > tolerance:
            self._audit_failure(request, "stale_timestamp", f"agent:{key_id}")
            raise AuthenticationFailed("Agent timestamp is outside allowed window.")

        body_hash = hashlib.sha256(request.body or b"").hexdigest()
        canonical = f"{request.method}\n{request.path}\n{timestamp}\n{body_hash}"
        expected_sig = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
        supplied_sig = signature.replace("sha256=", "", 1)

        if not hmac.compare_digest(expected_sig, supplied_sig):
            self._audit_failure(request, "invalid_signature", f"agent:{key_id}")
            raise AuthenticationFailed("Invalid agent signature.")

        prefix = getattr(settings, "AUTOMATION_AGENT_REPORT_REPLAY_CACHE_PREFIX", "automation_agent_report:replay")
        replay_key = f"{prefix}:{key_id}:{timestamp}:{body_hash}"
        if not cache.add(replay_key, 1, timeout=tolerance):
            self._audit_failure(request, "replay_detected", f"agent:{key_id}")
            raise AuthenticationFailed("Replay request detected.")

        request.agent_key_id = key_id
        return (AutomationAgentPrincipal(key_id), None)

    def _audit_failure(self, request, reason: str, target: str):
        request._security_event_audited = True
        AuditLog.objects.create(
            actor=None,
            action="automation.job.agent_report.auth_failed",
            target=target,
            detail={
                "reason": reason,
                "request_id": getattr(request, "request_id", ""),
                "path": getattr(request, "path", ""),
            },
        )
