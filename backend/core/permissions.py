from rest_framework.permissions import BasePermission, SAFE_METHODS


ROLE_PLATFORM_ADMIN = "platform_admin"
ROLE_OPS_ADMIN = "ops_admin"
ROLE_AUDITOR = "auditor"
ROLE_VIEWER = "viewer"
ROLE_APPROVER = "approver"


def has_any_role(user, roles: tuple[str, ...]) -> bool:
    if not getattr(user, "is_authenticated", False):
        return False
    if getattr(user, "is_superuser", False):
        return True
    return user.groups.filter(name__in=roles).exists()


class IsPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return has_any_role(request.user, (ROLE_PLATFORM_ADMIN,))


class IsAuditorOrPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return has_any_role(request.user, (ROLE_AUDITOR, ROLE_PLATFORM_ADMIN))


class IsOpsOrPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return has_any_role(request.user, (ROLE_OPS_ADMIN, ROLE_PLATFORM_ADMIN))


class IsAuthenticatedReadOnlyOrOps(BasePermission):
    def has_permission(self, request, view):
        if not getattr(request.user, "is_authenticated", False):
            return False
        if request.method in SAFE_METHODS:
            return True
        return has_any_role(request.user, (ROLE_OPS_ADMIN, ROLE_PLATFORM_ADMIN))


class IsApproverOrPlatformAdmin(BasePermission):
    def has_permission(self, request, view):
        return has_any_role(request.user, (ROLE_APPROVER, ROLE_PLATFORM_ADMIN))
