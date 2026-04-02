from rest_framework import serializers

from .models import Job


class JobSerializer(serializers.ModelSerializer):
    approval_requested_by_username = serializers.CharField(source="approval_requested_by.username", read_only=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    rejected_by_username = serializers.CharField(source="rejected_by.username", read_only=True)

    class Meta:
        model = Job
        fields = (
            "id",
            "name",
            "status",
            "risk_level",
            "approval_status",
            "approval_requested_by",
            "approval_requested_by_username",
            "approval_requested_at",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "rejected_by",
            "rejected_by_username",
            "rejected_at",
            "approval_comment",
            "payload",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "approval_status",
            "approval_requested_by",
            "approval_requested_by_username",
            "approval_requested_at",
            "approved_by",
            "approved_by_username",
            "approved_at",
            "rejected_by",
            "rejected_by_username",
            "rejected_at",
            "approval_comment",
            "created_at",
            "updated_at",
        )


class JobApprovalActionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)
