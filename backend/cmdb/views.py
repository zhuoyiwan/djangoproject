from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import filters, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from audit.models import AuditLog
from core.permissions import IsAuthenticatedReadOnlyOrOps
from core.throttling import ScopedActionThrottleMixin
from core.tool_responses import build_normalized_tool_response

from .authentication import AgentHMACAuthentication
from .models import IDC, Server
from .serializers import (
    AgentIngestResponseSerializer,
    AgentServerIngestSerializer,
    IDCSerializer,
    IDCToolQueryResponseSerializer,
    IDCToolQuerySerializer,
    IDCToolResultSerializer,
    ServerSerializer,
    ServerToolQueryResponseSerializer,
    ServerToolQuerySerializer,
    ServerToolResultSerializer,
)


class IDCViewSet(ScopedActionThrottleMixin, viewsets.ModelViewSet):
    queryset = IDC.objects.order_by("code")
    serializer_class = IDCSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrOps]
    throttle_scope = "api_read"
    throttle_scope_map = {"tool_query": "tool_query"}
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("code", "name", "location", "status")
    ordering_fields = ("created_at", "code", "name", "status")

    def perform_create(self, serializer):
        idc = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="idc.created",
            target=f"idc:{idc.code}",
            detail={
                "request_id": getattr(self.request, "request_id", ""),
                "code": idc.code,
                "name": idc.name,
                "status": idc.status,
            },
        )

    def perform_update(self, serializer):
        idc = serializer.save()
        AuditLog.objects.create(
            actor=self.request.user,
            action="idc.updated",
            target=f"idc:{idc.code}",
            detail={
                "request_id": getattr(self.request, "request_id", ""),
                "code": idc.code,
                "name": idc.name,
                "status": idc.status,
            },
        )

    def perform_destroy(self, instance):
        AuditLog.objects.create(
            actor=self.request.user,
            action="idc.deleted",
            target=f"idc:{instance.code}",
            detail={
                "request_id": getattr(self.request, "request_id", ""),
                "code": instance.code,
                "name": instance.name,
                "status": instance.status,
            },
        )
        instance.delete()

    @extend_schema(
        parameters=[
            OpenApiParameter(name="q", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="code", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="name", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="location", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="status", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="limit", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
        ],
        responses={
            200: IDCToolQueryResponseSerializer,
            400: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Validation error"),
            401: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Authentication required"),
        },
    )
    @action(detail=False, methods=["get"], url_path="tool-query")
    def tool_query(self, request):
        serializer = IDCToolQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        idcs = serializer.filter_queryset(self.get_queryset())
        items = IDCToolResultSerializer(idcs, many=True).data
        return build_normalized_tool_response(request, serializer.validated_data, items)


class ServerViewSet(ScopedActionThrottleMixin, viewsets.ModelViewSet):
    queryset = Server.objects.select_related("idc").order_by("-created_at")
    serializer_class = ServerSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrOps]
    throttle_scope = "api_read"
    throttle_scope_map = {"tool_query": "tool_query", "agent_ingest": "agent_ingest"}
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
                "request_id": getattr(self.request, "request_id", ""),
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
                "request_id": getattr(self.request, "request_id", ""),
                "hostname": server.hostname,
                "internal_ip": str(server.internal_ip),
                "environment": server.environment,
                "lifecycle_status": server.lifecycle_status,
            },
        )

    def perform_destroy(self, instance):
        AuditLog.objects.create(
            actor=self.request.user,
            action="server.deleted",
            target=f"{instance.hostname}@{instance.internal_ip}",
            detail={
                "request_id": getattr(self.request, "request_id", ""),
                "hostname": instance.hostname,
                "internal_ip": str(instance.internal_ip),
                "environment": instance.environment,
                "lifecycle_status": instance.lifecycle_status,
            },
        )
        instance.delete()

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

    @extend_schema(
        parameters=[
            OpenApiParameter(name="q", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="hostname", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="internal_ip", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="environment", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="lifecycle_status", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="idc_code", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="limit", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
        ],
        responses={
            200: ServerToolQueryResponseSerializer,
            400: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Validation error"),
            401: OpenApiResponse(response=OpenApiTypes.OBJECT, description="Authentication required"),
        },
    )
    @action(detail=False, methods=["get"], url_path="tool-query")
    def tool_query(self, request):
        serializer = ServerToolQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        servers = serializer.filter_queryset(self.get_queryset())
        items = ServerToolResultSerializer(servers, many=True).data
        return build_normalized_tool_response(request, serializer.validated_data, items)
