from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
import logging
from django.contrib.auth import get_user_model
from django.db import models
from django.db.models import Q, Count, Avg, F, Case, When, Value, IntegerField, Exists, OuterRef, Subquery, Prefetch
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from collections import defaultdict, Counter
from datetime import time, datetime, timedelta
from typing import List, Dict, Any, Optional
import logging

# Import models
from .models import Project, StudyGroup, TeamMember, StudyGroupMember, JoinRequest, LeaveRequest, ProjectSkill
from accounts.models import UserAvailability, Skill, UserProfile, UserSkill

# Import serializers
from .serializers import (
    ProjectSerializer, 
    SkillSerializer, 
    StudyGroupSerializer, 
    JoinRequestSerializer, 
    UserProfileSerializer,
    LeaveRequestSerializer
)

# Import other local modules
from .meeting_slots import get_meeting_slots
from .advanced_matching import get_advanced_matches, ADVANCED_MATCHING_AVAILABLE

logger = logging.getLogger(__name__)
User = get_user_model()
from .advanced_matching import get_advanced_matches, ADVANCED_MATCHING_AVAILABLE
from django.db.models.functions import Coalesce
from accounts.models import Skill, UserProfile

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def fetch_skills(request):
    """Fetch all available skills"""
    skills = Skill.objects.all()
    serializer = SkillSerializer(skills, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_project(request):
    """Create a new project"""
    serializer = ProjectSerializer(data=request.data, context={'request': request})

    if serializer.is_valid():
        project = serializer.save()
        return Response({
            'message': 'Project created successfully',
            'project': ProjectSerializer(project, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def save_draft_project(request):
    """Save a project as draft"""
    # For draft, we can allow incomplete data
    data = request.data.copy()
    data['status'] = 'planning'  # Set status to planning for drafts

    serializer = ProjectSerializer(data=data, context={'request': request})

    if serializer.is_valid():
        project = serializer.save()
        return Response({
            'message': 'Project saved as draft successfully',
            'project': ProjectSerializer(project, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_projects(request):
    """Get projects created by the current user"""
    projects = Project.objects.filter(created_by=request.user)
    serializer = ProjectSerializer(projects, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_member_projects(request, user_id=None):
    """Get projects where the user is a member (not necessarily the creator)"""
    User = get_user_model()
    try:
        if user_id:
            user = User.objects.get(id=user_id)
        else:
            user = request.user
            
        # Get project IDs where user is a team member
        member_project_ids = TeamMember.objects.filter(
            user__user=user
        ).values_list('project_id', flat=True)
        
        # Get the projects
        projects = Project.objects.filter(
            Q(project_id__in=member_project_ids) |
            Q(created_by=user)  # Include projects created by the user
        ).distinct()
        
        serializer = ProjectSerializer(projects, many=True, context={'request': request})
        return Response(serializer.data)
    except User.DoesNotExist:
        return Response(
            {'error': 'User not found'}, 
            status=status.HTTP_404_NOT_FOUND
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_all_projects(request):
    """Get all projects (for search functionality)"""
    projects = Project.objects.all().order_by('-created_at')
    serializer = ProjectSerializer(projects, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_project_details(request, project_id):
    """Get details of a specific project"""
    # Allow any authenticated user to view project details
    project = get_object_or_404(Project, project_id=project_id)
    serializer = ProjectSerializer(project, context={'request': request})
    return Response(serializer.data)

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_project(request, project_id):
    """Update an existing project"""
    project = get_object_or_404(Project, project_id=project_id, created_by=request.user)

    serializer = ProjectSerializer(project, data=request.data, context={'request': request}, partial=True)

    if serializer.is_valid():
        updated_project = serializer.save()
        return Response({
            'message': 'Project updated successfully',
            'project': ProjectSerializer(updated_project, context={'request': request}).data
        })

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Study Group Endpoints

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_study_group(request):
    """Create a new study group"""
    serializer = StudyGroupSerializer(data=request.data, context={'request': request})
    if serializer.is_valid():
        group = serializer.save()
        return Response({
            'message': 'Study group created successfully',
            'group': StudyGroupSerializer(group, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_study_groups(request):
    """Get study groups created by the current user"""
    groups = StudyGroup.objects.filter(created_by=request.user).order_by('-created_at')
    serializer = StudyGroupSerializer(groups, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_member_groups(request, user_id=None):
    """Get study groups where the user is a member (not necessarily the creator)"""
    User = get_user_model()
    try:
        if user_id:
            user = User.objects.get(id=user_id)
        else:
            user = request.user
            
        # Get group IDs where user is a member
        member_group_ids = StudyGroupMember.objects.filter(
            user=user
        ).values_list('group_id', flat=True)
        
        # Get the study groups
        groups = StudyGroup.objects.filter(
            Q(group_id__in=member_group_ids) |
            Q(created_by=user)  # Include groups created by the user
        ).distinct().order_by('-created_at')
        
        serializer = StudyGroupSerializer(groups, many=True, context={'request': request})
        return Response(serializer.data)
    except User.DoesNotExist:
        return Response(
            {'error': 'User not found'}, 
            status=status.HTTP_404_NOT_FOUND
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_all_study_groups(request):
    """Get all study groups (for search functionality)"""
    groups = StudyGroup.objects.all().order_by('-created_at')
    serializer = StudyGroupSerializer(groups, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_study_group_details(request, group_id):
    """Get details of a specific study group"""
    # Allow any authenticated user to view study group details
    group = get_object_or_404(StudyGroup, group_id=group_id)
    serializer = StudyGroupSerializer(group, context={'request': request})
    return Response(serializer.data)


@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_study_group(request, group_id):
    """Update an existing study group"""
    group = get_object_or_404(StudyGroup, group_id=group_id, created_by=request.user)
    serializer = StudyGroupSerializer(group, data=request.data, context={'request': request}, partial=True)
    if serializer.is_valid():
        updated = serializer.save()
        return Response({
            'message': 'Study group updated successfully',
            'group': StudyGroupSerializer(updated, context={'request': request}).data
        })
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


# Join/Leave Endpoints

logger = logging.getLogger(__name__)


def _safe_send_mail(subject: str, message: str, recipient_email: str) -> None:
    """Best-effort email sender that won't break the request flow if email fails.

    Uses settings.DEFAULT_FROM_EMAIL when available, falls back to a local placeholder.
    """
    if not recipient_email:
        return
    from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'no-reply@localhost')
    fail_silently = getattr(settings, 'EMAIL_FAIL_SILENTLY', True)
    logger.info("Attempting to send email -> to=%s subject=%s", recipient_email, subject)
    try:
        result = send_mail(
            subject=subject,
            message=message,
            from_email=from_email,
            recipient_list=[recipient_email],
            fail_silently=fail_silently,
        )
        logger.info("Email send result -> to=%s count=%s", recipient_email, result)
    except Exception:
        # Intentionally swallow exceptions to avoid impacting API responses
        logger.exception("Email send failed -> to=%s", recipient_email)
        pass

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_project(request, project_id):
    """Request to join a project"""
    project = get_object_or_404(Project, project_id=project_id)
    
    # Check if user is already a member
    user_profile = UserProfile.objects.filter(user=request.user).first()
    if user_profile:
        if TeamMember.objects.filter(project=project, user=user_profile).exists():
            return Response({'detail': 'You are already a member of this project.'}, status=status.HTTP_400_BAD_REQUEST)
    # Check if user is the owner
    if project.created_by == request.user:
        return Response({'detail': 'You cannot join your own project.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if user is already a member of the project
    user_profile = UserProfile.objects.filter(user=request.user).first()
    if user_profile and TeamMember.objects.filter(project=project, user=user_profile).exists():
        return Response({'detail': 'You are already a member of this project.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if there's a pending request
    existing_pending = JoinRequest.objects.filter(
        requester=request.user,
        project=project,
        status='pending'
    ).exists()
    
    if existing_pending:
        return Response({'detail': 'You already have a pending request for this project.'}, status=status.HTTP_400_BAD_REQUEST)
        
    # Check if there's a previous approved request where the user left
    previous_approved = JoinRequest.objects.filter(
        requester=request.user,
        project=project,
        status='approved'
    ).order_by('-created_at').first()
    
    # If there's a previous approved request, we'll allow creating a new one (user left and wants to rejoin)
    
    # Create join request
    message = request.data.get('message', '')
    try:
        join_request = JoinRequest.objects.create(
            requester=request.user,
            project=project,
            request_type='project',
            message=message,
            status='pending'
        )
    except IntegrityError:
        return Response({'detail': 'A request for this project already exists.'}, status=status.HTTP_400_BAD_REQUEST)
    
    serializer = JoinRequestSerializer(join_request, context={'request': request})

    # Notify project owner via email (best-effort)
    owner_email = getattr(project.created_by, 'email', None)
    requester_name = request.user.get_full_name() if hasattr(request.user, 'get_full_name') else getattr(request.user, 'email', 'A user')
    msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/messages.html"
    subject = f"Join request for your project: {project.title}"
    body = (
        f"Hello,\n\n{requester_name} has requested to join your project '{project.title}'.\n\n"
        f"Message: {message or '(no message provided)'}\n\n"
        f"Review this request: {msg_page_url}\n\n"
        f"— ScholarX"
    )
    _safe_send_mail(subject, body, owner_email)
    return Response({
        'message': 'Join request sent successfully',
        'request': serializer.data
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def leave_project(request, project_id):
    """Leave a project"""
    project = get_object_or_404(Project, project_id=project_id)
    
    # Check if user is the owner
    if project.created_by == request.user:
        return Response({'detail': 'Project owners cannot leave their own project.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Get leave message from request
    leave_message = request.data.get('message', '').strip()
    requester_name = request.user.get_full_name() or request.user.username
    
    # Create notification for project owner before removing the member
    message = f"{requester_name} has left your project '{project.title}'"
    if leave_message:
        message += f"\n\nMessage: {leave_message}"
        
    # Create leave request record
    LeaveRequest.objects.create(
        user=request.user,
        project=project,
        message=leave_message,
        is_read=False
    )
    
    # Remove from team members
    user_profile = UserProfile.objects.filter(user=request.user).first()
    if user_profile:
        TeamMember.objects.filter(project=project, user=user_profile).delete()
        # Update current team size
        project.current_team_size = max(1, project.current_team_size - 1)
        project.save()
    
    # Send email notification to project owner
    owner_email = getattr(project.created_by, 'email', None)
    if owner_email:
        msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/messages.html"
        subject = f"Member left your project: {project.title}"
        body = (
            f"Hello,\n\n{requester_name} has left your project '{project.title}'.\n\n"
            f"View details: {msg_page_url}\n\n— ScholarX"
        )
        _safe_send_mail(subject, body, owner_email)
    
    return Response({'message': 'Successfully left the project'}, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def join_group(request, group_id):
    """Request to join a study group"""
    group = get_object_or_404(StudyGroup, group_id=group_id)
    
    # Check if user is currently a member (not including if they've left)
    is_currently_member = StudyGroupMember.objects.filter(group=group, user=request.user).exists()
    if is_currently_member:
        return Response(
            {'detail': 'You are already a member of this study group.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if user is the owner
    if group.created_by == request.user:
        return Response({'detail': 'You cannot join your own study group.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Check for existing pending requests
    has_pending_request = JoinRequest.objects.filter(
        requester=request.user,
        group=group,
        status='pending'
    ).exists()
    
    if has_pending_request:
        return Response(
            {'detail': 'You already have a pending request for this study group.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if user has left the group before
    has_left_group = LeaveRequest.objects.filter(
        user=request.user,
        group=group
    ).exists()
    
    # If user has left before, we'll allow them to rejoin by creating a new join request
    
    # If there are only rejected requests or no requests, allow creating a new one
    
    # Create join request
    message = request.data.get('message', '')
    try:
        join_request = JoinRequest.objects.create(
            requester=request.user,
            group=group,
            request_type='study_group',
            message=message,
            status='pending'
        )
    except IntegrityError:
        return Response({'detail': 'A request for this study group already exists.'}, status=status.HTTP_400_BAD_REQUEST)
    
    serializer = JoinRequestSerializer(join_request, context={'request': request})

    # Notify group owner via email (best-effort)
    owner_email = getattr(group.created_by, 'email', None)
    requester_name = request.user.get_full_name() if hasattr(request.user, 'get_full_name') else getattr(request.user, 'email', 'A user')
    msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/messages.html"
    subject = f"Join request for your study group: {group.name}"
    body = (
        f"Hello,\n\n{requester_name} has requested to join your study group '{group.name}'.\n\n"
        f"Message: {message or '(no message provided)'}\n\n"
        f"Review this request: {msg_page_url}\n\n"
        f"— ScholarX"
    )
    _safe_send_mail(subject, body, owner_email)
    return Response({
        'message': 'Join request sent successfully',
        'request': serializer.data
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def leave_group(request, group_id):
    """Leave a study group"""
    try:
        group = get_object_or_404(StudyGroup, group_id=group_id)
        
        # Check if user is the owner
        if group.created_by == request.user:
            return Response(
                {'detail': 'Study group owners cannot leave their own group. You can delete the group instead.'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user is a member of the group
        if not StudyGroupMember.objects.filter(group=group, user=request.user).exists():
            return Response(
                {'detail': 'You are not a member of this study group.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get the member who is leaving
        member = request.user
        member_name = member.get_full_name() or member.email
        
        # Get the leave message if provided
        leave_message = ''
        try:
            # First try to get data from request.data (handled by DRF's JSONParser or FormParser)
            if hasattr(request, 'data') and request.data:
                if isinstance(request.data, dict):
                    leave_message = request.data.get('message', '')
            
            # If no message found yet and content type is JSON, try parsing request.body directly
            if not leave_message and request.content_type == 'application/json' and request.body:
                try:
                    body_str = request.body.decode('utf-8')
                    if body_str.strip():  # Only parse if body is not empty
                        try:
                            data = json.loads(body_str)
                            if isinstance(data, dict):
                                leave_message = data.get('message', '')
                        except json.JSONDecodeError as e:
                            print(f"Warning: Could not parse request body as JSON: {e}")
                except UnicodeDecodeError as e:
                    print(f"Warning: Could not decode request body: {e}")
        except Exception as e:
            print(f"Error parsing request data: {e}")
            # Don't fail the request if there's an error parsing the message
            # Just continue with an empty message
        
        # Create the notification message
        user_identifier = getattr(member, 'usn', '') or getattr(member, 'username', str(member))
        notification_message = f"{member_name} ({user_identifier}) has left '{group.name}'"
        if leave_message and str(leave_message).strip():
            notification_message += f"\n\nMessage: {leave_message.strip()}"
        
        # Create a leave request record for tracking
        leave_request = LeaveRequest.objects.create(
            user=member,
            group=group,
            message=notification_message,
            is_read=False
        )
        
        # Remove from group members
        StudyGroupMember.objects.filter(group=group, user=request.user).delete()
        
        # Send email notification to group owner
        owner_email = getattr(group.created_by, 'email', None)
        if owner_email:
            msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/messages.html"
            subject = f"Member left your study group: {group.name}"
            body = (
                f"Hello,\n\n{notification_message}"
                f"\n\nView details: {msg_page_url}\n\n— ScholarX"
            )
            _safe_send_mail(subject, body, owner_email)
        
        return Response(
            {'message': 'Successfully left the study group'}, 
            status=status.HTTP_200_OK
        )
        
    except Exception as e:
        logger.error(f"Error in leave_group: {str(e)}", exc_info=True)
        return Response(
            {'detail': 'An error occurred while processing your request. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


# Messages/Join Request Endpoints

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_incoming_requests(request):
    """
    Get incoming join/leave requests for projects/groups owned by the user
    Returns a combined list of join requests and leave notifications
    """
    from django.db.models import Q
    
    # Get projects and groups owned by user
    user_projects = Project.objects.filter(created_by=request.user)
    user_groups = StudyGroup.objects.filter(created_by=request.user)
    
    # Get join requests for user's projects and groups
    join_requests = JoinRequest.objects.filter(
        Q(project__in=user_projects) | Q(group__in=user_groups),
        status='pending'  # Only show pending join requests
    ).select_related('project', 'group', 'requester')
    
    # Get leave requests for user's projects and groups
    leave_requests = LeaveRequest.objects.filter(
        Q(project__in=user_projects) | Q(group__in=user_groups),
        is_read=False  # Only show unread leave requests
    ).select_related('project', 'group', 'user')
    
    # Serialize both types of requests
    join_serializer = JoinRequestSerializer(join_requests, many=True, context={'request': request})
    leave_serializer = LeaveRequestSerializer(leave_requests, many=True, context={'request': request})
    
    # Combine and sort by creation date (newest first)
    all_requests = join_serializer.data + leave_serializer.data
    all_requests_sorted = sorted(
        all_requests, 
        key=lambda x: x.get('created_at', ''), 
        reverse=True
    )
    
    return Response(all_requests_sorted)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_outgoing_requests(request):
    """Get join requests sent by the current user"""
    requests = JoinRequest.objects.filter(requester=request.user).order_by('-created_at')
    serializer = JoinRequestSerializer(requests, many=True, context={'request': request})
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def approve_request(request, request_id):
    """Approve a join request"""
    join_request = get_object_or_404(JoinRequest, request_id=request_id)

    # Check if user is the owner of the project/group
    if join_request.project:
        if join_request.project.created_by != request.user:
            return Response({'detail': 'You do not have permission to approve this request.'}, status=status.HTTP_403_FORBIDDEN)

        # Check if project has space
        if join_request.project.max_team_size and join_request.project.current_team_size >= join_request.project.max_team_size:
            return Response({'detail': 'Project has reached maximum team size.'}, status=status.HTTP_400_BAD_REQUEST)

        # Add user to project
        user_profile, _ = UserProfile.objects.get_or_create(user=join_request.requester)
        TeamMember.objects.get_or_create(project=join_request.project, user=user_profile)
        join_request.project.current_team_size += 1
        join_request.project.save()

    elif join_request.group:
        if join_request.group.created_by != request.user:
            return Response({'detail': 'You do not have permission to approve this request.'}, status=status.HTTP_403_FORBIDDEN)

        # Check if group has space
        current_size = StudyGroupMember.objects.filter(group=join_request.group).count()
        if join_request.group.max_size and current_size >= join_request.group.max_size:
            return Response({'detail': 'Study group has reached maximum size.'}, status=status.HTTP_400_BAD_REQUEST)

        # Add user to group
        StudyGroupMember.objects.get_or_create(group=join_request.group, user=join_request.requester)

    # Update request status
    join_request.status = 'approved'
    join_request.responded_at = timezone.now()
    join_request.save()

    serializer = JoinRequestSerializer(join_request, context={'request': request})

    # Notify requester via email (best-effort)
    requester_email = getattr(join_request.requester, 'email', None)
    target_name = join_request.project.title if join_request.project else join_request.group.name if join_request.group else 'your request'
    view_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/messages.html"
    _safe_send_mail(
        subject=f"Your join request was approved — {target_name}",
        message=(
            f"Hello,\n\nYour request to join '{target_name}' has been approved."
            f"\n\nView details: {view_url}\n\n— ScholarX"
        ),
        recipient_email=requester_email,
    )
    return Response({
        'message': 'Request approved successfully',
        'request': serializer.data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_team_member(request, project_id):
    """Add a team member directly to a project (for project owners)"""
    project = get_object_or_404(Project, project_id=project_id)

    # Check if user is the project owner or has permission to add members
    if project.created_by != request.user and not request.user.is_staff:
        return Response(
            {'detail': 'Only project owners can add team members.'}, 
            status=status.HTTP_403_FORBIDDEN
        )

    # Get the user to add - can be by USN or user ID
    user_identifier = request.data.get('user_usn') or request.data.get('user_id')
    if not user_identifier:
        return Response(
            {'detail': 'User USN or ID is required.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        # Try to find user by USN or ID
        if str(user_identifier).isnumeric():
            user_to_add = User.objects.get(id=user_identifier)
        else:
            user_to_add = User.objects.get(usn__iexact=user_identifier)
    except User.DoesNotExist:
        return Response(
            {'detail': 'User not found.'}, 
            status=status.HTTP_404_NOT_FOUND
        )

    # Check if user is already a member
    user_profile, _ = UserProfile.objects.get_or_create(user=user_to_add)
    if TeamMember.objects.filter(project=project, user=user_profile).exists():
        return Response(
            {'detail': 'User is already a member of this project.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    # Check if project has space
    if project.max_team_size and project.current_team_size >= project.max_team_size:
        return Response(
            {'detail': 'Project has reached maximum team size.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        # Add user to project
        TeamMember.objects.create(project=project, user=user_profile)
        project.current_team_size = TeamMember.objects.filter(project=project).count() + 1  # +1 for creator
        project.save(update_fields=['current_team_size'])

        # Send notification email
        owner_email = getattr(user_to_add, 'email', None)
        if owner_email:
            msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/project-view.html?id={project.project_id}"
            subject = f"You've been added to project: {project.title}"
            body = (
                f"Hello {user_to_add.get_full_name() or user_to_add.usn or 'there'},\n\n"
                f"You have been added to the project '{project.title}' by the project owner.\n\n"
                f"View project: {msg_page_url}\n\n— ScholarX"
            )
            _safe_send_mail(subject, body, owner_email)

        return Response({
            'message': 'Team member added successfully',
            'project': ProjectSerializer(project, context={'request': request}).data,
            'user': {
                'id': user_to_add.id,
                'usn': user_to_add.usn,
                'name': user_to_add.get_full_name(),
                'email': user_to_add.email
            }
        }, status=status.HTTP_200_OK)

    except Exception as e:
        logger.error(f"Error adding team member: {str(e)}", exc_info=True)
        return Response(
            {'detail': 'An error occurred while adding the team member.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def add_group_member(request, group_id):
    """Add a member directly to a study group (for group owners)"""
    group = get_object_or_404(StudyGroup, group_id=group_id)

    # Check if user is the group owner
    if group.created_by != request.user:
        return Response({'detail': 'Only group owners can add members.'}, status=status.HTTP_403_FORBIDDEN)

    # Get the user to add
    user_usn = request.data.get('user_usn')
    if not user_usn:
        return Response({'detail': 'User USN is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_to_add = User.objects.get(usn__iexact=user_usn)
    except User.DoesNotExist:
        return Response({'detail': 'User not found.'}, status=status.HTTP_404_NOT_FOUND)

    # Check if user is already a member
    if StudyGroupMember.objects.filter(group=group, user=user_to_add).exists():
        return Response({'detail': 'User is already a member of this study group.'}, status=status.HTTP_400_BAD_REQUEST)

    # Check if group has space
    current_size = StudyGroupMember.objects.filter(group=group).count()
    if group.max_size and current_size >= group.max_size:
        return Response({'detail': 'Study group has reached maximum size.'}, status=status.HTTP_400_BAD_REQUEST)

    # Add user to group
    StudyGroupMember.objects.create(group=group, user=user_to_add)

    # Send notification email
    owner_email = getattr(user_to_add, 'email', None)
    if owner_email:
        msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/study-group-view.html?id={group.group_id}"
        subject = f"You've been added to study group: {group.name}"
        body = (
            f"Hello,\n\nYou have been added to the study group '{group.name}' by the group owner."
            f"\n\nView group: {msg_page_url}\n\n— ScholarX"
        )
        _safe_send_mail(subject, body, owner_email)

    return Response({
        'message': 'Group member added successfully',
        'group': StudyGroupSerializer(group, context={'request': request}).data
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def reject_request(request, request_id):
    """Reject a join request"""
    join_request = get_object_or_404(JoinRequest, request_id=request_id)
    
    # Check if user is the owner of the project/group
    if join_request.project:
        if join_request.project.created_by != request.user:
            return Response({'detail': 'You do not have permission to reject this request.'}, status=status.HTTP_403_FORBIDDEN)
    elif join_request.group:
        if join_request.group.created_by != request.user:
            return Response({'detail': 'You do not have permission to reject this request.'}, status=status.HTTP_403_FORBIDDEN)
    
    # Update request status
    join_request.status = 'rejected'
    join_request.responded_at = timezone.now()
    join_request.save()
    
    serializer = JoinRequestSerializer(join_request, context={'request': request})

    # Notify requester via email (best-effort)
    requester_email = getattr(join_request.requester, 'email', None)
    target_name = join_request.project.title if join_request.project else join_request.group.name if join_request.group else 'your request'
    view_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/messages.html"
    _safe_send_mail(
        subject=f"Your join request was rejected — {target_name}",
        message=(
            f"Hello,\n\nYour request to join '{target_name}' has been rejected."
            f"\n\nView details: {view_url}\n\n— ScholarX"
        ),
        recipient_email=requester_email,
    )
    return Response({
        'message': 'Request rejected',
        'request': serializer.data
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_message_read(request, message_id):
    """Mark a message as read"""
    try:
        # Try to find the message in JoinRequest
        try:
            message = JoinRequest.objects.get(request_id=message_id)
            # Check if user is the owner of the project/group
            if (message.project and message.project.created_by != request.user) or \
               (message.group and message.group.created_by != request.user):
                return Response(
                    {'detail': 'You do not have permission to mark this message as read.'}, 
                    status=status.HTTP_403_FORBIDDEN
                )
            
            message.is_read = True
            message.save()
            return Response({'message': 'Join request marked as read'}, status=status.HTTP_200_OK)
            
        except JoinRequest.DoesNotExist:
            # If not found in JoinRequest, try LeaveRequest
            try:
                leave_request = LeaveRequest.objects.get(request_id=message_id)
                # Check if user is the owner of the project/group
                if (leave_request.project and leave_request.project.created_by != request.user) or \
                   (leave_request.group and leave_request.group.created_by != request.user):
                    return Response(
                        {'detail': 'You do not have permission to mark this message as read.'}, 
                        status=status.HTTP_403_FORBIDDEN
                    )
                
                leave_request.is_read = True
                leave_request.save()
                return Response({'message': 'Leave notification marked as read'}, status=status.HTTP_200_OK)
                
            except LeaveRequest.DoesNotExist:
                return Response({'detail': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
                
    except Exception as e:
        logger.error(f"Error marking message as read: {str(e)}", exc_info=True)
        return Response(
            {'detail': 'An error occurred while processing your request. Please try again.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def find_teammates(request, project_id):
    """
    Find potential teammates for a project based on required skills.
    Returns a list of users ranked by their skill match percentage.
    """
    try:
        # Get the project and its required skills
        project = get_object_or_404(Project, project_id=project_id)
        
        # Check if the current user is the project creator or a team member
        if project.created_by != request.user and not TeamMember.objects.filter(
            project=project, user__user=request.user
        ).exists():
            return Response(
                {'error': 'You do not have permission to view this project'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get required skill IDs for the project
        required_skill_ids = list(ProjectSkill.objects.filter(project=project).values_list('skill_id', flat=True))
        
        if not required_skill_ids:
            return Response({
                'message': 'No required skills defined for this project',
                'profiles': []
            })
        
        # Get all users who have at least one of the required skills
        # and are not already team members
        current_member_ids = list(
            TeamMember.objects
            .filter(project=project)
            .values_list('user__user_id', flat=True)
        )
        current_member_ids.append(project.created_by_id)  # Include project creator
        
        # Get users with matching skills
        user_skills = (
            UserSkill.objects
            .filter(skill_id__in=required_skill_ids)
            .exclude(user__in=current_member_ids)
            .select_related('user', 'skill')
            .values('user_id')
            .annotate(
                match_count=Count('id', distinct=True),
                avg_proficiency=Coalesce(models.Avg('proficiency_level'), 0.0)
            )
        )
        
        if not user_skills.exists():
            return Response({
                'message': 'No potential teammates found with matching skills',
                'profiles': []
            })
        
        # Calculate match percentage and prepare response
        total_required_skills = len(required_skill_ids)
        user_profiles = []
        
        for us in user_skills:
            user = UserProfile.objects.get(user_id=us['user_id'])
            match_percentage = round((us['match_count'] / total_required_skills) * 100, 1)
            
            # Get user's skills that match the project's required skills
            matched_skills = (
                UserSkill.objects
                .filter(
                    user_id=us['user_id'],
                    skill_id__in=required_skill_ids
                )
                .select_related('skill')
                .values('skill__name', 'proficiency_level')
            )
            
            # Get user's availability - use user.user to get the CustomUser instance
            availability = (
                UserAvailability.objects
                .filter(user=user.user)  # user is a UserProfile, user.user is the CustomUser
                .values('day_of_week', 'time_slot_start', 'time_slot_end', 'is_available')
            )
            
            user_profiles.append({
                'id': user.user_id,
                'name': user.user.get_full_name(),
                'email': user.user.email,
                'department': user.user.department.name if user.user.department else None,
                'year': user.user.study_year,
                'match_percentage': match_percentage,
                'avg_proficiency': us['avg_proficiency'],
                'matched_skills': [
                    {
                        'name': skill['skill__name'],
                        'proficiency': skill['proficiency_level']
                    }
                    for skill in matched_skills
                ],
                'availability': list(availability)  # Convert queryset to list for JSON serialization
            })
        
        # Sort by match percentage (descending)
        user_profiles.sort(key=lambda x: x['match_percentage'], reverse=True)
        
        return Response({
            'project_id': project_id,
            'project_title': project.title,
            'required_skills': list(
                ProjectSkill.objects
                .filter(project=project)
                .select_related('skill')
                .values('skill__name', 'skill__id')
            ),
            'profiles': user_profiles,
            'matching_algorithm': 'basic'  # Indicate which algorithm was used
        })
        
    except Exception as e:
        logger.error(f"Error finding teammates: {str(e)}", exc_info=True)
        return Response(
            {'error': 'An error occurred while searching for teammates'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def advanced_find_teammates(request, project_id):
    """
    Find potential teammates for a project using advanced matching algorithms.
    This uses GNN and social network analysis for better matching.
    """
    if not ADVANCED_MATCHING_AVAILABLE:
        return Response(
            {'error': 'Advanced matching features are not available'},
            status=status.HTTP_501_NOT_IMPLEMENTED
        )
    
    try:
        project = get_object_or_404(Project, project_id=project_id)
        
        # Check if the current user has permission to view this project
        if project.created_by != request.user and not TeamMember.objects.filter(
            project=project, user__user=request.user
        ).exists():
            return Response(
                {'error': 'You do not have permission to view this project'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get and decode selected skills from query parameters
        from urllib.parse import unquote
        
        # Handle both single skills parameter and multiple skills[] parameters
        selected_skills = []
        
        # First check for multiple skills[] parameters (from URL like ?skills=python&skills=javascript)
        skills_list = request.query_params.getlist('skills[]') or request.query_params.getlist('skills')
        
        if skills_list:
            # If we have multiple skills parameters, use them directly
            selected_skills = [unquote(skill.strip()) for skill in skills_list if skill.strip()]
        else:
            # Fall back to the old way of handling comma-separated skills
            raw_skills = request.query_params.get('skills', '')
            if raw_skills:
                decoded_skills = unquote(raw_skills)
                selected_skills = [s.strip() for s in decoded_skills.split(',') if s.strip()]
        
        print(f"[DEBUG] Raw skills from request: {request.query_params.get('skills', '')}")
        print(f"[DEBUG] Selected skills after processing: {selected_skills}")
        
        # Get include_availability parameter (default to True if not specified)
        include_availability = request.query_params.get('include_availability', 'true').lower() == 'true'
        
        # Get advanced matches with selected skills and availability preference
        matches = get_advanced_matches(
            project_id, 
            selected_skills=selected_skills,
            include_availability=include_availability
        )
        
        # Get required skills for the response
        required_skills = list(
            ProjectSkill.objects
            .filter(project=project)
            .select_related('skill')
            .values('skill__name', 'skill__id')
        )
        
        return Response({
            'project_id': project_id,
            'project_title': project.title,
            'required_skills': required_skills,
            'profiles': matches or [],
            'matching_algorithm': 'advanced'
        })
        
    except Project.DoesNotExist:
        return Response(
            {'error': 'Project not found'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error in advanced teammate finding: {str(e)}", exc_info=True)
        return Response(
            {'error': 'An error occurred while finding teammates'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def find_group_members(request, group_id):
    """
    Find potential members for a study group based on skills and interests.
    This is similar to find_teammates but for study groups.
    """
    try:
        # Get the study group
        study_group = get_object_or_404(StudyGroup, group_id=group_id)
        
        # Check if the current user has permission to view this group
        if study_group.created_by != request.user and not StudyGroupMember.objects.filter(
            group=study_group, user__user=request.user
        ).exists():
            return Response(
                {'error': 'You do not have permission to view this group'}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Get required topics for the group from the comma-separated topics field
        if not study_group.topics:
            return Response({
                'group_id': group_id,
                'group_title': study_group.title,
                'required_skills': [],
                'profiles': [],
                'message': 'No topics defined for this group'
            })
            
        # Convert comma-separated topics to a list and clean up whitespace
        topics = [topic.strip() for topic in study_group.topics.split(',') if topic.strip()]
        
        # Create a list of skill-like objects with name and id
        required_skills = [{'name': topic, 'id': i+1} for i, topic in enumerate(topics)]
        required_skill_ids = list(range(1, len(topics) + 1))  # Generate sequential IDs
        
        # Get current group members to exclude them from results
        current_member_ids = list(
            StudyGroupMember.objects
            .filter(group=study_group)
            .values_list('user__usn', flat=True)
        )
        
        # Get users with matching skills (from topics) who are not already members
        from django.db.models import Q
        
        # Create a query to find users with any of the required topics in their skills
        topic_queries = Q()
        for topic in topics:
            topic_queries |= Q(skill__name__icontains=topic)
        
        user_skills = (
            UserSkill.objects
            .filter(topic_queries)
            .exclude(user__usn__in=current_member_ids)
            .exclude(user=study_group.created_by)  # Exclude group creator
            .select_related('user__userprofile', 'skill')
            .values('user_id')
            .annotate(
                match_count=Count('id', distinct=True),
                avg_proficiency=Coalesce(models.Avg('proficiency_level'), 0.0)
            )
        )
        
        if not user_skills.exists():
            return Response({
                'group_id': group_id,
                'group_title': study_group.name,
                'required_skills': required_skills,
                'profiles': [],
                'message': 'No potential members found with matching skills'
            })
        
        # Calculate match percentage and prepare response
        total_required_skills = len(required_skill_ids)
        user_profiles = []
        
        for us in user_skills:
            user = UserProfile.objects.get(user_id=us['user_id'])
            match_percentage = round((us['match_count'] / total_required_skills) * 100, 1)
            
            # Get user's skills that match the group's required skills
            matched_skills = (
                UserSkill.objects
                .filter(
                    user_id=us['user_id'],
                    skill_id__in=required_skill_ids
                )
                .select_related('skill')
                .values('skill__name', 'proficiency_level')
            )
            
            # Get user's availability
            availability = (
                UserAvailability.objects
                .filter(user=user.user, is_available=True)
                .values('day_of_week', 'time_slot_start', 'time_slot_end')
            )
            
            user_profiles.append({
                'id': user.user_id,
                'name': user.user.get_full_name(),
                'email': user.user.email,
                'department': user.user.department.name if user.user.department else None,
                'year': user.user.study_year,
                'match_percentage': match_percentage,
                'avg_proficiency': us['avg_proficiency'],
                'matched_skills': [
                    {
                        'name': skill['skill__name'],
                        'proficiency': skill['proficiency_level']
                    }
                    for skill in matched_skills
                ],
                'availability': list(availability)
            })
        
        # Sort by match percentage (descending)
        user_profiles.sort(key=lambda x: x['match_percentage'], reverse=True)
        
        return Response({
            'group_id': group_id,
            'group_title': study_group.title,
            'required_skills': required_skills,
            'profiles': user_profiles,
            'matching_algorithm': 'basic'  # Basic matching for groups
        })
        
    except StudyGroup.DoesNotExist:
        return Response(
            {'error': 'Study group not found'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except Exception as e:
        logger.error(f"Error finding group members: {str(e)}", exc_info=True)
        return Response(
            {'error': 'An error occurred while searching for group members'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )