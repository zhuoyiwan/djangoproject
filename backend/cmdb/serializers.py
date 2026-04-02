from rest_framework import serializers

from .models import IDC, Server


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
