import rest_framework
from rest_framework import status, permissions, generics, filters, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.authtoken.models import Token
from knox.models import AuthToken
from .models import Skill, Department, UserSkill, UserAvailability
from .serializers import (
    UserSerializer, RegisterSerializer, LoginSerializer, 
    SkillSerializer, DepartmentSerializer, UserSkillSerializer,
    UserAvailabilitySerializer
)
from django.contrib.auth import login, get_user_model
from rest_framework.authtoken.serializers import AuthTokenSerializer
from knox.views import LoginView as KnoxLoginView
from django.middleware.csrf import get_token
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from rest_framework.decorators import api_view, permission_classes

User = get_user_model()

class DepartmentListAPI(APIView):
    """
    API endpoint that allows departments to be viewed.
    """
    permission_classes = [permissions.AllowAny]
    
    def get(self, request, format=None):
        try:
            departments = Department.objects.all().order_by('name')
            serializer = DepartmentSerializer(departments, many=True)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class SkillListAPI(generics.ListAPIView):
    """
    API endpoint that allows skills to be viewed.
    """
    serializer_class = SkillSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']
    pagination_class = None  # Return all skills without pagination

    def get_queryset(self):
        # Skill model currently has no relation to Department.
        # Ignore any department filter and return all skills.
        queryset = Skill.objects.all().order_by('name')
        return queryset

class UserSkillViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing user skills.
    """
    serializer_class = UserSkillSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'

    def get_queryset(self):
        return UserSkill.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

class UserAvailabilityViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing user availability.
    """
    serializer_class = UserAvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'id'

    def get_queryset(self):
        return UserAvailability.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

# Register API
class RegisterAPI(generics.GenericAPIView):
    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        # Check if USN already exists
        usn = serializer.validated_data.get('usn', '').upper()
        if User.objects.filter(usn__iexact=usn).exists():
            return Response(
                {"usn": ["A user with this USN already exists."]}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Check if email already exists
        email = serializer.validated_data.get('email', '').lower()
        if User.objects.filter(email__iexact=email).exists():
            return Response(
                {"email": ["A user with this email already exists."]}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Create the user
        user = serializer.save()
        
        # Create a profile for the user
        from .models import UserProfile
        UserProfile.objects.get_or_create(user=user)
        
        return Response({
            "user": UserSerializer(user, context=self.get_serializer_context()).data,
            "token": AuthToken.objects.create(user)[1]
        }, status=status.HTTP_201_CREATED)

# Get CSRF Token
class CSRFTokenView(APIView):
    permission_classes = (permissions.AllowAny,)
    
    def get(self, request, format=None):
        return JsonResponse({'csrfToken': get_token(request)})

# Login API using Knox
class LoginAPI(KnoxLoginView):
    permission_classes = (permissions.AllowAny,)
    
    def post(self, request, format=None):
        try:
            serializer = AuthTokenSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = serializer.validated_data['user']
            login(request, user)
            response = super(LoginAPI, self).post(request, format=None)
            
            # Set CSRF token in the response
            from django.middleware.csrf import get_token
            response.set_cookie(
                'csrftoken', 
                get_token(request),
                httponly=False,  # Allow JavaScript to read the cookie
                samesite='Lax',
                secure=False  # Set to True in production with HTTPS
            )
            
            return response
            
        except Exception as e:
            return Response(
                {'error': str(e)}, 
                status=status.HTTP_400_BAD_REQUEST
            )

class UserAPI(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserSerializer
    queryset = User.objects.all()
    lookup_field = 'usn'
    lookup_url_kwarg = 'usn'

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context.update({
            'request': self.request,
            'format': self.format_kwarg,
            'view': self
        })
        return context

    def get_queryset(self):
        return User.objects.all()

    def get_object(self):
        if 'usn' in self.kwargs:
            # Allow users to view any profile, but only update their own
            user = get_object_or_404(User, usn__iexact=self.kwargs['usn'])
            return user
        return self.request.user

    def update(self, request, *args, **kwargs):
        # Only allow users to update their own profile
        if 'usn' in self.kwargs and self.kwargs['usn'].lower() != request.user.usn.lower():
            return Response(
                {"detail": "You can only update your own profile."},
                status=status.HTTP_403_FORBIDDEN
            )
            
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

# User List API for teammates
class UserListAPI(APIView):
    """
    API endpoint to get all user profiles for finding teammates.
    Excludes the current user's own profile.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def get(self, request, format=None):
        try:
            # Get all users except the current user
            users = User.objects.exclude(usn=request.user.usn).select_related('department', 'profile').prefetch_related('user_skills__skill', 'availability')
            serializer = UserSerializer(users, many=True, context={'request': request})
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {"error": str(e)}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

# Token Verification API
class TokenVerifyAPI(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, format=None):
        # If the request reaches here, the token is valid
        return Response({
            'valid': True,
            'user': {
                'usn': request.user.usn,
                'email': request.user.email,
                'first_name': request.user.first_name,
                'last_name': request.user.last_name
            }
        }, status=status.HTTP_200_OK)

# Logout API
class LogoutAPI(APIView):
    permission_classes = [permissions.IsAuthenticated,]

    def post(self, request, format=None):
        # Delete the token to force a login
        request.user.auth_token.delete()
        return Response(status=status.HTTP_200_OK)

