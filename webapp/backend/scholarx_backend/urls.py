"""
URL configuration for scholarx_backend project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView
from django.views.static import serve
import os

urlpatterns = [
    # Admin site
    path('admin/', admin.site.urls),

    # API URLs
    path('api/auth/', include('accounts.urls')),
    path('api/projects/', include('projects.urls')),  # Includes both projects and groups
    
    # Chatbot API
    path('api/chatbot/', include('chatbot.urls')),
]

# Serve static and media files in development
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    
    # Serve frontend static files
    frontend_dir = os.path.join(settings.BASE_DIR, '..', 'frontend')
    
    # Serve specific HTML files
    urlpatterns += [
        path('', serve, {'path': 'index.html', 'document_root': frontend_dir}),
        path('register.html', serve, {'path': 'register.html', 'document_root': frontend_dir}),
        path('login.html', serve, {'path': 'login.html', 'document_root': frontend_dir}),
        path('dashboard.html', serve, {'path': 'dashboard.html', 'document_root': frontend_dir}),
        path('userprofile.html', serve, {'path': 'userprofile.html', 'document_root': frontend_dir}),
        path('project-creation.html', serve, {'path': 'project-creation.html', 'document_root': frontend_dir}),
        path('project-view.html', serve, {'path': 'project-view.html', 'document_root': frontend_dir}),
        path('group-creation.html', serve, {'path': 'group-creation.html', 'document_root': frontend_dir}),
        path('study-group-view.html', serve, {'path': 'study-group-view.html', 'document_root': frontend_dir}),
        path('find-teammates.html', serve, {'path': 'find-teammates.html', 'document_root': frontend_dir}),
        path('search.html', serve, {'path': 'search.html', 'document_root': frontend_dir}),
        path('chatbot.html', serve, {'path': 'chatbot.html', 'document_root': frontend_dir}),
        path('messages.html', serve, {'path': 'messages.html', 'document_root': frontend_dir}),
        path('index.html', serve, {'path': 'index.html', 'document_root': frontend_dir}),
        path('meeting-slots.html', serve, {'path': 'meeting-slots.html', 'document_root': frontend_dir}),
    ]
    
    # Serve static assets (CSS, JS, favicon, etc.)
    urlpatterns += [
        re_path(r'^styles/(?P<path>.*)$', serve, {'document_root': os.path.join(frontend_dir, 'styles')}),
        re_path(r'^scripts/(?P<path>.*)$', serve, {'document_root': os.path.join(frontend_dir, 'scripts')}),
        re_path(r'^src/(?P<path>.*)$', serve, {'document_root': os.path.join(frontend_dir, 'src')}),
        re_path(r'^images/(?P<path>.*)$', serve, {'document_root': os.path.join(frontend_dir, 'images')}),
        re_path(r'^favicon\.ico$', serve, {'document_root': frontend_dir, 'path': 'favicon.ico'}),
    ]
