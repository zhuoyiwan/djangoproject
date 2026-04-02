from decimal import Decimal

from django.db.models import Q
from django.utils import timezone
from rest_framework import serializers

from .models import DataSourceType, IDC, Server


class IDCToolQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=False, max_length=255)
    code = serializers.CharField(required=False, allow_blank=False, max_length=64)
    name = serializers.CharField(required=False, allow_blank=False, max_length=255)
    location = serializers.CharField(required=False, allow_blank=False, max_length=255)
    status = serializers.ChoiceField(choices=IDC._meta.get_field("status").choices, required=False)
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
                Q(code__icontains=q)
                | Q(name__icontains=q)
                | Q(location__icontains=q)
                | Q(status__icontains=q)
            )
        if code := data.get("code"):
            queryset = queryset.filter(code=code)
        if name := data.get("name"):
            queryset = queryset.filter(name=name)
        if location := data.get("location"):
            queryset = queryset.filter(location__icontains=location)
        if status := data.get("status"):
            queryset = queryset.filter(status=status)
        return queryset[: data["limit"]]


class IDCToolResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = IDC
        fields = (
            "id",
            "code",
            "name",
            "location",
            "status",
            "description",
            "created_at",
            "updated_at",
        )


class IDCToolQueryResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    request_id = serializers.CharField()
    query = IDCToolQuerySerializer()
    summary = serializers.DictField()
    items = IDCToolResultSerializer(many=True)




class IDCSerializer(serializers.ModelSerializer):
    class Meta:
        model = IDC
        fields = ("id", "code", "name", "location", "status", "description", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ServerSerializer(serializers.ModelSerializer):
    idc_name = serializers.CharField(source="idc.name", read_only=True)

    class Meta:
        model = Server
        fields = (
            "id",
            "hostname",
            "internal_ip",
            "external_ip",
            "os_version",
            "cpu_cores",
            "memory_gb",
            "disk_summary",
            "lifecycle_status",
            "environment",
            "idc",
            "idc_name",
            "source",
            "last_seen_at",
            "metadata",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class AgentServerIngestSerializer(serializers.Serializer):
    hostname = serializers.CharField(max_length=255)
    internal_ip = serializers.IPAddressField(protocol="IPv4")
    external_ip = serializers.IPAddressField(protocol="IPv4", required=False, allow_null=True)
    os_version = serializers.CharField(max_length=255)
    cpu_cores = serializers.IntegerField(min_value=1)
    memory_gb = serializers.DecimalField(max_digits=8, decimal_places=2, min_value=Decimal("0"))
    disk_summary = serializers.CharField(required=False, allow_blank=True)
    lifecycle_status = serializers.ChoiceField(choices=Server._meta.get_field("lifecycle_status").choices)
    environment = serializers.ChoiceField(choices=Server._meta.get_field("environment").choices)
    idc_code = serializers.CharField(max_length=64)
    last_seen_at = serializers.DateTimeField(required=False)
    metadata = serializers.JSONField(required=False)

    def validate_idc_code(self, value):
        code = value.strip()
        try:
            idc = IDC.objects.get(code=code)
        except IDC.DoesNotExist as exc:
            raise serializers.ValidationError("IDC code does not exist.") from exc
        return idc

    def create_or_update(self):
        idc = self.validated_data["idc_code"]
        last_seen_at = self.validated_data.get("last_seen_at") or timezone.now()
        defaults = {
            "external_ip": self.validated_data.get("external_ip"),
            "os_version": self.validated_data["os_version"],
            "cpu_cores": self.validated_data["cpu_cores"],
            "memory_gb": self.validated_data["memory_gb"],
            "disk_summary": self.validated_data.get("disk_summary", ""),
            "lifecycle_status": self.validated_data["lifecycle_status"],
            "environment": self.validated_data["environment"],
            "idc": idc,
            "source": DataSourceType.AGENT,
            "last_seen_at": last_seen_at,
            "metadata": self.validated_data.get("metadata", {}),
        }
        return Server.objects.update_or_create(
            hostname=self.validated_data["hostname"],
            internal_ip=self.validated_data["internal_ip"],
            defaults=defaults,
        )


class AgentIngestResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    result = serializers.ChoiceField(choices=("created", "updated"))
    request_id = serializers.CharField()
    server = ServerSerializer()


class ServerToolQuerySerializer(serializers.Serializer):
    q = serializers.CharField(required=False, allow_blank=False, max_length=255)
    hostname = serializers.CharField(required=False, allow_blank=False, max_length=255)
    internal_ip = serializers.IPAddressField(protocol="IPv4", required=False)
    environment = serializers.ChoiceField(choices=Server._meta.get_field("environment").choices, required=False)
    lifecycle_status = serializers.ChoiceField(choices=Server._meta.get_field("lifecycle_status").choices, required=False)
    idc_code = serializers.CharField(required=False, allow_blank=False, max_length=64)
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
                Q(hostname__icontains=q)
                | Q(internal_ip__icontains=q)
                | Q(external_ip__icontains=q)
                | Q(os_version__icontains=q)
                | Q(idc__code__icontains=q)
                | Q(idc__name__icontains=q)
            )
        if hostname := data.get("hostname"):
            queryset = queryset.filter(hostname=hostname)
        if internal_ip := data.get("internal_ip"):
            queryset = queryset.filter(internal_ip=internal_ip)
        if environment := data.get("environment"):
            queryset = queryset.filter(environment=environment)
        if lifecycle_status := data.get("lifecycle_status"):
            queryset = queryset.filter(lifecycle_status=lifecycle_status)
        if idc_code := data.get("idc_code"):
            queryset = queryset.filter(idc__code=idc_code)
        return queryset[: data["limit"]]


class ServerToolResultSerializer(serializers.ModelSerializer):
    idc_code = serializers.CharField(source="idc.code", read_only=True)
    idc_name = serializers.CharField(source="idc.name", read_only=True)

    class Meta:
        model = Server
        fields = (
            "id",
            "hostname",
            "internal_ip",
            "external_ip",
            "environment",
            "lifecycle_status",
            "source",
            "os_version",
            "idc_code",
            "idc_name",
            "last_seen_at",
        )


class ServerToolQueryResponseSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    request_id = serializers.CharField()
    query = ServerToolQuerySerializer()
    summary = serializers.DictField()
    items = ServerToolResultSerializer(many=True)

