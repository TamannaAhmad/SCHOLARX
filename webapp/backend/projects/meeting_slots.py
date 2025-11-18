from collections import defaultdict
from datetime import time
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from django.db.models import Q
import logging
from .models import Project, StudyGroup, TeamMember, StudyGroupMember
from accounts.models import UserAvailability

logger = logging.getLogger(__name__)

def get_team_availability(team_member_ids):
    """
    Get availability for all team members
    Returns a dictionary with day of week as key and list of available time slots as value
    """
    # Get all availability entries for team members
    availabilities = UserAvailability.objects.filter(
        user__in=team_member_ids,
        is_available=True
    ).select_related('user')
    
    # Group by day of week
    day_availability = defaultdict(lambda: defaultdict(list))
    for avail in availabilities:
        day_availability[avail.day_of_week][avail.user.usn].append(
            (avail.time_slot_start, avail.time_slot_end)
        )
    
    return day_availability

def find_common_slots(team_availability, team_member_ids):
    """
    Find common available time slots for the team
    Returns a list of recommended time slots with availability percentage
    """
    # Define time slots (2-hour blocks)
    time_slots = []
    for h in range(0, 24, 2):
        end_hour = h + 2
        if end_hour > 23:  # Handle the last slot of the day
            end_hour = 23
            end_minute = 59
        else:
            end_minute = 0
        time_slots.append((time(h, 0), time(end_hour, end_minute)))
    
    # Get total team members
    total_members = len(team_member_ids)
    
    if total_members == 0:
        return [], [], [], 0.0
    
    perfect_slots = []
    good_slots = []
    backup_slots = []
    
    min_good = max(1, int(total_members * 0.8))  # 80% of team
    min_backup = max(1, int(total_members * 0.5))  # 50% of team
    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    
    # Check each day and time slot
    for day in range(7):  # 0=Sunday, 6=Saturday
        day_data = team_availability.get(day, {})
        
        for slot_start, slot_end in time_slots:
            available_count = 0
            available_members = []
            
            for usn in team_member_ids:
                user_slots = day_data.get(usn, [])
                for user_start, user_end in user_slots:
                    # Check if user is available during this slot
                    if user_start <= slot_end and user_end >= slot_start:
                        available_count += 1
                        available_members.append(usn)
                        break
            
            if available_count == 0:
                continue
                
            slot_info = {
                'day': day,
                'day_name': day_names[day],
                'start_time': slot_start.strftime('%H:%M'),
                'end_time': slot_end.strftime('%H:%M'),
                'available_members': available_members,
                'available_count': available_count,
                'total_members': total_members,
                'availability_percentage': int((available_count / total_members) * 100)
            }
            
            if available_count == total_members:
                perfect_slots.append(slot_info)
            elif available_count >= min_good:
                good_slots.append(slot_info)
            elif available_count >= min_backup:
                backup_slots.append(slot_info)
    
    # Calculate success rate
    total_slots = len(perfect_slots) + len(good_slots) + len(backup_slots)
    success_rate = (len(perfect_slots) / total_slots * 100) if total_slots > 0 else 0
    
    return perfect_slots, good_slots, backup_slots, success_rate

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_meeting_slots(request, entity_type, entity_id):
    """
    Get recommended meeting slots for a project or study group
    entity_type: 'project' or 'study-group'
    entity_id: ID of the project or study group
    """
    try:
        # Get team members based on entity type
        if entity_type == 'project':
            # Get project and verify user has access
            project = get_object_or_404(Project, pk=entity_id)
            if not TeamMember.objects.filter(project=project, user__user=request.user).exists() and project.created_by != request.user:
                return Response(
                    {"error": "You don't have permission to view this project's schedule"},
                    status=status.HTTP_403_FORBIDDEN
                )
            # Get team member USNs
            team_member_ids = list(TeamMember.objects
                                 .filter(project=project)
                                 .values_list('user__user__usn', flat=True))
            
            # Add the creator if not already in the list
            if project.created_by.usn not in team_member_ids:
                team_member_ids.append(project.created_by.usn)
            
        elif entity_type == 'study-group':
            # Get study group and verify user is a member
            study_group = get_object_or_404(StudyGroup, pk=entity_id)
            if not StudyGroupMember.objects.filter(group=study_group, user=request.user).exists() and study_group.created_by != request.user:
                return Response(
                    {"error": "You don't have permission to view this study group's schedule"},
                    status=status.HTTP_403_FORBIDDEN
                )
            # Get group member USNs
            team_member_ids = list(StudyGroupMember.objects
                                 .filter(group=study_group)
                                 .values_list('user__usn', flat=True))

            # Add the creator if not already in the list
            if study_group.created_by.usn not in team_member_ids:
                team_member_ids.append(study_group.created_by.usn)
        else:
            return Response(
                {"error": "Invalid entity type. Must be 'project' or 'study-group'"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get team availability
        team_availability = get_team_availability(team_member_ids)
        
        # Find common slots
        perfect_slots, good_slots, backup_slots, success_rate = find_common_slots(
            team_availability, team_member_ids
        )
        
        # Sort slots by day and time
        def sort_key(slot):
            return (slot['day'], slot['start_time'])
            
        perfect_slots.sort(key=sort_key)
        good_slots.sort(key=sort_key)
        backup_slots.sort(key=sort_key)
        
        # Determine recommendation
        if len(perfect_slots) > 0:
            recommendation = "Excellent - Found perfect time slots for the whole team!"
        elif len(good_slots) > 0:
            recommendation = "Good - Found time slots where most team members are available"
        elif len(backup_slots) > 0:
            recommendation = "Fair - Found some time slots with partial team availability"
        else:
            recommendation = "No suitable time slots found. Please try adjusting availability."
        
        return Response({
            'perfect_slots': perfect_slots,
            'good_slots': good_slots,
            'backup_slots': backup_slots,
            'stats': {
                'perfect_count': len(perfect_slots),
                'good_count': len(good_slots),
                'backup_count': len(backup_slots),
                'success_rate': round(success_rate, 1),
                'team_size': len(team_member_ids)
            },
            'recommendation': recommendation
        })
        
    except Exception as e:
        logger.error(f"Error getting meeting slots: {str(e)}", exc_info=True)
        return Response(
            {"error": "An error occurred while calculating meeting slots"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
