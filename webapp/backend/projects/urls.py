from django.urls import path
from . import views

app_name = 'projects'

urlpatterns = [
    path('skills/', views.fetch_skills, name='fetch_skills'),
    path('create/', views.create_project, name='create_project'),
    path('draft/', views.save_draft_project, name='save_draft_project'),
    path('my-projects/', views.get_user_projects, name='get_user_projects'),
    path('all/', views.get_all_projects, name='get_all_projects'),  # Must come before <int:project_id>/
    path('<int:project_id>/', views.get_project_details, name='get_project_details'),
    path('<int:project_id>/update/', views.update_project, name='update_project'),
    path('<int:project_id>/join/', views.join_project, name='join_project'),
    path('<int:project_id>/leave/', views.leave_project, name='leave_project'),
    # Study groups
    path('groups/create/', views.create_study_group, name='create_study_group'),
    path('groups/my-groups/', views.get_user_study_groups, name='get_user_study_groups'),
    path('groups/all/', views.get_all_study_groups, name='get_all_study_groups'),  # Must come before groups/<int:group_id>/
    path('groups/<int:group_id>/', views.get_study_group_details, name='get_study_group_details'),
    path('groups/<int:group_id>/update/', views.update_study_group, name='update_study_group'),
    path('groups/<int:group_id>/join/', views.join_group, name='join_group'),
    path('groups/<int:group_id>/leave/', views.leave_group, name='leave_group'),
    # Messages/Join Requests
    path('messages/incoming/', views.get_incoming_requests, name='get_incoming_requests'),
    path('messages/outgoing/', views.get_outgoing_requests, name='get_outgoing_requests'),
    path('messages/<int:request_id>/approve/', views.approve_request, name='approve_request'),
    path('messages/<int:request_id>/reject/', views.reject_request, name='reject_request'),
    path('messages/<int:message_id>/read/', views.mark_message_read, name='mark_message_read'),
]