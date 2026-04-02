from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("automation", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="job",
            name="approval_comment",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="job",
            name="approval_requested_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="approval_status",
            field=models.CharField(
                choices=[
                    ("not_required", "Not required"),
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("rejected", "Rejected"),
                ],
                default="not_required",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="approved_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="rejected_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="risk_level",
            field=models.CharField(
                choices=[("low", "Low"), ("medium", "Medium"), ("high", "High")],
                default="low",
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="approval_requested_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="requested_automation_job_approvals",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="approved_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="approved_automation_jobs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="rejected_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="rejected_automation_jobs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
