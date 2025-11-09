from django.db import models, IntegrityError
from django.utils import timezone
from django.conf import settings
from django.core.exceptions import ValidationError
from accounts.models import UserProfile, Skill

class Project(models.Model):
    PROJECT_STATUS_CHOICES = [
        ('planning', 'Planning'),
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled')
    ]

    project_id = models.AutoField(primary_key=True)
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    project_type = models.CharField(max_length=50, null=True, blank=True)
    max_team_size = models.IntegerField(null=True)
    current_team_size = models.IntegerField(default=1)
    deadline = models.DateField(null=True, blank=True)
    status = models.CharField(
        max_length=20, 
        choices=PROJECT_STATUS_CHOICES, 
        default='active'
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_projects')
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(default=timezone.now)

    def save(self, *args, **kwargs):
        self.updated_at = timezone.now()
        return super().save(*args, **kwargs)

    class Meta:
        db_table = 'projects'
        verbose_name_plural = 'Projects'

class ProjectSkill(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    skill = models.ForeignKey(Skill, on_delete=models.CASCADE)

    class Meta:
        db_table = 'project_skills'
        unique_together = ('project', 'skill')

class TeamMember(models.Model):
    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'team_members'
        unique_together = ('project', 'user')

class Meeting(models.Model):
    MEETING_STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled')
    ]

    project = models.ForeignKey(Project, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    meeting_link = models.TextField(null=True, blank=True)
    scheduled_time = models.DateTimeField()
    duration_minutes = models.IntegerField()
    status = models.CharField(
        max_length=20, 
        choices=MEETING_STATUS_CHOICES, 
        default='scheduled'
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'meetings'
        verbose_name_plural = 'Meetings'

class MeetingAttendee(models.Model):
    RESPONSE_STATUS_CHOICES = [
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('pending', 'Pending'),
        ('tentative', 'Tentative')
    ]

    meeting = models.ForeignKey(Meeting, on_delete=models.CASCADE)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    response_status = models.CharField(
        max_length=20, 
        choices=RESPONSE_STATUS_CHOICES, 
        default='pending'
    )

    class Meta:
        db_table = 'meeting_attendees'
        unique_together = ('meeting', 'user')

# Study Groups

class StudyGroup(models.Model):
    group_id = models.AutoField(primary_key=True)
    name = models.CharField(max_length=255)
    description = models.TextField(null=True, blank=True)
    course_code = models.CharField(max_length=20, null=True, blank=True)
    subject_area = models.CharField(max_length=100)
    topics = models.TextField(null=True, blank=True, help_text="Comma-separated list of topics")
    max_size = models.IntegerField(default=10)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='created_study_groups')
    created_at = models.DateTimeField(default=timezone.now)

    def save(self, *args, **kwargs):
        # Save the study group first
        super().save(*args, **kwargs)
        
        # Automatically add creator to study group members if not already added
        StudyGroupMember.objects.get_or_create(
            group=self,
            user=self.created_by
        )

    class Meta:
        db_table = 'study_groups'
        verbose_name_plural = 'Study Groups'


class StudyGroupMember(models.Model):
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    joined_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'study_group_members'
        unique_together = ('group', 'user')


# Join Request Model
class JoinRequest(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('approved', 'Approved'),
        ('rejected', 'Rejected'),
    ]
    
    REQUEST_TYPE_CHOICES = [
        ('project', 'Project'),
        ('study_group', 'Study Group'),
    ]

    request_id = models.AutoField(primary_key=True)
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='join_requests')
    target_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name='received_invitations', help_text='User being invited (for invitations)')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name='join_requests')
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, null=True, blank=True, related_name='join_requests')
    request_type = models.CharField(max_length=20, choices=REQUEST_TYPE_CHOICES)
    message = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    is_invitation = models.BooleanField(default=False, help_text='True if this is an invitation from owner, False if join request from user')
    is_read = models.BooleanField(default=False)
    requested_time = models.DateTimeField(default=timezone.now, help_text='When the request was made')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'join_requests'
        indexes = [
            models.Index(fields=['requester', 'status']),
            models.Index(fields=['project', 'status']),
            models.Index(fields=['group', 'status']),
            models.Index(fields=['created_at']),  # New index for better querying by request time
        ]

    def clean(self):
        from django.core.exceptions import ValidationError
        # Ensure either project or group is set, but not both
        if not self.project and not self.group:
            raise ValidationError('Either project or group must be specified.')
        if self.project and self.group:
            raise ValidationError('Cannot specify both project and group.')
        # Set request_type based on what's set
        if self.project:
            self.request_type = 'project'
        elif self.group:
            self.request_type = 'study_group'

    def save(self, *args, **kwargs):
        self.clean()
        super().save(*args, **kwargs)


