from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
import logging
from .models import Project, StudyGroup, TeamMember, StudyGroupMember, JoinRequest
from django.contrib.auth import get_user_model
from .meeting_slots import get_meeting_slots
from accounts.models import UserAvailability
from django.db.models import Q
from collections import defaultdict
from datetime import time, datetime, timedelta
import logging

logger = logging.getLogger(__name__)
from django.db import IntegrityError
from .serializers import ProjectSerializer, SkillSerializer, StudyGroupSerializer, JoinRequestSerializer
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
    
    # Check if there's already any request (due to unique constraint regardless of status)
    existing_any = JoinRequest.objects.filter(
        requester=request.user,
        project=project,
    ).order_by('-created_at').first()
    if existing_any:
        msg = 'You already have a request for this project.'
        if existing_any.status == 'pending':
            msg = 'You already have a pending request for this project.'
        elif existing_any.status == 'approved':
            msg = 'You are already approved for this project.'
        elif existing_any.status == 'rejected':
            msg = 'Your previous request was rejected.'
        return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
    
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
    
    # Create notification for project owner before removing the member
    requester_name = request.user.get_full_name() or request.user.email
    JoinRequest.objects.create(
        requester=project.created_by,  # Owner is the recipient of the notification
        project=project,
        request_type='project',
        message=f"{requester_name} has left your project '{project.title}'",
        status='approved',  # Using 'approved' status for leave notifications
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
    
    # Check if user is already a member
    if StudyGroupMember.objects.filter(group=group, user=request.user).exists():
        return Response({'detail': 'You are already a member of this study group.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if user is the owner
    if group.created_by == request.user:
        return Response({'detail': 'You cannot join your own study group.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Check if there's already any request (unique regardless of status)
    existing_any = JoinRequest.objects.filter(
        requester=request.user,
        group=group,
    ).order_by('-created_at').first()
    if existing_any:
        msg = 'You already have a request for this study group.'
        if existing_any.status == 'pending':
            msg = 'You already have a pending request for this study group.'
        elif existing_any.status == 'approved':
            msg = 'You are already approved for this study group.'
        elif existing_any.status == 'rejected':
            msg = 'Your previous request was rejected.'
        return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
    
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
    group = get_object_or_404(StudyGroup, group_id=group_id)
    
    # Check if user is the owner
    if group.created_by == request.user:
        return Response({'detail': 'Study group owners cannot leave their own group.'}, status=status.HTTP_400_BAD_REQUEST)
    
    # Get the member who is leaving
    member = request.user
    member_name = member.get_full_name() or member.email
    
    # Get the leave message if provided
    leave_message = ''
    try:
        if request.content_type == 'application/json' and request.body:
            try:
                data = json.loads(request.body)
                leave_message = data.get('message', '')
            except json.JSONDecodeError:
                pass  # Not JSON data
        
        # Also check request.data for form data
        if not leave_message and hasattr(request, 'data') and request.data:
            leave_message = request.data.get('message', '')
    except Exception as e:
        print(f"Error parsing request data: {e}")
        return Response(
            {'detail': 'Invalid request data'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Create notification for group owner
    notification_message = f"{member_name} has left your study group '{group.name}'"
    if leave_message and str(leave_message).strip():
        notification_message += f": {leave_message.strip()}"
    
    JoinRequest.objects.create(
        requester=member,  # The member who is leaving is the one creating the notification
        recipient=group.created_by,  # Owner is the recipient of the notification
        group=group,
        request_type='study_group',
        message=notification_message,
        status='left',  # Using a new status 'left' for leave notifications
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
    
    return Response({'message': 'Successfully left the study group'}, status=status.HTTP_200_OK)


# Messages/Join Request Endpoints

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_incoming_requests(request):
    """Get incoming join requests for projects/groups owned by the user"""
    from django.db.models import Q
    
    # Get projects owned by user
    user_projects = Project.objects.filter(created_by=request.user)
    # Get groups owned by user
    user_groups = StudyGroup.objects.filter(created_by=request.user)
    
    # Get all requests for user's projects and groups (all statuses for reference)
    all_requests = JoinRequest.objects.filter(
        Q(project__in=user_projects) | Q(group__in=user_groups)
    ).order_by('-created_at')
    
    serializer = JoinRequestSerializer(all_requests, many=True, context={'request': request})
    return Response(serializer.data)


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
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def mark_message_read(request, message_id):
    """Mark a message as read"""
    join_request = get_object_or_404(JoinRequest, request_id=message_id)
    
    # Check if user has permission to mark this as read
    if join_request.requester != request.user:
        # Check if user is owner of the project/group
        is_owner = False
        if join_request.project and join_request.project.created_by == request.user:
            is_owner = True
        elif join_request.group and join_request.group.created_by == request.user:
            is_owner = True
        
        if not is_owner:
            return Response({'detail': 'You do not have permission to mark this message as read.'}, status=status.HTTP_403_FORBIDDEN)
    
    join_request.is_read = True
    join_request.save()
    
    return Response({'message': 'Message marked as read'}, status=status.HTTP_200_OK)