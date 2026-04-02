from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from core.permissions import IsPlatformAdmin
from core.throttling import DynamicScopedRateThrottle, ScopedActionThrottleMixin

from .serializers import RegisterSerializer, UserSerializer


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"


class LoginView(TokenObtainPairView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"


class RefreshView(TokenRefreshView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [DynamicScopedRateThrottle]
    throttle_scope = "auth"


class UserViewSet(ScopedActionThrottleMixin, viewsets.ReadOnlyModelViewSet):
    throttle_scope = "api_read"
    serializer_class = UserSerializer
    queryset = get_user_model().objects.order_by("id")

    def get_permissions(self):
        if self.action == "me":
            return [permissions.IsAuthenticated()]
        return [IsPlatformAdmin()]

    @action(detail=False, methods=["get"])
    def me(self, request):
        serializer = self.get_serializer(request.user)
        return Response(serializer.data)
