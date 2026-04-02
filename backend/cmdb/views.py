from drf_spectacular.utils import OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from audit.models import AuditLog
from core.permissions import IsAuthenticatedReadOnlyOrOps

from .authentication import AgentHMACAuthentication
from .models import IDC, Server
from .serializers import AgentIngestResponseSerializer, AgentServerIngestSerializer, IDCSerializer, ServerSerializer


class IDCViewSet(viewsets.ModelViewSet):
    queryset = IDC.objects.order_by("code")
    serializer_class = IDCSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrOps]
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("code", "name", "location", "status")
    ordering_fields = ("created_at", "code", "name", "status")


class ServerViewSet(viewsets.ModelViewSet):
    queryset = Server.objects.select_related("idc").order_by("-created_at")
    serializer_class = ServerSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrOps]
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

    @extend_schema(
        request=AgentServerIngestSerializer,
        responses={
            201: AgentIngestResponseSerializer,
            200: AgentIngestResponseSerializer,
            400: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Validation error"),
            401: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Authentication/signature error"),
        },
    )
    @action(
        detail=False,
        methods=["post"],
        url_path="agent-ingest",
        authentication_classes=[AgentHMACAuthentication],
        permission_classes=[permissions.IsAuthenticated],
    )
    def agent_ingest(self, request):
        serializer = AgentServerIngestSerializer(data=request.data)
        if not serializer.is_valid():
            AuditLog.objects.create(
                actor=None,
                action="server.agent_ingest.rejected",
                target=f"agent:{getattr(request, 'agent_key_id', 'unknown')}",
                detail={
                    "reason": "validation_error",
                    "errors": serializer.errors,
                    "request_id": getattr(request, "request_id", ""),
                },
            )
            serializer.is_valid(raise_exception=True)

        server, created = serializer.create_or_update()
        AuditLog.objects.create(
            actor=None,
            action="server.agent_ingested",
            target=f"{server.hostname}@{server.internal_ip}",
            detail={
                "result": "created" if created else "updated",
                "request_id": getattr(request, "request_id", ""),
                "agent_key_id": getattr(request, "agent_key_id", "unknown"),
                "environment": server.environment,
                "lifecycle_status": server.lifecycle_status,
            },
        )

        response_data = {
            "ok": True,
            "result": "created" if created else "updated",
            "request_id": getattr(request, "request_id", ""),
            "server": ServerSerializer(server).data,
        }
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response(response_data, status=response_status)
