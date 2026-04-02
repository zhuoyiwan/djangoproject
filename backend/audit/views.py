from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import filters, mixins, viewsets
from rest_framework.decorators import action

from core.permissions import IsAuditorOrPlatformAdmin
from core.throttling import ScopedActionThrottleMixin
from core.tool_responses import build_normalized_tool_response

from .models import AuditLog
from .serializers import (
    AuditLogSerializer,
    AuditLogToolQueryResponseSerializer,
    AuditLogToolQuerySerializer,
    AuditLogToolResultSerializer,
)


class AuditLogViewSet(ScopedActionThrottleMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.select_related("actor").order_by("-created_at")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuditorOrPlatformAdmin]
    throttle_scope = "audit_read"
    throttle_scope_map = {"tool_query": "tool_query"}
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("action", "target", "actor__username")
    ordering_fields = ("created_at", "action", "target")

    @extend_schema(
        parameters=[
            OpenApiParameter(name="q", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="action", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="target", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="actor_username", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="detail_reason", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="detail_path", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="detail_status_code", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="limit", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
        ],
        responses={
            200: AuditLogToolQueryResponseSerializer,
            400: OpenApiResponse(description="Validation error"),
            401: OpenApiResponse(description="Authentication required"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=False, methods=["get"], url_path="tool-query")
    def tool_query(self, request):
        serializer = AuditLogToolQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        entries = serializer.filter_queryset(self.get_queryset())
        items = AuditLogToolResultSerializer(entries, many=True).data
        return build_normalized_tool_response(request, serializer.validated_data, items)
