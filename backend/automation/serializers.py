from rest_framework import serializers

from .models import Job


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = Job
        fields = ("id", "name", "status", "payload", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")
