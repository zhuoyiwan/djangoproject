from django.http import JsonResponse
from rest_framework import generics
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .serializers import HealthcheckSerializer


class HealthcheckView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = HealthcheckSerializer

    def get(self, request, *args, **kwargs):
        return Response({"status": "ok", "request_id": getattr(request, "request_id", "")})


def healthcheck(request):
    return JsonResponse({"status": "ok", "request_id": getattr(request, "request_id", "")})
