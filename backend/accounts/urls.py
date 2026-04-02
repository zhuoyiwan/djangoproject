from django.urls import path

from .views import LoginView, RefreshView, RegisterView, UserViewSet

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("refresh/", RefreshView.as_view(), name="token_refresh"),
    path("me/", UserViewSet.as_view({"get": "me"}), name="me"),
]
