from django.db.models import Q
from rest_framework import serializers

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = AuditLog
        fields = ("id", "actor", "actor_username", "action", "target", "detail", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class AuditLogToolQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=False, max_length=255)
    action = serializers.CharField(required=False, allow_blank=False, max_length=128)
    target = serializers.CharField(required=False, allow_blank=False, max_length=255)
    actor_username = serializers.CharField(required=False, allow_blank=False, max_length=150)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=20, default=10)

    def validate(self, attrs):
        filters = {key: value for key, value in attrs.items() if key != "limit"}
        if not filters:
            raise serializers.ValidationError("At least one query filter is required.")
        return attrs

    def filter_queryset(self, queryset):
        data = self.validated_data
        if q := data.get("q"):
            queryset = queryset.filter(
                Q(action__icontains=q)
                | Q(target__icontains=q)
                | Q(actor__username__icontains=q)
            )
        if action := data.get("action"):
            queryset = queryset.filter(action=action)
        if target := data.get("target"):
            queryset = queryset.filter(target=target)
        if actor_username := data.get("actor_username"):
            queryset = queryset.filter(actor__username=actor_username)
        return queryset[: data["limit"]]


class AuditLogToolResultSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source="actor.username", read_only=True)

    class Meta:
        model = AuditLog
        fields = ("id", "action", "target", "actor_username", "detail", "created_at")


class AuditLogToolQueryResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    request_id = serializers.CharField()
    query = AuditLogToolQuerySerializer()
    summary = serializers.DictField()
    items = AuditLogToolResultSerializer(many=True)
