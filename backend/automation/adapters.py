from rest_framework import serializers

from core.tool_responses import build_normalized_tool_response

from .models import Job, JobExecutionStatus


class JobHandoffQuerySerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=(JobExecutionStatus.READY, JobExecutionStatus.CLAIMED), required=False)
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
        if status := data.get("status"):
            queryset = queryset.filter(status=status)
        if risk_level := data.get("risk_level"):
            queryset = queryset.filter(risk_level=risk_level)
        if approval_status := data.get("approval_status"):
            queryset = queryset.filter(approval_status=approval_status)
        return queryset[: data["limit"] + 1]


class JobHandoffItemSerializer(serializers.ModelSerializer):
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
            "ready_at",
            "ready_by_username",
            "claimed_at",
            "claimed_by_username",
            "payload",
            "updated_at",
        )


class JobHandoffResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    request_id = serializers.CharField()
    query = JobHandoffQuerySerializer()
    summary = serializers.DictField()
    items = JobHandoffItemSerializer(many=True)


def build_job_handoff_response(request, jobs, query):
    items = JobHandoffItemSerializer(jobs, many=True).data
    return build_normalized_tool_response(request, query, items)
