from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from audit.models import AuditLog
from core.permissions import IsPlatformAdmin
from core.throttling import DynamicScopedRateThrottle, ScopedActionThrottleMixin

from .serializers import (
    AVAILABLE_ROLE_NAMES,
    RegisterSerializer,
    RoleSerializer,
    UserAdminUpdateSerializer,
    UserPasswordResetSerializer,
    UserRoleAssignmentSerializer,
    UserSerializer,
)


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"


class LoginView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"


class RefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"


class UserViewSet(
    ScopedActionThrottleMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    throttle_scope = "user_admin"
    throttle_scope_map = {"me": "api_read"}
    serializer_class = UserSerializer
    queryset = get_user_model().objects.order_by("id")

    def get_permissions(self):
        if self.action == "me":
            return [permissions.IsAuthenticated()]
        return [IsPlatformAdmin()]

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return UserAdminUpdateSerializer
        if self.action == "set_password":
            return UserPasswordResetSerializer
        if self.action == "set_roles":
            return UserRoleAssignmentSerializer
        if self.action == "roles":
            return RoleSerializer
        return UserSerializer

    def _target(self, user):
        return f"user:{user.id}:{user.username}"

    def _audit(self, request, action, target_user, **detail):
        AuditLog.objects.create(
            actor=request.user,
            action=action,
            target=self._target(target_user),
            detail={"request_id": getattr(request, "request_id", ""), **detail},
        )

    def perform_update(self, serializer):
        original = self.get_object()
        changed_fields = {}
        for field in serializer.validated_data:
            previous_value = getattr(original, field)
            next_value = serializer.validated_data[field]
            if previous_value != next_value:
                changed_fields[field] = {"from": previous_value, "to": next_value}
        updated_user = serializer.save()
        self._audit(
            self.request,
            "accounts.user.updated",
            updated_user,
            changed_fields=changed_fields,
        )

    @action(detail=False, methods=["get"])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)

    @action(detail=False, methods=["get"])
    def roles(self, request):
        groups = []
        for role_name in AVAILABLE_ROLE_NAMES:
            group, _ = Group.objects.get_or_create(name=role_name)
            groups.append(group)
        serializer = self.get_serializer(groups, many=True)
        return Response({"items": serializer.data})

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        user = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])
        self._audit(request, "accounts.user.password_reset", user)
        return Response(UserSerializer(user, context=self.get_serializer_context()).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="set-roles")
    def set_roles(self, request, pk=None):
        user = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        target_groups = []
        for role_name in serializer.validated_data["roles"]:
            group, _ = Group.objects.get_or_create(name=role_name)
            target_groups.append(group)

        user.groups.set(target_groups)
        self._audit(
            request,
            "accounts.user.roles_updated",
            user,
            roles=[group.name for group in target_groups],
        )
        return Response(UserSerializer(user, context=self.get_serializer_context()).data, status=status.HTTP_200_OK)
