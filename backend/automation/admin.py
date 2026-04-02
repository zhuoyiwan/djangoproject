from django.contrib import admin

from .models import Job


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):
    list_display = ("name", "status", "created_at")
    search_fields = ("name", "status")
