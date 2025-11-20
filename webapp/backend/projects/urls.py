from django.urls import path
from . import views
from . import invite_views

app_name = 'projects'

urlpatterns = [
    path('skills/', views.fetch_skills, name='fetch_skills'),
    path('create/', views.create_project, name='create_project'),
    path('draft/', views.save_draft_project, name='save_draft_project'),
    path('my-projects/', views.get_user_projects, name='get_user_projects'),
    path('member-projects/', views.get_user_member_projects, name='get_user_member_projects'),
    path('member-projects/<int:user_id>/', views.get_user_member_projects, name='get_specific_user_member_projects'),
    path('all/', views.get_all_projects, name='get_all_projects'),  # Must come before <int:project_id>/
    path('<int:project_id>/', views.get_project_details, name='get_project_details'),
    path('<int:project_id>/update/', views.update_project, name='update_project'),
    path('<int:project_id>/join/', views.join_project, name='join_project'),
    path('<int:project_id>/leave/', views.leave_project, name='leave_project'),
    path('<int:project_id>/add-member/', views.add_team_member, name='add_team_member'),
    path('<int:project_id>/members/<str:usn>/', views.remove_team_member, name='remove_team_member'),
    path('<int:project_id>/invite/', invite_views.invite_to_project, name='invite_to_project'),
    # Study groups
    path('groups/create/', views.create_study_group, name='create_study_group'),
    path('groups/my-groups/', views.get_user_study_groups, name='get_user_study_groups'),
    path('groups/member-groups/', views.get_user_member_groups, name='get_user_member_groups'),
    path('groups/member-groups/<int:user_id>/', views.get_user_member_groups, name='get_specific_user_member_groups'),
    path('groups/all/', views.get_all_study_groups, name='get_all_study_groups'),  # Must come before groups/<int:group_id>/
    path('groups/<int:group_id>/', views.get_study_group_details, name='get_study_group_details'),
    path('groups/<int:group_id>/update/', views.update_study_group, name='update_study_group'),
    path('groups/<int:group_id>/join/', views.join_group, name='join_group'),
    path('groups/<int:group_id>/leave/', views.leave_group, name='leave_group'),
    path('groups/<int:group_id>/add-member/', views.add_group_member, name='add_group_member'),
    path('groups/<int:group_id>/members/<str:usn>/', views.remove_group_member, name='remove_group_member'),
    path('groups/<int:group_id>/invite/', invite_views.invite_to_group, name='invite_to_group'),
    # Teammate finding - only advanced matching is available
    path('<int:project_id>/find-teammates/', views.advanced_find_teammates, name='find_teammates'),
    path('groups/<int:group_id>/find-members/', views.find_group_members, name='find_group_members'),
    # Messages/Join Requests
    path('messages/incoming/', views.get_incoming_requests, name='get_incoming_requests'),
    path('messages/outgoing/', views.get_outgoing_requests, name='get_outgoing_requests'),
    path('messages/<int:request_id>/approve/', views.approve_request, name='approve_request'),
    path('messages/<int:request_id>/reject/', views.reject_request, name='reject_request'),
    path('messages/<int:message_id>/read/', views.mark_message_read, name='mark_message_read'),
    # Invitations
    path('invitations/', invite_views.get_my_invitations, name='get_my_invitations'),
    path('invitations/sent/', invite_views.get_sent_invitations, name='get_sent_invitations'),
    path('invitations/<int:invite_id>/respond/', invite_views.respond_to_invitation, name='respond_to_invitation'),
    # Meeting slots
    path('<str:entity_type>/<int:entity_id>/meeting-slots/', views.get_meeting_slots, name='get_meeting_slots'),
]