from django.db import models

from core.models import TimeStampedModel


class Job(TimeStampedModel):
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=32, default="pending")
    payload = models.JSONField(default=dict, blank=True)

    def __str__(self) -> str:
        return self.name
