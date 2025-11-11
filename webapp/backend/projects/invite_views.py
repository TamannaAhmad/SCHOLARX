"""
Invitation endpoints for projects and study groups.
These allow owners to invite users to join their projects/groups.
"""
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.conf import settings
from django.contrib.auth import get_user_model
from django.utils import timezone
import logging

from .models import Project, StudyGroup, InviteRequest, TeamMember, StudyGroupMember
from accounts.models import UserProfile
from .serializers import JoinRequestSerializer, InviteRequestSerializer

logger = logging.getLogger(__name__)
User = get_user_model()


def _safe_send_mail(subject: str, message: str, recipient_email: str) -> None:
    """Best-effort email sender that won't break the request flow if email fails."""
    if not recipient_email:
        return
    from django.core.mail import send_mail
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
        logger.info("Email send result: %s", result)
    except Exception as e:
        logger.warning("Email send failed (continuing anyway): %s", e, exc_info=True)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def invite_to_project(request, project_id):
    """Send an invitation to a user to join a project (for project owners)"""
    project = get_object_or_404(Project, project_id=project_id)
    
    # Check if user is the project owner
    if project.created_by != request.user and not request.user.is_staff:
        return Response(
            {'detail': 'Only project owners can send invitations.'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Get the user to invite
    user_identifier = request.data.get('user_usn') or request.data.get('user_id')
    message = request.data.get('message', '')
    
    if not user_identifier:
        return Response(
            {'detail': 'User USN or ID is required.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Try to find user by USN or ID
        if str(user_identifier).isnumeric():
            user_to_invite = User.objects.get(id=user_identifier)
        else:
            user_to_invite = User.objects.get(usn__iexact=user_identifier)
    except User.DoesNotExist:
        return Response(
            {'detail': 'User not found.'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Check if user is already a member
    if TeamMember.objects.filter(project=project, user__user=user_to_invite).exists():
        return Response(
            {'detail': 'This user is already a member of the project.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if project has space
    if project.max_team_size and project.current_team_size >= project.max_team_size:
        return Response(
            {'detail': 'Project has reached maximum team size.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if there's already a pending invitation and update it instead of creating a new one
    existing_invite = InviteRequest.objects.filter(
        project=project,
        invitee=user_to_invite,
        status='pending'
    ).first()
    
    if existing_invite:
        # Update the existing invite with new message and timestamp
        existing_invite.message = message
        existing_invite.save(update_fields=['message', 'updated_at'])
        
        # Send notification to the user about the updated invitation
        _safe_send_mail(
            subject=f'Updated: Invitation to join project {project.title}',
            message=f"""
            {request.user.get_full_name()} has updated their invitation for you to join the project '{project.title}'.
            
            Message: {message}
            
            View and respond to the invitation: {settings.FRONTEND_URL}/project-view.html?id={project.project_id}
            """,
            recipient_email=user_to_invite.email
        )
        
        return Response({
            'message': 'Invitation updated successfully',
            'invitation': InviteRequestSerializer(existing_invite).data
        }, status=status.HTTP_200_OK)
    
    try:
        # Create invitation
        invitation = InviteRequest.objects.create(
            project=project,
            inviter=request.user,
            invitee=user_to_invite,
            message=message,
            status='pending'
        )
        
        # Send notification email
        invitee_email = getattr(user_to_invite, 'email', None)
        if invitee_email:
            msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/project-view.html?id={project.project_id}"
            subject = f"You've been invited to join project: {project.title}"
            body = (
                f"Hello {user_to_invite.get_full_name() or user_to_invite.usn or 'there'},\n\n"
                f"{request.user.get_full_name() or request.user.usn} has invited you to join the project '{project.title}'.\n\n"
            )
            if message:
                body += f"Message: {message}\n\n"
            body += f"View project and respond: {msg_page_url}\n\n— ScholarX"
            _safe_send_mail(subject, body, invitee_email)
        
        return Response({
            'message': 'Invitation sent successfully',
            'invitation': InviteRequestSerializer(invitation, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        logger.error(f"Error sending invitation: {str(e)}", exc_info=True)
        return Response(
            {'detail': 'An error occurred while sending the invitation.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def respond_to_invitation(request, invite_id):
    """Accept or decline a project/group invitation"""
    try:
        invite = InviteRequest.objects.get(
            invite_id=invite_id,
            invitee=request.user,
            status='pending'
        )
    except InviteRequest.DoesNotExist:
        return Response(
            {'detail': 'Invitation not found or already responded to.'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    action = request.data.get('action')
    if action not in ['accept', 'decline']:
        return Response(
            {'detail': "Action must be either 'accept' or 'decline'"},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    if action == 'accept':
        # Handle project invitation acceptance
        if invite.project:
            # Check if project still has space
            if invite.project.max_team_size and \
               invite.project.current_team_size >= invite.project.max_team_size:
                return Response(
                    {'detail': 'Project has reached maximum team size.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Get or create user profile
            user_profile, _ = UserProfile.objects.get_or_create(user=invite.invitee)
            
            try:
                # First check if they're already a member
                if not TeamMember.objects.filter(
                    project=invite.project,
                    user=user_profile
                ).exists():
                    # Only create if they're not already a member
                    TeamMember.objects.create(
                        project=invite.project,
                        user=user_profile,
                        joined_at=timezone.now()
                    )
                    
                    # Update project team size
                    invite.project.current_team_size = TeamMember.objects.filter(
                        project=invite.project
                    ).count()
                    invite.project.save(update_fields=['current_team_size'])
            except IntegrityError:
                # If we hit a race condition, just continue
                pass
            
            # Mark invitation as accepted regardless of existing membership
            # to prevent showing the same invitation again
            invite.status = 'accepted'
            invite.responded_at = timezone.now()
            invite.save()
            
            # Notify inviter
            _notify_invitation_response(invite, accepted=True)
            
            return Response({
                'success': True,
                'message': 'Successfully joined the project!',
                'project_id': str(invite.project.project_id),
                'project_title': invite.project.title
            })
            
        # Handle study group invitation acceptance
        elif invite.group:
            # Check if group still has space
            current_size = StudyGroupMember.objects.filter(group=invite.group).count()
            if invite.group.max_size and current_size >= invite.group.max_size:
                return Response(
                    {'detail': 'Study group has reached maximum size.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            # Check if user is already a member by looking at current group members
            current_members = invite.group.members.all()
            is_already_member = invite.invitee in current_members
            
            if not is_already_member:
                # Add user to study group if not already a member
                StudyGroupMember.objects.create(
                    group=invite.group,
                    user=invite.invitee
                )
            
            # Mark invitation as accepted
            invite.status = 'accepted'
            invite.responded_at = timezone.now()
            invite.save()
            
            # Notify inviter
            _notify_invitation_response(invite, accepted=True)
            
            return Response({
                'success': True,
                'message': 'Successfully joined the study group!',
                'group_id': str(invite.group.group_id),
                'group_name': invite.group.name
            })
    
    else:  # Decline action
        invite.status = 'declined'
        invite.responded_at = timezone.now()
        invite.save()
        
        # Notify inviter
        _notify_invitation_response(invite, accepted=False)
        
        return Response({'message': 'Invitation declined.'})


def _notify_invitation_response(invite, accepted):
    """Helper to notify the inviter about the invitee's response"""
    try:
        inviter_email = getattr(invite.inviter, 'email', None)
        if not inviter_email:
            return
            
        if invite.project:
            target_name = invite.project.title
            target_type = 'project'
            target_url = f"project-view.html?id={invite.project.project_id}"
        else:
            target_name = invite.group.name
            target_type = 'study group'
            target_url = f"study-group-view.html?id={invite.group.group_id}"
        
        action = 'accepted' if accepted else 'declined'
        subject = f"Your invitation to {target_name} has been {action}"
        
        body = (
            f"Hello {invite.inviter.get_full_name() or invite.inviter.usn or 'there'},\n\n"
            f"{invite.invitee.get_full_name() or invite.invitee.usn or 'A user'} has {action} your "
            f"invitation to the {target_type} '{target_name}'."
        )
        
        if accepted:
            body += f"\n\nView {target_type}: {getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/{target_url}"
        
        body += "\n\n— ScholarX"
        
        _safe_send_mail(subject, body, inviter_email)
        
    except Exception as e:
        logger.error(f"Error notifying inviter: {str(e)}", exc_info=True)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def invite_to_group(request, group_id):
    """Send an invitation to a user to join a study group (for group owners)"""
    group = get_object_or_404(StudyGroup, group_id=group_id)
    
    # Check if user is the group owner
    if group.created_by != request.user and not request.user.is_staff:
        return Response(
            {'detail': 'Only group owners can send invitations.'}, 
            status=status.HTTP_403_FORBIDDEN
        )
    
    # Get the user to invite
    user_identifier = request.data.get('user_usn') or request.data.get('user_id')
    message = request.data.get('message', '')
    
    if not user_identifier:
        return Response(
            {'detail': 'User USN or ID is required.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Try to find user by USN or ID
        if str(user_identifier).isnumeric():
            user_to_invite = User.objects.get(id=user_identifier)
        else:
            user_to_invite = User.objects.get(usn__iexact=user_identifier)
    except User.DoesNotExist:
        return Response(
            {'detail': 'User not found.'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    
    # Check if user is already a member
    if StudyGroupMember.objects.filter(group=group, user=user_to_invite).exists():
        return Response(
            {'detail': 'This user is already a member of the study group.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if group has space
    current_size = StudyGroupMember.objects.filter(group=group).count()
    if group.max_size and current_size >= group.max_size:
        return Response(
            {'detail': 'Study group has reached maximum size.'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if there's already a pending invitation and update it instead of creating a new one
    existing_invite = InviteRequest.objects.filter(
        group=group,
        invitee=user_to_invite,
        status='pending'
    ).first()
    
    if existing_invite:
        # Update the existing invite with new message and timestamp
        existing_invite.message = message
        existing_invite.save(update_fields=['message', 'updated_at'])
        
        # Send notification to the user about the updated invitation
        _safe_send_mail(
            subject=f'Updated: Invitation to join study group {group.name}',
            message=f"""
            {request.user.get_full_name()} has updated their invitation for you to join the study group '{group.name}'.
            
            Message: {message}
            
            View and respond to the invitation: {settings.FRONTEND_URL}/study-group-view.html?id={group.group_id}
            """,
            recipient_email=user_to_invite.email
        )
        
        return Response({
            'message': 'Invitation updated successfully',
            'invitation': InviteRequestSerializer(existing_invite).data
        }, status=status.HTTP_200_OK)
    
    try:
        # Create invitation
        invitation = InviteRequest.objects.create(
            group=group,
            inviter=request.user,
            invitee=user_to_invite,
            message=message,
            status='pending'
        )
        
        # Send notification email
        invitee_email = getattr(user_to_invite, 'email', None)
        if invitee_email:
            msg_page_url = f"{getattr(settings, 'FRONTEND_BASE_URL', 'http://localhost:8000')}/study-group-view.html?id={group.group_id}"
            subject = f"You've been invited to join study group: {group.name}"
            body = (
                f"Hello {user_to_invite.get_full_name() or user_to_invite.usn or 'there'},\n\n"
                f"{request.user.get_full_name() or request.user.usn} has invited you to join the study group '{group.name}'.\n\n"
            )
            if message:
                body += f"Message: {message}\n\n"
            body += f"View group and respond: {msg_page_url}\n\n— ScholarX"
            _safe_send_mail(subject, body, invitee_email)
        
        return Response({
            'message': 'Invitation sent successfully',
            'invitation': InviteRequestSerializer(invitation, context={'request': request}).data
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        logger.error(f"Error sending group invitation: {str(e)}", exc_info=True)
        return Response(
            {'detail': 'An error occurred while sending the invitation.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_my_invitations(request):
    """Get all pending invitations for the current user"""
    invitations = InviteRequest.objects.filter(
        invitee=request.user,
        status='pending'
    ).select_related('project', 'group', 'inviter').order_by('-created_at')
    
    serializer = InviteRequestSerializer(
        invitations,
        many=True,
        context={'request': request}
    )
    
    return Response(serializer.data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_sent_invitations(request):
    """Get all invitations sent by the current user"""
    invitations = InviteRequest.objects.filter(
        inviter=request.user
    ).select_related('project', 'group', 'invitee').order_by('-created_at')
    
    serializer = InviteRequestSerializer(
        invitations,
        many=True,
        context={'request': request}
    )
    
    return Response(serializer.data)
