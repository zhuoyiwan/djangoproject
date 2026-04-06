from rest_framework import serializers


class DependencyCheckSerializer(serializers.Serializer):
    status = serializers.CharField()
    detail = serializers.CharField(required=False, allow_blank=True)


class FeatureFlagSerializer(serializers.Serializer):
    agent_ingest_enabled = serializers.BooleanField()
    automation_agent_claim_enabled = serializers.BooleanField()
    automation_agent_report_enabled = serializers.BooleanField()


class HealthcheckChecksSerializer(serializers.Serializer):
    database = DependencyCheckSerializer()
    cache = DependencyCheckSerializer()


class HealthcheckSerializer(serializers.Serializer):
    status = serializers.CharField()
    request_id = serializers.CharField()
    checks = HealthcheckChecksSerializer()
    features = FeatureFlagSerializer()


class ServerOverviewSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    online = serializers.IntegerField()
    offline = serializers.IntegerField()
    maintenance = serializers.IntegerField()
    pre_allocated = serializers.IntegerField()


class AutomationOverviewSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    draft = serializers.IntegerField()
    awaiting_approval = serializers.IntegerField()
    ready = serializers.IntegerField()
    claimed = serializers.IntegerField()
    completed = serializers.IntegerField()
    failed = serializers.IntegerField()
    canceled = serializers.IntegerField()
    high_risk_pending = serializers.IntegerField()


class AuditOverviewSerializer(serializers.Serializer):
    total = serializers.IntegerField()
    last_24h = serializers.IntegerField()
    security_events_last_24h = serializers.IntegerField()


class OverviewSummaryPayloadSerializer(serializers.Serializer):
    servers = ServerOverviewSerializer()
    automation = AutomationOverviewSerializer()
    audit = AuditOverviewSerializer()


class OverviewSummarySerializer(serializers.Serializer):
    status = serializers.CharField()
    request_id = serializers.CharField()
    summary = OverviewSummaryPayloadSerializer()
