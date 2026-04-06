from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

from core.permissions import ROLE_APPROVER, ROLE_AUDITOR, ROLE_OPS_ADMIN, ROLE_PLATFORM_ADMIN, ROLE_VIEWER


AVAILABLE_ROLE_NAMES = (
    ROLE_PLATFORM_ADMIN,
    ROLE_OPS_ADMIN,
    ROLE_AUDITOR,
    ROLE_VIEWER,
    ROLE_APPROVER,
)


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ("id", "name")


class UserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()

    class Meta:
        model = get_user_model()
        fields = ("id", "username", "email", "first_name", "last_name", "display_name", "is_active", "roles")
        read_only_fields = ("id",)

    def get_roles(self, obj):
        return list(obj.groups.order_by("name").values_list("name", flat=True))


class UserAdminUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = get_user_model()
        fields = ("username", "email", "first_name", "last_name", "display_name", "is_active")


class UserPasswordResetSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate_password(self, value):
        user = self.context.get("target_user")
        validate_password(value, user)
        return value


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate_current_password(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.check_password(value):
            raise serializers.ValidationError("Current password is incorrect.")
        return value

    def validate_new_password(self, value):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        validate_password(value, user)
        return value


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(trim_whitespace=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    account = serializers.CharField(max_length=255, trim_whitespace=True)


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField(trim_whitespace=False)
    new_password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)


class RevocableTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        raw_refresh = attrs["refresh"]
        try:
            refresh = RefreshToken(raw_refresh)
        except TokenError as exc:
            raise InvalidToken(str(exc)) from exc

        is_revoked = self.context.get("is_refresh_token_revoked")
        if callable(is_revoked) and is_revoked(refresh):
            raise InvalidToken("Refresh token has been revoked.")

        return super().validate(attrs)


class UserRoleAssignmentSerializer(serializers.Serializer):
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=AVAILABLE_ROLE_NAMES),
        allow_empty=True,
    )

    def validate_roles(self, value):
        deduplicated = list(dict.fromkeys(value))
        return deduplicated


class RoleListResponseSerializer(serializers.Serializer):
    items = RoleSerializer(many=True)


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = get_user_model()
        fields = ("id", "username", "email", "password", "first_name", "last_name", "display_name")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = get_user_model()(**validated_data)
        user.set_password(password)
        user.save()
        return user
