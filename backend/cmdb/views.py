from rest_framework import filters, viewsets

from audit.models import AuditLog

from .models import IDC, Server
from .serializers import IDCSerializer, ServerSerializer


class IDCViewSet(viewsets.ModelViewSet):
    queryset = IDC.objects.order_by("code")
    serializer_class = IDCSerializer
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("code", "name", "location", "status")
    ordering_fields = ("created_at", "code", "name", "status")


class ServerViewSet(viewsets.ModelViewSet):
    queryset = Server.objects.select_related("idc").order_by("-created_at")
    serializer_class = ServerSerializer
    filterset_fields = (
        "hostname",
        "internal_ip",
        "external_ip",
        "idc",
        "environment",
        "lifecycle_status",
        "source",
    )
    search_fields = ("hostname", "internal_ip", "external_ip", "os_version")
    ordering_fields = ("created_at", "hostname", "cpu_cores", "memory_gb", "environment", "lifecycle_status")

    def perform_create(self, serializer):
        server = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="server.created",
            target=f"{server.hostname}@{server.internal_ip}",
            detail={
                "hostname": server.hostname,
                "internal_ip": str(server.internal_ip),
                "environment": server.environment,
                "lifecycle_status": server.lifecycle_status,
            },
        )

    def perform_update(self, serializer):
        server = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="server.updated",
            target=f"{server.hostname}@{server.internal_ip}",
            detail={
                "hostname": server.hostname,
                "internal_ip": str(server.internal_ip),
                "environment": server.environment,
                "lifecycle_status": server.lifecycle_status,
            },
        )
