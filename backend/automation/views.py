from django.utils import timezone
from drf_spectacular.utils import OpenApiResponse, extend_schema
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from audit.models import AuditLog
from core.permissions import IsApproverOrPlatformAdmin, IsAuthenticatedReadOnlyOrOps

from .models import Job, JobApprovalStatus, JobRiskLevel
from .serializers import JobApprovalActionSerializer, JobSerializer


class JobViewSet(viewsets.ModelViewSet):
    queryset = Job.objects.select_related(
        "approval_requested_by",
        "approved_by",
        "rejected_by",
    ).order_by("-created_at")
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrOps]
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("name", "status", "risk_level", "approval_status")
    ordering_fields = ("created_at", "name", "status", "risk_level", "approval_status")

    def get_permissions(self):
        if self.action in {"approve", "reject"}:
            return [permissions.IsAuthenticated(), IsApproverOrPlatformAdmin()]
        return [permission() for permission in self.permission_classes]

    def _request_id(self):
        return getattr(self.request, "request_id", "")

    def _job_target(self, job):
        return f"job:{job.id}:{job.name}"

    def _audit(self, action, job, **detail):
        AuditLog.objects.create(
            actor=self.request.user,
            action=action,
            target=self._job_target(job),
            detail={"request_id": self._request_id(), **detail},
        )

    def _apply_risk_state(self, serializer):
        job = serializer.instance
        risk_level = serializer.validated_data.get(
            "risk_level",
            job.risk_level if job else JobRiskLevel.LOW,
        )
        now = timezone.now()

        if risk_level != JobRiskLevel.HIGH:
            serializer.validated_data["approval_status"] = JobApprovalStatus.NOT_REQUIRED
            serializer.validated_data["approval_requested_by"] = None
            serializer.validated_data["approval_requested_at"] = None
            serializer.validated_data["approved_by"] = None
            serializer.validated_data["approved_at"] = None
            serializer.validated_data["rejected_by"] = None
            serializer.validated_data["rejected_at"] = None
            serializer.validated_data["approval_comment"] = ""
            return False

        serializer.validated_data["approval_status"] = JobApprovalStatus.PENDING
        serializer.validated_data["approval_requested_by"] = self.request.user
        serializer.validated_data["approval_requested_at"] = now
        serializer.validated_data["approved_by"] = None
        serializer.validated_data["approved_at"] = None
        serializer.validated_data["rejected_by"] = None
        serializer.validated_data["rejected_at"] = None
        serializer.validated_data["approval_comment"] = ""
        return not job or job.approval_status != JobApprovalStatus.PENDING

    def perform_create(self, serializer):
        approval_requested = self._apply_risk_state(serializer)
        job = serializer.save()
        self._audit(
            "automation.job.created",
            job,
            risk_level=job.risk_level,
            approval_status=job.approval_status,
            approval_requested_by=job.approval_requested_by_id,
        )
        if approval_requested:
            self._audit(
                "automation.job.approval_requested",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                approval_requested_by=job.approval_requested_by_id,
            )

    def perform_update(self, serializer):
        approval_requested = self._apply_risk_state(serializer)
        job = serializer.save()
        self._audit(
            "automation.job.updated",
            job,
            risk_level=job.risk_level,
            approval_status=job.approval_status,
            approval_requested_by=job.approval_requested_by_id,
        )
        if approval_requested:
            self._audit(
                "automation.job.approval_requested",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                approval_requested_by=job.approval_requested_by_id,
            )

    def _transition_approval(self, request, pk, approved):
        job = self.get_object()
        if job.approval_status != JobApprovalStatus.PENDING:
            raise ValidationError({"approval_status": ["Job approval is not pending."]})
        if job.approval_requested_by_id == request.user.id:
            raise PermissionDenied("Requesters cannot approve or reject their own job.")

        serializer = JobApprovalActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.validated_data.get("comment", "")
        now = timezone.now()

        job.approval_comment = comment
        if approved:
            job.approval_status = JobApprovalStatus.APPROVED
            job.approved_by = request.user
            job.approved_at = now
            job.rejected_by = None
            job.rejected_at = None
            job.save(update_fields=["approval_status", "approved_by", "approved_at", "rejected_by", "rejected_at", "approval_comment", "updated_at"])
            self._audit(
                "automation.job.approved",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                approved_by=job.approved_by_id,
                approval_comment=job.approval_comment,
            )
        else:
            job.approval_status = JobApprovalStatus.REJECTED
            job.rejected_by = request.user
            job.rejected_at = now
            job.approved_by = None
            job.approved_at = None
            job.save(update_fields=["approval_status", "rejected_by", "rejected_at", "approved_by", "approved_at", "approval_comment", "updated_at"])
            self._audit(
                "automation.job.rejected",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                rejected_by=job.rejected_by_id,
                approval_comment=job.approval_comment,
            )

        return Response(JobSerializer(job).data)

    @extend_schema(
        request=JobApprovalActionSerializer,
        responses={
            200: JobSerializer,
            400: OpenApiResponse(description="Approval state validation error"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        return self._transition_approval(request, pk, approved=True)

    @extend_schema(
        request=JobApprovalActionSerializer,
        responses={
            200: JobSerializer,
            400: OpenApiResponse(description="Approval state validation error"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        return self._transition_approval(request, pk, approved=False)