class InviteRequest(models.Model):
    """Model to track project/study group invitations sent by owners to users."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('declined', 'Declined'),
        ('expired', 'Expired'),
    ]
    
    REQUEST_TYPE_CHOICES = [
        ('project', 'Project'),
        ('study_group', 'Study Group'),
    ]
    
    invite_id = models.AutoField(primary_key=True)
    inviter = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='sent_invites',
        help_text='User who sent the invitation (project/group owner)'
    )
    invitee = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='received_invites',
        help_text='User who received the invitation'
    )
    project = models.ForeignKey(
        Project, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='invitations'
    )
    group = models.ForeignKey(
        StudyGroup, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True, 
        related_name='invitations'
    )
    request_type = models.CharField(max_length=20, choices=REQUEST_TYPE_CHOICES, editable=False)
    message = models.TextField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    def clean(self):
        # Ensure either project or group is set, but not both
        if not self.project and not self.group:
            raise ValidationError('Either project or group must be specified.')
        if self.project and self.group:
            raise ValidationError('Cannot specify both project and group.')
            
        # Set request_type based on what's set
        if self.project:
            self.request_type = 'project'
        elif self.group:
            self.request_type = 'study_group'
            
        # Ensure inviter is the owner of the project/group
        if self.project and self.project.created_by != self.inviter:
            raise ValidationError('Only the project owner can send invitations.')
        if self.group and self.group.created_by != self.inviter:
            raise ValidationError('Only the group owner can send invitations.')
            
        # Ensure invitee is not already a member
        if self.project:
            if TeamMember.objects.filter(project=self.project, user__user=self.invitee).exists():
                raise ValidationError('This user is already a member of the project.')
        elif self.group:
            if StudyGroupMember.objects.filter(group=self.group, user=self.invitee).exists():
                raise ValidationError('This user is already a member of the study group.')

    def save(self, *args, **kwargs):
        self.clean()
        # Update timestamps
        if self.pk and self.status != 'pending' and not self.responded_at:
            self.responded_at = timezone.now()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.inviter} invited {self.invitee} to {self.project or self.group}"

    class Meta:
        db_table = 'invite_requests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['inviter', 'status']),
            models.Index(fields=['invitee', 'status']),
            models.Index(fields=['project', 'status']),
            models.Index(fields=['group', 'status']),
            models.Index(fields=['created_at']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['inviter', 'invitee', 'project'],
                condition=models.Q(project__isnull=False),
                name='unique_project_invitation'
            ),
            models.UniqueConstraint(
                fields=['inviter', 'invitee', 'group'],
                condition=models.Q(group__isnull=False),
                name='unique_group_invitation'
            ),
        ]


class LeaveRequest(models.Model):
    """
    Model to track when members leave projects or study groups.
    """
    request_id = models.AutoField(primary_key=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='leave_requests')
    project = models.ForeignKey(Project, on_delete=models.CASCADE, null=True, blank=True, related_name='leave_requests')
    group = models.ForeignKey(StudyGroup, on_delete=models.CASCADE, null=True, blank=True, related_name='leave_requests')
    message = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(default=timezone.now)
    is_read = models.BooleanField(default=False)

    def clean(self):
        if not self.project and not self.group:
            raise ValidationError('Either project or group must be set')
        if self.project and self.group:
            raise ValidationError('Cannot set both project and group')

    def __str__(self):
        if self.project:
            return f"{self.user} left project {self.project} on {self.created_at}"
        return f"{self.user} left group {self.group} on {self.created_at}"

    class Meta:
        db_table = 'leave_requests'
        verbose_name_plural = 'Leave Requests'
        indexes = [
            models.Index(fields=['user', 'group']),
            models.Index(fields=['is_read']),
        ]