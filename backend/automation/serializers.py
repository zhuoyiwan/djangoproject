from django.db.models import Q
from rest_framework import serializers

from .models import Job, JobExecutionStatus


class JobSerializer(serializers.ModelSerializer):
    approval_requested_by_username = serializers.CharField(source="approval_requested_by.username", read_only=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    rejected_by_username = serializers.CharField(source="rejected_by.username", read_only=True)
    ready_by_username = serializers.CharField(source="ready_by.username", read_only=True)
    claimed_by_username = serializers.CharField(source="claimed_by.username", read_only=True)

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
            "ready_by",
            "ready_by_username",
            "ready_at",
            "claimed_by",
            "claimed_by_username",
            "claimed_at",
            "approval_comment",
            "execution_summary",
            "execution_metadata",
            "completed_at",
            "failed_at",
            "assigned_agent_key_id",
            "last_reported_by_agent_key",
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
            "ready_by",
            "ready_by_username",
            "ready_at",
            "claimed_by",
            "claimed_by_username",
            "claimed_at",
            "approval_comment",
            "execution_summary",
            "execution_metadata",
            "completed_at",
            "failed_at",
            "assigned_agent_key_id",
            "last_reported_by_agent_key",
            "created_at",
            "updated_at",
        )


class JobApprovalActionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)


class JobExecutionActionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)
    agent_key_id = serializers.CharField(required=False, allow_blank=False, max_length=255)


class JobAgentClaimSerializer(serializers.Serializer):
    summary = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class JobAgentReportSerializer(serializers.Serializer):
    outcome = serializers.ChoiceField(choices=(JobExecutionStatus.COMPLETED, JobExecutionStatus.FAILED))
    summary = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    metadata = serializers.JSONField(required=False)


class JobToolQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=False, max_length=255)
    name = serializers.CharField(required=False, allow_blank=False, max_length=255)
    status = serializers.ChoiceField(choices=Job._meta.get_field("status").choices, required=False)
    risk_level = serializers.ChoiceField(choices=Job._meta.get_field("risk_level").choices, required=False)
    approval_status = serializers.ChoiceField(choices=Job._meta.get_field("approval_status").choices, required=False)
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
                Q(name__icontains=q)
                | Q(status__icontains=q)
                | Q(risk_level__icontains=q)
                | Q(approval_status__icontains=q)
            )
        if name := data.get("name"):
            queryset = queryset.filter(name=name)
        if status := data.get("status"):
            queryset = queryset.filter(status=status)
        if risk_level := data.get("risk_level"):
            queryset = queryset.filter(risk_level=risk_level)
        if approval_status := data.get("approval_status"):
            queryset = queryset.filter(approval_status=approval_status)
        return queryset[: data["limit"] + 1]


class JobToolResultSerializer(serializers.ModelSerializer):
    approval_requested_by_username = serializers.CharField(source="approval_requested_by.username", read_only=True)
    approved_by_username = serializers.CharField(source="approved_by.username", read_only=True)
    rejected_by_username = serializers.CharField(source="rejected_by.username", read_only=True)
    ready_by_username = serializers.CharField(source="ready_by.username", read_only=True)
    claimed_by_username = serializers.CharField(source="claimed_by.username", read_only=True)

    class Meta:
        model = Job
        fields = (
            "id",
            "name",
            "status",
            "risk_level",
            "approval_status",
            "approval_requested_by_username",
            "approved_by_username",
            "rejected_by_username",
            "ready_by_username",
            "claimed_by_username",
            "created_at",
            "updated_at",
        )


class JobToolQueryResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    request_id = serializers.CharField()
    query = JobToolQuerySerializer()
    summary = serializers.DictField()
    items = JobToolResultSerializer(many=True)


