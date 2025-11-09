# Generated migration for adding invitation fields to JoinRequest model

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('projects', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='joinrequest',
            name='is_invitation',
            field=models.BooleanField(default=False, help_text='True if this is an invitation from owner, False if join request from user'),
        ),
        migrations.AddField(
            model_name='joinrequest',
            name='target_user',
            field=models.ForeignKey(
                blank=True,
                help_text='User being invited (for invitations)',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='received_invitations',
                to=settings.AUTH_USER_MODEL
            ),
        ),
    ]
