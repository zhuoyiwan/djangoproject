from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AuditLog(TimeStampedModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=128)
    target = models.CharField(max_length=255)
    detail = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.action
