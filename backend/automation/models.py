from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class JobRiskLevel(models.TextChoices):
    LOW = "low", "Low"
    MEDIUM = "medium", "Medium"
    HIGH = "high", "High"


class JobApprovalStatus(models.TextChoices):
    NOT_REQUIRED = "not_required", "Not required"
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"


class JobExecutionStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    AWAITING_APPROVAL = "awaiting_approval", "Awaiting approval"
    READY = "ready", "Ready"
    CLAIMED = "claimed", "Claimed"
    COMPLETED = "completed", "Completed"
    FAILED = "failed", "Failed"
    CANCELED = "canceled", "Canceled"


class Job(TimeStampedModel):
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=32, choices=JobExecutionStatus.choices, default=JobExecutionStatus.DRAFT)
    risk_level = models.CharField(max_length=16, choices=JobRiskLevel.choices, default=JobRiskLevel.LOW)
    approval_status = models.CharField(
        max_length=32,
        choices=JobApprovalStatus.choices,
        default=JobApprovalStatus.NOT_REQUIRED,
    )
    execution_summary = models.TextField(blank=True)
    execution_metadata = models.JSONField(default=dict, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    last_reported_by_agent_key = models.CharField(max_length=255, blank=True)
    approval_requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="requested_automation_job_approvals",
    )
    approval_requested_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_automation_jobs",
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="rejected_automation_jobs",
    )
    rejected_at = models.DateTimeField(null=True, blank=True)
    ready_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="readied_automation_jobs",
    )
    ready_at = models.DateTimeField(null=True, blank=True)
    claimed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="claimed_automation_jobs",
    )
    claimed_at = models.DateTimeField(null=True, blank=True)
    approval_comment = models.TextField(blank=True)
    payload = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.name
