from django.urls import include, path
from rest_framework.routers import DefaultRouter

from accounts.views import UserViewSet
from audit.views import AuditLogViewSet
from cmdb.views import IDCViewSet, ServerViewSet
from core.views import AgentRunnerOverviewView, ContractWorkbenchView, HealthcheckView, OverviewSummaryView
from automation.views import JobViewSet

router = DefaultRouter()
router.register("users", UserViewSet, basename="user")
router.register("cmdb/idcs", IDCViewSet, basename="idc")
router.register("cmdb/servers", ServerViewSet, basename="server")
router.register("audit/logs", AuditLogViewSet, basename="audit-log")
router.register("automation/jobs", JobViewSet, basename="job")

urlpatterns = [
    path("auth/", include("accounts.urls")),
    path("health/", HealthcheckView.as_view(), name="api-healthcheck"),
    path("overview/summary/", OverviewSummaryView.as_view(), name="api-overview-summary"),
    path("agents/runners/", AgentRunnerOverviewView.as_view(), name="api-agent-runner-overview"),
    path("contract/workbench/", ContractWorkbenchView.as_view(), name="api-contract-workbench"),
    path("", include(router.urls)),
]
