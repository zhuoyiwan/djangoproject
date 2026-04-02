from rest_framework import filters, viewsets

from .models import Job
from .serializers import JobSerializer


class JobViewSet(viewsets.ModelViewSet):
    queryset = Job.objects.order_by("-created_at")
    serializer_class = JobSerializer
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("name", "status")
    ordering_fields = ("created_at", "name", "status")
