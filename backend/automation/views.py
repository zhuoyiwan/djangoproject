from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, OpenApiTypes, extend_schema
from rest_framework import filters, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from audit.models import AuditLog
from core.permissions import IsApproverOrPlatformAdmin, IsAuthenticatedReadOnlyOrOps, IsOpsOrPlatformAdmin
from core.throttling import ScopedActionThrottleMixin
from core.tool_responses import build_normalized_tool_response

from .adapters import JobHandoffQuerySerializer, JobHandoffResponseSerializer, build_job_handoff_response
from .models import Job, JobApprovalStatus, JobExecutionStatus, JobRiskLevel
from .serializers import (
    JobApprovalActionSerializer,
    JobExecutionActionSerializer,
    JobSerializer,
    JobToolQueryResponseSerializer,
    JobToolQuerySerializer,
    JobToolResultSerializer,
)


class JobViewSet(ScopedActionThrottleMixin, viewsets.ModelViewSet):
    throttle_scope = "api_read"
    throttle_scope_map = {
        "tool_query": "tool_query",
        "handoff": "handoff",
        "approve": "approval_write",
        "reject": "approval_write",
        "mark_ready": "execution_write",
        "claim": "execution_write",
        "complete": "execution_write",
        "fail": "execution_write",
        "cancel": "execution_write",
    }
    queryset = Job.objects.select_related(
        "approval_requested_by",
        "approved_by",
        "rejected_by",
        "ready_by",
        "claimed_by",
    ).order_by("-created_at")
    serializer_class = JobSerializer
    permission_classes = [IsAuthenticatedReadOnlyOrOps]
    filter_backends = (filters.SearchFilter, filters.OrderingFilter)
    search_fields = ("name", "status", "risk_level", "approval_status")
    ordering_fields = ("created_at", "name", "status", "risk_level", "approval_status")

    def get_permissions(self):
        if self.action in {"approve", "reject"}:
            return [permissions.IsAuthenticated(), IsApproverOrPlatformAdmin()]
        if self.action in {"mark_ready", "claim", "complete", "fail", "cancel"}:
            return [permissions.IsAuthenticated(), IsOpsOrPlatformAdmin()]
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

        serializer.validated_data["ready_by"] = None
        serializer.validated_data["ready_at"] = None
        serializer.validated_data["claimed_by"] = None
        serializer.validated_data["claimed_at"] = None

        if risk_level != JobRiskLevel.HIGH:
            serializer.validated_data["approval_status"] = JobApprovalStatus.NOT_REQUIRED
            serializer.validated_data["status"] = JobExecutionStatus.DRAFT
            serializer.validated_data["approval_requested_by"] = None
            serializer.validated_data["approval_requested_at"] = None
            serializer.validated_data["approved_by"] = None
            serializer.validated_data["approved_at"] = None
            serializer.validated_data["rejected_by"] = None
            serializer.validated_data["rejected_at"] = None
            serializer.validated_data["approval_comment"] = ""
            return False

        serializer.validated_data["approval_status"] = JobApprovalStatus.PENDING
        serializer.validated_data["status"] = JobExecutionStatus.AWAITING_APPROVAL
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
        if serializer.instance.status == JobExecutionStatus.CLAIMED:
            raise ValidationError({"status": ["Claimed jobs cannot be modified."]})
        approval_requested = self._apply_risk_state(serializer)
        job = serializer.save()
        self._audit(
            "automation.job.updated",
            job,
            risk_level=job.risk_level,
            approval_status=job.approval_status,
            status=job.status,
            approval_requested_by=job.approval_requested_by_id,
        )
        if approval_requested:
            self._audit(
                "automation.job.approval_requested",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                approval_requested_by=job.approval_requested_by_id,
            )

    def perform_destroy(self, instance):
        if instance.status == JobExecutionStatus.CLAIMED:
            raise ValidationError({"status": ["Claimed jobs cannot be deleted."]})
        self._audit(
            "automation.job.deleted",
            instance,
            risk_level=instance.risk_level,
            approval_status=instance.approval_status,
            status=instance.status,
        )
        instance.delete()

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
            job.status = JobExecutionStatus.DRAFT
            job.approved_by = request.user
            job.approved_at = now
            job.rejected_by = None
            job.rejected_at = None
            job.ready_by = None
            job.ready_at = None
            job.claimed_by = None
            job.claimed_at = None
            job.save(update_fields=["approval_status", "status", "approved_by", "approved_at", "rejected_by", "rejected_at", "ready_by", "ready_at", "claimed_by", "claimed_at", "approval_comment", "updated_at"])
            self._audit(
                "automation.job.approved",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                approved_by=job.approved_by_id,
                approval_comment=job.approval_comment,
            )
        else:
            job.approval_status = JobApprovalStatus.REJECTED
            job.status = JobExecutionStatus.DRAFT
            job.rejected_by = request.user
            job.rejected_at = now
            job.approved_by = None
            job.approved_at = None
            job.ready_by = None
            job.ready_at = None
            job.claimed_by = None
            job.claimed_at = None
            job.save(update_fields=["approval_status", "status", "rejected_by", "rejected_at", "approved_by", "approved_at", "ready_by", "ready_at", "claimed_by", "claimed_at", "approval_comment", "updated_at"])
            self._audit(
                "automation.job.rejected",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                rejected_by=job.rejected_by_id,
                approval_comment=job.approval_comment,
            )

        return Response(JobSerializer(job).data)

    def _transition_execution(self, request, action_name):
        job = self.get_object()
        serializer = JobExecutionActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = serializer.validated_data.get("comment", "")
        now = timezone.now()

        if action_name == "mark_ready":
            if job.status != JobExecutionStatus.DRAFT:
                raise ValidationError({"status": ["Only draft jobs can be marked ready."]})
            if job.risk_level == JobRiskLevel.HIGH and job.approval_status != JobApprovalStatus.APPROVED:
                raise ValidationError({"approval_status": ["High-risk jobs must be approved before they can be marked ready."]})
            if job.risk_level != JobRiskLevel.HIGH and job.approval_status != JobApprovalStatus.NOT_REQUIRED:
                raise ValidationError({"approval_status": ["Only approval-free draft jobs can be marked ready."]})
            job.status = JobExecutionStatus.READY
            job.ready_by = request.user
            job.ready_at = now
            job.claimed_by = None
            job.claimed_at = None
            job.save(update_fields=["status", "ready_by", "ready_at", "claimed_by", "claimed_at", "updated_at"])
            self._audit(
                "automation.job.ready_marked",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                ready_by=job.ready_by_id,
                comment=comment,
            )
        elif action_name == "claim":
            if job.status != JobExecutionStatus.READY:
                raise ValidationError({"status": ["Only ready jobs can be claimed."]})
            job.status = JobExecutionStatus.CLAIMED
            job.claimed_by = request.user
            job.claimed_at = now
            job.save(update_fields=["status", "claimed_by", "claimed_at", "updated_at"])
            self._audit(
                "automation.job.claimed",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                claimed_by=job.claimed_by_id,
                comment=comment,
            )
        elif action_name == "complete":
            if job.status != JobExecutionStatus.CLAIMED:
                raise ValidationError({"status": ["Only claimed jobs can be completed."]})
            job.status = JobExecutionStatus.COMPLETED
            job.save(update_fields=["status", "updated_at"])
            self._audit(
                "automation.job.completed",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                claimed_by=job.claimed_by_id,
                comment=comment,
            )
        elif action_name == "fail":
            if job.status != JobExecutionStatus.CLAIMED:
                raise ValidationError({"status": ["Only claimed jobs can be failed."]})
            job.status = JobExecutionStatus.FAILED
            job.save(update_fields=["status", "updated_at"])
            self._audit(
                "automation.job.failed",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                claimed_by=job.claimed_by_id,
                comment=comment,
            )
        else:
            if job.status not in {JobExecutionStatus.READY, JobExecutionStatus.CLAIMED}:
                raise ValidationError({"status": ["Only ready or claimed jobs can be canceled."]})
            job.status = JobExecutionStatus.CANCELED
            job.save(update_fields=["status", "updated_at"])
            self._audit(
                "automation.job.canceled",
                job,
                risk_level=job.risk_level,
                approval_status=job.approval_status,
                status=job.status,
                claimed_by=job.claimed_by_id,
                comment=comment,
            )

        return Response(JobSerializer(job).data)

    @extend_schema(
        parameters=[
            OpenApiParameter(name="q", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="name", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="status", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="risk_level", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="approval_status", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="limit", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
        ],
        responses={
            200: JobToolQueryResponseSerializer,
            400: OpenApiResponse(description="Validation error"),
            401: OpenApiResponse(description="Authentication required"),
        },
    )
    @action(detail=False, methods=["get"], url_path="tool-query")
    def tool_query(self, request):
        serializer = JobToolQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        jobs = serializer.filter_queryset(self.get_queryset())
        items = JobToolResultSerializer(jobs, many=True).data
        return build_normalized_tool_response(request, serializer.validated_data, items)

    @extend_schema(
        parameters=[
            OpenApiParameter(name="status", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="risk_level", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="approval_status", type=OpenApiTypes.STR, location=OpenApiParameter.QUERY, required=False),
            OpenApiParameter(name="limit", type=OpenApiTypes.INT, location=OpenApiParameter.QUERY, required=False),
        ],
        responses={
            200: JobHandoffResponseSerializer,
            400: OpenApiResponse(description="Validation error"),
            401: OpenApiResponse(description="Authentication required"),
        },
    )
    @action(detail=False, methods=["get"], url_path="handoff")
    def handoff(self, request):
        serializer = JobHandoffQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        jobs = serializer.filter_queryset(self.get_queryset())
        return build_job_handoff_response(request, jobs, serializer.validated_data)

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

    @extend_schema(
        request=JobExecutionActionSerializer,
        responses={
            200: JobSerializer,
            400: OpenApiResponse(description="Execution state validation error"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=True, methods=["post"], url_path="mark-ready")
    def mark_ready(self, request, pk=None):
        return self._transition_execution(request, "mark_ready")

    @extend_schema(
        request=JobExecutionActionSerializer,
        responses={
            200: JobSerializer,
            400: OpenApiResponse(description="Execution state validation error"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=True, methods=["post"])
    def claim(self, request, pk=None):
        return self._transition_execution(request, "claim")

    @extend_schema(
        request=JobExecutionActionSerializer,
        responses={
            200: JobSerializer,
            400: OpenApiResponse(description="Execution state validation error"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        return self._transition_execution(request, "complete")

    @extend_schema(
        request=JobExecutionActionSerializer,
        responses={
            200: JobSerializer,
            400: OpenApiResponse(description="Execution state validation error"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=True, methods=["post"])
    def fail(self, request, pk=None):
        return self._transition_execution(request, "fail")

    @extend_schema(
        request=JobExecutionActionSerializer,
        responses={
            200: JobSerializer,
            400: OpenApiResponse(description="Execution state validation error"),
            403: OpenApiResponse(description="Forbidden"),
        },
    )
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        return self._transition_execution(request, "cancel")
