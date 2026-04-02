from django.contrib import admin

from .models import IDC, Server


@admin.register(IDC)
class IDCAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "location", "status", "created_at")
    search_fields = ("code", "name", "location")
    list_filter = ("status",)


@admin.register(Server)
class ServerAdmin(admin.ModelAdmin):
    list_display = (
        "hostname",
        "internal_ip",
        "environment",
        "lifecycle_status",
        "idc",
        "source",
        "created_at",
    )
    search_fields = ("hostname", "internal_ip", "external_ip", "os_version")
    list_filter = ("environment", "lifecycle_status", "source", "idc")
