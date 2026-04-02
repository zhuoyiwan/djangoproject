from django.conf import settings
from rest_framework.permissions import SAFE_METHODS
from rest_framework.throttling import ScopedRateThrottle


class DynamicScopedRateThrottle(ScopedRateThrottle):
    def get_rate(self):
        scope = getattr(self, "scope", None)
        if not scope:
            return None
        return settings.REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}).get(scope)

    def get_cache_key(self, request, view):
        if request.user and getattr(request.user, "is_authenticated", False):
            ident = getattr(request.user, "pk", None) or getattr(request.user, "key_id", None)
        else:
            ident = self.get_ident(request)
        if ident is None:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}


class ScopedActionThrottleMixin:
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "api_read"
    throttle_scope_map = {}

    def get_throttles(self):
        scope = self.throttle_scope_map.get(getattr(self, "action", None))
        if scope is None and self.request.method not in SAFE_METHODS:
            scope = "api_write"
        self.throttle_scope = scope or self.throttle_scope
        return super().get_throttles()
