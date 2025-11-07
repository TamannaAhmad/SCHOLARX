from django.db import migrations, models
import django.utils.timezone
import django.db.models.deletion
from django.conf import settings

class Migration(migrations.Migration):
    initial = True

    dependencies = [
        ('accounts', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Project',
            fields=[
                ('project_id', models.AutoField(primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, null=True)),
                ('project_type', models.CharField(blank=True, max_length=50, null=True)),
                ('max_team_size', models.IntegerField(null=True)),
                ('current_team_size', models.IntegerField(default=1)),
                ('deadline', models.DateField(blank=True, null=True)),
                ('status', models.CharField(
                    choices=[
                        ('planning', 'Planning'), 
                        ('active', 'Active'), 
                        ('completed', 'Completed'), 
                        ('cancelled', 'Cancelled')
                    ], 
                    default='active', 
                    max_length=20
                )),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('updated_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    related_name='created_projects', 
                    to=settings.AUTH_USER_MODEL
                )),
            ],
            options={
                'db_table': 'projects',
                'verbose_name_plural': 'Projects',
            },
        ),
        migrations.CreateModel(
            name='Meeting',
            fields=[
                ('id', models.AutoField(primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, null=True)),
                ('meeting_link', models.TextField(blank=True, null=True)),
                ('scheduled_time', models.DateTimeField()),
                ('duration_minutes', models.IntegerField()),
                ('status', models.CharField(
                    choices=[
                        ('scheduled', 'Scheduled'), 
                        ('completed', 'Completed'), 
                        ('cancelled', 'Cancelled')
                    ], 
                    default='scheduled', 
                    max_length=20
                )),
                ('created_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to='projects.Project'
                )),
                ('created_by', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to=settings.AUTH_USER_MODEL
                )),
            ],
            options={
                'db_table': 'meetings',
                'verbose_name_plural': 'Meetings',
            },
        ),
        migrations.CreateModel(
            name='TeamMember',
            fields=[
                ('id', models.AutoField(primary_key=True, serialize=False)),
                ('joined_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to='projects.Project'
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to='accounts.UserProfile'
                )),
            ],
            options={
                'db_table': 'team_members',
                'unique_together': {('project', 'user')},
            },
        ),
        migrations.CreateModel(
            name='ProjectSkill',
            fields=[
                ('id', models.AutoField(primary_key=True, serialize=False)),
                ('project', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to='projects.Project'
                )),
                ('skill', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to='accounts.Skill'
                )),
            ],
            options={
                'db_table': 'project_skills',
                'unique_together': {('project', 'skill')},
            },
        ),
        migrations.CreateModel(
            name='MeetingAttendee',
            fields=[
                ('id', models.AutoField(primary_key=True, serialize=False)),
                ('response_status', models.CharField(
                    choices=[
                        ('accepted', 'Accepted'), 
                        ('declined', 'Declined'), 
                        ('pending', 'Pending'), 
                        ('tentative', 'Tentative')
                    ], 
                    default='pending', 
                    max_length=20
                )),
                ('meeting', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to='projects.Meeting'
                )),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE, 
                    to='accounts.UserProfile'
                )),
            ],
            options={
                'db_table': 'meeting_attendees',
                'unique_together': {('meeting', 'user')},
            },
        ),
    ]