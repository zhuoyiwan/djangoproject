from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("automation", "0002_job_approval_fields"),
    ]

    operations = [
        migrations.AlterField(
            model_name="job",
            name="status",
            field=models.CharField(
                choices=[
                    ("draft", "Draft"),
                    ("awaiting_approval", "Awaiting approval"),
                    ("ready", "Ready"),
                    ("claimed", "Claimed"),
                    ("completed", "Completed"),
                    ("failed", "Failed"),
                    ("canceled", "Canceled"),
                ],
                default="draft",
                max_length=32,
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="ready_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="claimed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="ready_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="readied_automation_jobs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="job",
            name="claimed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=models.SET_NULL,
                related_name="claimed_automation_jobs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunSQL(
            sql=(
                "UPDATE automation_job SET status = CASE "
                "WHEN approval_status = 'pending' THEN 'awaiting_approval' "
                "ELSE 'draft' END"
            ),
            reverse_sql=(
                "UPDATE automation_job SET status = CASE "
                "WHEN status = 'awaiting_approval' THEN 'pending' "
                "ELSE 'pending' END"
            ),
        ),
    ]
