from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from django.contrib.auth import get_user_model
from django.db import transaction
from knox.models import AuthToken
from .models import Skill, UserProfile, UserSkill, UserAvailability
from .serializers import (
    UserSerializer, SkillSerializer, UserSkillSerializer, 
    UserAvailabilitySerializer, UserProfileSerializer, RegisterSerializer
)
from django.utils import timezone

User = get_user_model()

class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ['id', 'name']

class UserSkillSerializer(serializers.ModelSerializer):
    skill = SkillSerializer()
    
    class Meta:
        model = UserSkill
        fields = ['skill', 'proficiency_level']

class UserAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAvailability
        fields = ['day_of_week', 'time_slot_start', 'time_slot_end', 'is_available']

class UserProfileSerializer(serializers.ModelSerializer):
    skills = UserSkillSerializer(many=True, required=False)
    availability = UserAvailabilitySerializer(many=True, required=False)
    
    class Meta:
        model = UserProfile
        fields = ['usn', 'department', 'study_year', 'linkedin_url', 'github_url', 'bio', 'skills', 'availability']
        extra_kwargs = {
            'usn': {'required': True},
            'department': {'required': True},
            'study_year': {'required': True},
        }

class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer(required=True)
    password = serializers.CharField(write_only=True, required=True, style={'input_type': 'password'})
    
    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'password', 'profile']
        extra_kwargs = {
            'email': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': True},
        }
    
    def create(self, validated_data):
        profile_data = validated_data.pop('profile')
        password = validated_data.pop('password')
        
        with transaction.atomic():
            # Create user
            user = User.objects.create_user(
                email=validated_data['email'],
                first_name=validated_data['first_name'],
                last_name=validated_data['last_name'],
                password=password
            )
            
            # Create user profile
            skills_data = profile_data.pop('skills', [])
            availability_data = profile_data.pop('availability', [])
            
            profile = UserProfile.objects.create(user=user, **profile_data)
            
            # Add skills
            for skill_data in skills_data:
                skill_name = skill_data['skill']['name']
                skill, _ = Skill.objects.get_or_create(name=skill_name)
                UserSkill.objects.create(
                    user=user,
                    skill=skill,
                    proficiency_level=skill_data.get('proficiency_level', 3)
                )
            
            # Add availability
            for availability in availability_data:
                UserAvailability.objects.create(user=user, **availability)
            
            return user

class SkillListAPI(APIView):
    permission_classes = [AllowAny]
    
    def get(self, request):
        query = request.query_params.get('q', '').lower()
        skills = Skill.objects.filter(name__icontains=query).order_by('name')[:10]
        serializer = SkillSerializer(skills, many=True)
        return Response(serializer.data)

class RegisterAPI(APIView):
    permission_classes = [AllowAny]
    
    def post(self, request):
        # Create a mutable copy of the request data
        data = request.data.copy()
        
        # Create user with the RegisterSerializer which handles password confirmation
        register_serializer = RegisterSerializer(data=data)
        if not register_serializer.is_valid():
            return Response(
                register_serializer.errors,
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            with transaction.atomic():
                # Create the user and related objects
                user = register_serializer.save()
                
                # Get the created user profile
                profile = user.profile
                
                # Skills and availability are already handled by the RegisterSerializer's create method
                # Just return the success response with the auth token
                token = AuthToken.objects.create(user)
                
                return Response({
                    'user': UserSerializer(user).data,
                    'token': token[1]  # Return the token key
                }, status=status.HTTP_201_CREATED)
                
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

class UserProfileAPI(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        try:
            profile = request.user.profile
            serializer = UserProfileSerializer(profile)
            return Response(serializer.data)
        except UserProfile.DoesNotExist:
            return Response(
                {'error': 'Profile not found'},
                status=status.HTTP_404_NOT_FOUND
            )
    
    def put(self, request):
        try:
            profile = request.user.profile
            serializer = UserProfileSerializer(profile, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(serializer.data)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except UserProfile.DoesNotExist:
            return Response(
                {'error': 'Profile not found'},
                status=status.HTTP_404_NOT_FOUND
            )
