from rest_framework import serializers
from django.contrib.auth import get_user_model
from django.contrib.auth import authenticate
from django.utils.translation import gettext_lazy as _
from .models import Skill, UserProfile, UserSkill, UserAvailability, Department

User = get_user_model()

class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ('id', 'name')
        read_only_fields = ('id',)

class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ('id', 'name')
        read_only_fields = ('id',)

class UserAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAvailability
        fields = ('id', 'day_of_week', 'time_slot_start', 'time_slot_end', 'is_available')
        read_only_fields = ('id', 'user')

class UserSkillSerializer(serializers.ModelSerializer):
    skill_id = serializers.PrimaryKeyRelatedField(
        queryset=Skill.objects.all(),
        source='skill',
        write_only=True
    )
    skill_name = serializers.CharField(source='skill.name', read_only=True)
    skill = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = UserSkill
        fields = ('id', 'skill_id', 'skill_name', 'skill', 'proficiency_level')
        read_only_fields = ('id', 'skill_name', 'skill')
    
    def get_skill(self, obj):
        """Return skill ID for matching purposes"""
        if obj.skill:
            return {'id': obj.skill.id, 'name': obj.skill.name}
        return None

class UserSerializer(serializers.ModelSerializer):
    department = DepartmentSerializer(read_only=True)
    department_id = serializers.PrimaryKeyRelatedField(
        queryset=Department.objects.all(),
        source='department',
        write_only=True,
        required=False
    )
    
    # Include profile fields directly
    linkedin_url = serializers.URLField(source='profile.linkedin_url', required=False, allow_blank=True)
    github_url = serializers.URLField(source='profile.github_url', required=False, allow_blank=True)
    bio = serializers.CharField(source='profile.bio', read_only=True)
    availability = UserAvailabilitySerializer(many=True, read_only=True)
    skills = UserSkillSerializer(source='user_skills', many=True, read_only=True)

    class Meta:
        model = User
        fields = (
            'usn', 'email', 'first_name', 'last_name', 'phone_number',
            'department', 'department_id', 'study_year', 'is_active', 'date_joined',
            'linkedin_url', 'github_url', 'bio', 'availability', 'skills'  # Include skills in response
        )
        read_only_fields = ('is_active', 'date_joined')
        extra_kwargs = {
            'usn': {'required': True},
            'email': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': False, 'allow_blank': True},
        }
    
    def update(self, instance, validated_data):
        # Handle nested profile updates
        profile_data = {}
        if 'profile' in validated_data:
            profile_data = validated_data.pop('profile')
        
        # Extract linkedin_url and github_url if they're in validated_data
        linkedin_url = validated_data.pop('linkedin_url', None)
        github_url = validated_data.pop('github_url', None)
        
        # Update user fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update profile fields
        if linkedin_url is not None or github_url is not None or profile_data:
            profile, created = instance.profile.__class__.objects.get_or_create(user=instance)
            
            if linkedin_url is not None:
                profile.linkedin_url = linkedin_url if linkedin_url else None
            if github_url is not None:
                profile.github_url = github_url if github_url else None
            
            for attr, value in profile_data.items():
                setattr(profile, attr, value)
            profile.save()
        
        return instance

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = ('linkedin_url', 'github_url', 'bio', 'date_of_birth', 'address', 'profile_picture')
        read_only_fields = ('user',)

class UserSkillSerializer(serializers.ModelSerializer):
    skill_id = serializers.PrimaryKeyRelatedField(
        queryset=Skill.objects.all(),
        source='skill',
        write_only=True
    )
    skill_name = serializers.CharField(source='skill.name', read_only=True)
    
    class Meta:
        model = UserSkill
        fields = ('id', 'skill_id', 'skill_name', 'proficiency_level', 'created_at')
        read_only_fields = ('id', 'created_at', 'user')
        extra_kwargs = {
            'proficiency_level': {
                'min_value': 0,
                'max_value': 5
            }
        }


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        min_length=8,
        error_messages={
            'min_length': 'Password must be at least 8 characters long.'
        }
    )
    password2 = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    profile = UserProfileSerializer(required=False)
    skills = UserSkillSerializer(many=True, required=False)
    availability = UserAvailabilitySerializer(many=True, required=False)
    
    class Meta:
        model = User
        fields = (
            'usn', 'email', 'password', 'password2', 'first_name', 'last_name',
            'phone_number', 'department', 'study_year', 'profile', 'skills', 'availability'
        )
        extra_kwargs = {
            'usn': {'required': True},
            'email': {'required': True},
            'first_name': {'required': True},
            'last_name': {'required': False, 'allow_blank': True},
            'department': {'required': True},
            'study_year': {'required': True}
        }

    def validate_usn(self, value):
        if not value.isalnum():
            raise serializers.ValidationError("USN must be alphanumeric.")
        if User.objects.filter(usn__iexact=value).exists():
            raise serializers.ValidationError("A user with this USN already exists.")
        return value.upper()

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value.lower()

    def validate(self, attrs):
        if attrs['password'] != attrs.pop('password2'):
            raise serializers.ValidationError({"password": "Password fields didn't match."})
        return attrs

    def create(self, validated_data):
        profile_data = validated_data.pop('profile', {})
        skills_data = validated_data.pop('skills', [])
        availability_data = validated_data.pop('availability', [])

        # Create user with optional fields
        user_data = {
            'usn': validated_data['usn'],
            'email': validated_data['email'],
            'password': validated_data['password'],
            'first_name': validated_data['first_name'],
            'phone_number': validated_data.get('phone_number', ''),
            'department': validated_data.get('department'),
            'study_year': validated_data.get('study_year')
        }
        
        # Only add last_name if it exists in validated_data
        if 'last_name' in validated_data:
            user_data['last_name'] = validated_data['last_name']
            
        user = User.objects.create_user(**user_data)

        # Create user profile if data provided
        if profile_data:
            UserProfile.objects.create(user=user, **profile_data)

        # Create user skills
        for skill_data in skills_data:
            UserSkill.objects.create(user=user, **skill_data)

        # Create user availability
        for availability_slot in availability_data:
            UserAvailability.objects.create(user=user, **availability_slot)

        return user

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(
        style={'input_type': 'password'},
        trim_whitespace=False,
        write_only=True
    )
    
    def validate(self, attrs):
        email = attrs.get('email')
        password = attrs.get('password')
        
        if email and password:
            user = authenticate(request=self.context.get('request'),
                              email=email, password=password)
            if not user:
                msg = _('Unable to log in with provided credentials.')
                raise serializers.ValidationError(msg, code='authorization')
        else:
            msg = _('Must include "email" and "password".')
            raise serializers.ValidationError(msg, code='authorization')
            
        attrs['user'] = user
        return attrs
