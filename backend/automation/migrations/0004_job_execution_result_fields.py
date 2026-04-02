from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("automation", "0003_job_execution_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="job",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="execution_metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="job",
            name="execution_summary",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="job",
            name="failed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="job",
            name="last_reported_by_agent_key",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
