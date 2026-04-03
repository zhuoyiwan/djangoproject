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
    enabled_setting = "AUTOMATION_AGENT_REPORT_ENABLED"
    keys_setting = "AUTOMATION_AGENT_REPORT_HMAC_KEYS"
    key_id_setting = "AUTOMATION_AGENT_REPORT_HMAC_KEY_ID"
    secret_setting = "AUTOMATION_AGENT_REPORT_HMAC_SECRET"
    tolerance_setting = "AUTOMATION_AGENT_REPORT_TIMESTAMP_TOLERANCE_SECONDS"
    replay_prefix_setting = "AUTOMATION_AGENT_REPORT_REPLAY_CACHE_PREFIX"
    default_replay_prefix = "automation_agent_report:replay"
    disabled_reason = "agent_report_disabled"
    disabled_message = "Automation agent reporting is disabled."
    auth_failed_action = "automation.job.agent_report.auth_failed"

    def authenticate_header(self, request):
        return "Agent-HMAC"

    def authenticate(self, request):
        if not getattr(settings, self.enabled_setting, False):
            self._audit_failure(request, self.disabled_reason, "agent:disabled")
            raise AuthenticationFailed(self.disabled_message)

        key_id = request.headers.get("X-Agent-Key-Id", "")
        timestamp = request.headers.get("X-Agent-Timestamp", "")
        signature = request.headers.get("X-Agent-Signature", "")

        if not key_id or not timestamp or not signature:
            self._audit_failure(request, "missing_headers", f"agent:{key_id or 'unknown'}")
            raise AuthenticationFailed("Missing required agent signature headers.")

        keys = getattr(settings, self.keys_setting, None)
        if keys is None:
            expected_key_id = getattr(settings, self.key_id_setting, "")
            secret = getattr(settings, self.secret_setting, "")
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
        tolerance = int(getattr(settings, self.tolerance_setting, 300))
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

        prefix = getattr(settings, self.replay_prefix_setting, self.default_replay_prefix)
        replay_key = f"{prefix}:{key_id}:{request.method}:{request.path}:{timestamp}:{body_hash}"
        if not cache.add(replay_key, 1, timeout=tolerance):
            self._audit_failure(request, "replay_detected", f"agent:{key_id}")
            raise AuthenticationFailed("Replay request detected.")

        request.agent_key_id = key_id
        return (AutomationAgentPrincipal(key_id), None)

    def _audit_failure(self, request, reason: str, target: str):
        request._security_event_audited = True
        AuditLog.objects.create(
            actor=None,
            action=self.auth_failed_action,
            target=target,
            detail={
                "reason": reason,
                "request_id": getattr(request, "request_id", ""),
                "path": getattr(request, "path", ""),
                "status_code": 401,
            },
        )


class AutomationAgentClaimHMACAuthentication(AutomationAgentHMACAuthentication):
    enabled_setting = "AUTOMATION_AGENT_CLAIM_ENABLED"
    keys_setting = "AUTOMATION_AGENT_CLAIM_HMAC_KEYS"
    key_id_setting = "AUTOMATION_AGENT_CLAIM_HMAC_KEY_ID"
    secret_setting = "AUTOMATION_AGENT_CLAIM_HMAC_SECRET"
    tolerance_setting = "AUTOMATION_AGENT_CLAIM_TIMESTAMP_TOLERANCE_SECONDS"
    replay_prefix_setting = "AUTOMATION_AGENT_CLAIM_REPLAY_CACHE_PREFIX"
    default_replay_prefix = "automation_agent_claim:replay"
    disabled_reason = "agent_claim_disabled"
    disabled_message = "Automation agent claiming is disabled."
    auth_failed_action = "automation.job.agent_claim.auth_failed"
