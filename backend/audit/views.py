from rest_framework import filters, mixins, viewsets

from core.permissions import IsAuditorOrPlatformAdmin

from .models import AuditLog
from .serializers import AuditLogSerializer


class AuditLogViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    queryset = AuditLog.objects.select_related("actor").order_by("-created_at")
    serializer_class = AuditLogSerializer
    permission_classes = [IsAuditorOrPlatformAdmin]
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("action", "target", "actor__username")
    ordering_fields = ("created_at", "action", "target")
