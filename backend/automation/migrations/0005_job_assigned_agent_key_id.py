from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("automation", "0004_job_execution_result_fields"),
    ]

    operations = [
        migrations.AddField(
            model_name="job",
            name="assigned_agent_key_id",
            field=models.CharField(blank=True, max_length=255),
        ),
    ]
