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
    detail_reason = serializers.CharField(required=False, allow_blank=False, max_length=255)
    detail_path = serializers.CharField(required=False, allow_blank=False, max_length=255)
    detail_status_code = serializers.IntegerField(required=False, min_value=100, max_value=599)
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
                | Q(detail__reason__icontains=q)
                | Q(detail__path__icontains=q)
                | Q(detail__request_id__icontains=q)
            )
        if action := data.get("action"):
            queryset = queryset.filter(action=action)
        if target := data.get("target"):
            queryset = queryset.filter(target=target)
        if actor_username := data.get("actor_username"):
            queryset = queryset.filter(actor__username=actor_username)
        if detail_reason := data.get("detail_reason"):
            queryset = queryset.filter(detail__reason=detail_reason)
        if detail_path := data.get("detail_path"):
            queryset = queryset.filter(detail__path=detail_path)
        if detail_status_code := data.get("detail_status_code"):
            queryset = queryset.filter(detail__status_code=detail_status_code)
        return queryset[: data["limit"] + 1]


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
