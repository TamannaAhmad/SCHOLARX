from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import (
    RegisterAPI, UserAPI, LoginAPI, CSRFTokenView, SkillListAPI,
    DepartmentListAPI, UserSkillViewSet, UserAvailabilityViewSet, LogoutAPI, TokenVerifyAPI, UserListAPI
)
from rest_framework.routers import DefaultRouter

router = DefaultRouter()
router.register(r'user/skills', UserSkillViewSet, basename='userskill')
router.register(r'user/availability', UserAvailabilityViewSet, basename='useravailability')

urlpatterns = [
    # Authentication
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('logout/', LogoutAPI.as_view(), name='logout'),

    # User registration and profile
    path('register/', RegisterAPI.as_view(), name='register'),
    path('profile/', UserAPI.as_view(), name='profile'),
    path('profile/<str:usn>/', UserAPI.as_view(), name='user-profile'),
    path('users/', UserListAPI.as_view(), name='user-list'),

    # Departments
    path('departments/', DepartmentListAPI.as_view(), name='department-list'),

    # Skills
    path('skills/', SkillListAPI.as_view(), name='skill-list'),

    # Token verification
    path('verify/', TokenVerifyAPI.as_view(), name='token_verify'),

    # User skills and availability (using ViewSets)
    path('', include(router.urls)),

    # Login API
    path('login/', LoginAPI.as_view(), name='login'),

    # CSRF Token
    path('csrf/', CSRFTokenView.as_view(), name='csrf-token'),
]
