from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("automation", "0005_job_assigned_agent_key_id"),
    ]

    operations = [
        migrations.AlterField(
            model_name="job",
            name="assigned_agent_key_id",
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
        migrations.AlterField(
            model_name="job",
            name="last_reported_by_agent_key",
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
    ]
