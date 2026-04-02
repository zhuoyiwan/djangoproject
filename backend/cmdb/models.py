from django.db import models

from core.models import TimeStampedModel


class IDCStatus(models.TextChoices):
    ACTIVE = "active", "active"
    MAINTENANCE = "maintenance", "maintenance"
    INACTIVE = "inactive", "inactive"


class ServerLifecycleStatus(models.TextChoices):
    ONLINE = "online", "online"
    OFFLINE = "offline", "offline"
    MAINTENANCE = "maintenance", "maintenance"
    PRE_ALLOCATED = "pre_allocated", "pre_allocated"


class EnvironmentType(models.TextChoices):
    DEV = "dev", "dev"
    TEST = "test", "test"
    PROD = "prod", "prod"


class DataSourceType(models.TextChoices):
    MANUAL = "manual", "manual"
    AGENT = "agent", "agent"
    API = "api", "api"


class IDC(TimeStampedModel):
    code = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True)
    status = models.CharField(max_length=32, choices=IDCStatus.choices, default=IDCStatus.ACTIVE)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"{self.code} ({self.name})"


class Server(TimeStampedModel):
    hostname = models.CharField(max_length=255)
    internal_ip = models.GenericIPAddressField(protocol="IPv4")
    external_ip = models.GenericIPAddressField(protocol="IPv4", null=True, blank=True)
    os_version = models.CharField(max_length=255)
    cpu_cores = models.PositiveIntegerField()
    memory_gb = models.DecimalField(max_digits=8, decimal_places=2)
    disk_summary = models.TextField(blank=True)
    lifecycle_status = models.CharField(
        max_length=32,
        choices=ServerLifecycleStatus.choices,
        default=ServerLifecycleStatus.ONLINE,
    )
    environment = models.CharField(max_length=16, choices=EnvironmentType.choices, default=EnvironmentType.DEV)
    idc = models.ForeignKey(IDC, on_delete=models.PROTECT, related_name="servers")
    source = models.CharField(max_length=32, choices=DataSourceType.choices, default=DataSourceType.MANUAL)
    last_seen_at = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["hostname", "internal_ip"], name="uniq_server_hostname_internal_ip"),
        ]

    def __str__(self) -> str:
        return f"{self.hostname} ({self.internal_ip})"
