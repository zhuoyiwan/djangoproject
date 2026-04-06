import hashlib
import secrets
from datetime import datetime, timezone as datetime_timezone

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.cache import cache
from django.core.mail import send_mail
from django.db.models import Q
from rest_framework import generics, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from audit.models import AuditLog
from core.permissions import IsPlatformAdmin
from core.throttling import DynamicScopedRateThrottle, ScopedActionThrottleMixin

from .serializers import (
    AVAILABLE_ROLE_NAMES,
    ChangePasswordSerializer,
    LogoutSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    RegisterSerializer,
    RevocableTokenRefreshSerializer,
    RoleSerializer,
    UserAdminUpdateSerializer,
    UserPasswordResetSerializer,
    UserRoleAssignmentSerializer,
    UserSerializer,
)


def get_refresh_revoke_cache_key(token):
    return f"{settings.AUTH_REFRESH_REVOKE_CACHE_PREFIX}:{token['jti']}"


def get_password_reset_cache_key(raw_token: str):
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return f"{settings.AUTH_PASSWORD_RESET_CACHE_PREFIX}:{token_hash}"


def seconds_until_epoch(epoch_seconds: int):
    now = int(datetime.now(datetime_timezone.utc).timestamp())
    return max(epoch_seconds - now, 1)


def revoke_refresh_token(raw_refresh: str):
    serializer = RevocableTokenRefreshSerializer(data={"refresh": raw_refresh})
    serializer.is_valid(raise_exception=True)
    refresh = serializer.token_class(raw_refresh)
    cache.set(get_refresh_revoke_cache_key(refresh), True, timeout=seconds_until_epoch(refresh["exp"]))
    return refresh


def is_refresh_token_revoked(token):
    return bool(cache.get(get_refresh_revoke_cache_key(token)))


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
    serializer_class = RevocableTokenRefreshSerializer

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["is_refresh_token_revoked"] = is_refresh_token_revoked
        return context


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        request.user.set_password(serializer.validated_data["new_password"])
        request.user.save(update_fields=["password"])
        AuditLog.objects.create(
            actor=request.user,
            action="accounts.auth.password_changed",
            target=f"user:{request.user.id}:{request.user.username}",
            detail={"request_id": getattr(request, "request_id", "")},
        )
        return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        refresh = revoke_refresh_token(serializer.validated_data["refresh"])
        AuditLog.objects.create(
            actor=request.user,
            action="accounts.auth.logged_out",
            target=f"user:{request.user.id}:{request.user.username}",
            detail={
                "request_id": getattr(request, "request_id", ""),
                "refresh_jti": refresh["jti"],
            },
        )
        return Response(
            {
                "ok": True,
                "request_id": getattr(request, "request_id", ""),
                "message": "Session revoked.",
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        account = serializer.validated_data["account"].strip()
        user = (
            get_user_model()
            .objects.filter(is_active=True)
            .filter(Q(username__iexact=account) | Q(email__iexact=account))
            .first()
        )

        response_payload = {
            "ok": True,
            "request_id": getattr(request, "request_id", ""),
            "message": "If the account exists, reset instructions have been issued.",
        }

        if user is not None:
            raw_token = secrets.token_urlsafe(32)
            cache.set(
                get_password_reset_cache_key(raw_token),
                user.id,
                timeout=settings.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS,
            )

            delivery_channel = "email"
            if user.email:
                send_mail(
                    subject="ChatOps CMDB password reset",
                    message=(
                        "A password reset was requested for your ChatOps CMDB account.\n\n"
                        f"Username: {user.username}\n"
                        f"Reset token: {raw_token}\n"
                        f"Valid for: {settings.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS // 60} minutes\n"
                    ),
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=False,
                )
            else:
                delivery_channel = "direct"
                response_payload["reset_token"] = raw_token

            AuditLog.objects.create(
                actor=None,
                action="accounts.auth.password_reset_requested",
                target=f"user:{user.id}:{user.username}",
                detail={
                    "request_id": getattr(request, "request_id", ""),
                    "delivery_channel": delivery_channel,
                },
            )

        return Response(response_payload, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cache_key = get_password_reset_cache_key(serializer.validated_data["token"])
        user_id = cache.get(cache_key)
        if not user_id:
            raise ValidationError({"token": ["Reset token is invalid or expired."]})

        user = get_user_model().objects.filter(id=user_id, is_active=True).first()
        if user is None:
            cache.delete(cache_key)
            raise ValidationError({"token": ["Reset token is invalid or expired."]})

        password_serializer = UserPasswordResetSerializer(
            data={"password": serializer.validated_data["new_password"]},
            context={"target_user": user},
        )
        password_serializer.is_valid(raise_exception=True)

        user.set_password(password_serializer.validated_data["password"])
        user.save(update_fields=["password"])
        cache.delete(cache_key)
        AuditLog.objects.create(
            actor=None,
            action="accounts.auth.password_reset_completed",
            target=f"user:{user.id}:{user.username}",
            detail={"request_id": getattr(request, "request_id", "")},
        )
        return Response(
            {
                "ok": True,
                "request_id": getattr(request, "request_id", ""),
                "message": "Password has been reset.",
            },
            status=status.HTTP_200_OK,
        )


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
        serializer = self.get_serializer(data=request.data, context={"target_user": user})
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
