from rest_framework import serializers
from .models import Project, ProjectSkill, StudyGroup, StudyGroupMember, TeamMember, JoinRequest
from accounts.models import Skill

class SkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = Skill
        fields = ['id', 'name']

class ProjectSkillSerializer(serializers.ModelSerializer):
    skill = SkillSerializer()

    class Meta:
        model = ProjectSkill
        fields = ['skill']

class ProjectSerializer(serializers.ModelSerializer):
    required_skills = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True
    )
    skills = ProjectSkillSerializer(source='projectskill_set', many=True, read_only=True)
    
    
class TeamMemberBriefSerializer(serializers.ModelSerializer):
    usn = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    profile_url = serializers.SerializerMethodField()

    class Meta:
        model = TeamMember
        fields = ['usn', 'name', 'profile_url', 'joined_at']

    def get_usn(self, obj):
        try:
            return obj.user.user.usn  # Get USN from the related CustomUser
        except Exception:
            return None

    def get_name(self, obj):
        try:
            return obj.user.user.get_full_name()
        except Exception:
            return ''

    def get_profile_url(self, obj):
        usn = self.get_usn(obj)
        return f"/userprofile.html?usn={usn}" if usn else None


class ProjectSerializer(serializers.ModelSerializer):
    required_skills = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True
    )
    skills = ProjectSkillSerializer(source='projectskill_set', many=True, read_only=True)
    members = TeamMemberBriefSerializer(source='teammember_set', many=True, read_only=True)
    type = serializers.CharField(source='project_type', required=False, allow_blank=True)

    status_display = serializers.SerializerMethodField(read_only=True)
    is_owner = serializers.SerializerMethodField(read_only=True)
    owner_id = serializers.SerializerMethodField(read_only=True)
    owner_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Project
        fields = [
            'project_id', 'title', 'description', 'type', 'project_type',
            'max_team_size', 'deadline', 'status', 'status_display', 'is_owner', 'owner_id', 'owner_name', 'created_at',
            'required_skills', 'skills', 'members'
        ]
        read_only_fields = ['project_id', 'created_at', 'created_by']

    def to_internal_value(self, data):
        """
        Normalize incoming status to the model's choice keys (lowercase).
        Accepts labels like 'Planning' as well as keys like 'planning'.
        Also supports 'Cancelled'.
        """
        data = data.copy()
        try:
            status_val = data.get('status', None)
            if status_val is not None:
                s = str(status_val).strip()
                low = s.lower()
                valid_keys = {'planning', 'active', 'completed', 'cancelled'}
                if low in valid_keys:
                    data['status'] = low
                else:
                    # Try mapping common Title Case labels
                    label_map = {
                        'Planning': 'planning',
                        'Active': 'active',
                        'Completed': 'completed',
                        'Cancelled': 'cancelled',
                    }
                    if s in label_map:
                        data['status'] = label_map[s]
        except Exception:
            # If normalization fails, let default validation handle it
            pass
        return super().to_internal_value(data)

    def validate_status(self, value):
        # Accept keys and labels; return the model key (lowercase)
        if value is None:
            return value
        v = str(value).strip()
        key = v.lower()
        valid_keys = ['planning', 'active', 'completed', 'cancelled']
        if key not in valid_keys:
            human = ['Planning', 'Active', 'Completed', 'Cancelled']
            raise serializers.ValidationError(f"Status must be one of {human}")
        return key

    def get_status_display(self, obj):
        # Always provide Title Case label for UI
        mapping = {
            'planning': 'Planning',
            'active': 'Active',
            'completed': 'Completed',
            'cancelled': 'Cancelled',
        }
        try:
            return mapping.get((obj.status or '').lower(), obj.status)
        except Exception:
            return obj.status

    def get_is_owner(self, obj):
        try:
            request = self.context.get('request')
            return bool(request and request.user and obj.created_by_id == request.user.id)
        except Exception:
            return False

    def get_owner_id(self, obj):
        try:
            return obj.created_by_id
        except Exception:
            return None

    def get_owner_name(self, obj):
        try:
            u = obj.created_by
            return u.get_full_name() if hasattr(u, 'get_full_name') else getattr(u, 'username', None)
        except Exception:
            return None

    def get_owner_id(self, obj):
        try:
            return obj.created_by_id
        except Exception:
            return None

    def get_owner_name(self, obj):
        try:
            u = obj.created_by
            return u.get_full_name() if hasattr(u, 'get_full_name') else getattr(u, 'username', None)
        except Exception:
            return None

    def create(self, validated_data):
        required_skills = validated_data.pop('required_skills', [])
        validated_data['created_by'] = self.context['request'].user
        
        # Set default status to lowercase key expected by model if not provided
        if 'status' not in validated_data:
            validated_data['status'] = 'planning'

        project = super().create(validated_data)

        # Create ProjectSkill instances
        for skill_id in required_skills:
            try:
                skill = Skill.objects.get(id=skill_id)
                ProjectSkill.objects.create(project=project, skill=skill)
            except Skill.DoesNotExist:
                pass  # Skip invalid skill IDs

        # Add creator as initial team member
        try:
            # TeamMember expects a UserProfile reference
            user_profile = getattr(self.context['request'].user, 'profile', None)
            if user_profile is not None:
                TeamMember.objects.create(project=project, user=user_profile)
        except Exception:
            # Do not fail project creation if team member add fails
            pass

        return project

    def update(self, instance, validated_data):
        # Handle skills if provided
        required_skills = validated_data.pop('required_skills', None)

        # Update basic fields via super
        project = super().update(instance, validated_data)

        # If skills provided, replace associations
        if required_skills is not None:
            from .models import ProjectSkill
            ProjectSkill.objects.filter(project=project).delete()
            for skill_id in required_skills:
                try:
                    skill = Skill.objects.get(id=skill_id)
                    ProjectSkill.objects.create(project=project, skill=skill)
                except Skill.DoesNotExist:
                    continue

        return project

    def validate_title(self, value):
        if len(value.strip()) < 5:
            raise serializers.ValidationError("Title must be at least 5 characters long.")
        if len(value) > 255:
            raise serializers.ValidationError("Title must not exceed 255 characters.")
        return value.strip()

    def validate_max_team_size(self, value):
        if value is not None and (value < 1 or value > 10):
            raise serializers.ValidationError("Team size must be between 1 and 10.")
        return value

    def validate_deadline(self, value):
        from django.utils import timezone
        if value and value <= timezone.now().date():
            raise serializers.ValidationError("Deadline must be in the future.")
        return value


class StudyGroupMemberSerializer(serializers.ModelSerializer):
    user_details = serializers.SerializerMethodField()

    class Meta:
        model = StudyGroupMember
        fields = ['user', 'joined_at', 'user_details']
        read_only_fields = ['joined_at']

    def get_user_details(self, obj):
        try:
            # Assuming the user is a CustomUser model
            return {
                'usn': obj.user.pk,
                'full_name': obj.user.get_full_name() if hasattr(obj.user, 'get_full_name') else '',
            }
        except Exception as e:
            print(f"Error getting user details: {e}")
            return {}


class StudyGroupSerializer(serializers.ModelSerializer):
    topics = serializers.ListField(
        child=serializers.CharField(),
        required=False,
        write_only=True
    )
    topics_display = serializers.SerializerMethodField(read_only=True)
    members = StudyGroupMemberSerializer(source='studygroupmember_set', many=True, read_only=True)
    is_owner = serializers.SerializerMethodField(read_only=True)
    owner_id = serializers.SerializerMethodField(read_only=True)
    owner_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = StudyGroup
        fields = [
            'group_id', 'name', 'description', 'course_code', 'subject_area',
            'max_size', 'created_at', 'members', 'topics', 'topics_display', 'is_owner', 'owner_id', 'owner_name'
        ]
        read_only_fields = ['group_id', 'created_at']

    def to_internal_value(self, data):
        # Convert topics to a list if it's a string
        if 'topics' in data and isinstance(data['topics'], str):
            data['topics'] = [topic.strip() for topic in data['topics'].split(',') if topic.strip()]
        return super().to_internal_value(data)

    def get_topics_display(self, obj):
        # Convert topics from comma-separated string to list
        return obj.topics.split(',') if obj.topics else []

    def get_is_owner(self, obj):
        try:
            request = self.context.get('request')
            return bool(request and request.user and obj.created_by_id == request.user.id)
        except Exception:
            return False

    def get_owner_id(self, obj):
        try:
            return obj.created_by_id
        except Exception:
            return None

    def get_owner_name(self, obj):
        try:
            u = obj.created_by
            return u.get_full_name() if hasattr(u, 'get_full_name') else getattr(u, 'username', None)
        except Exception:
            return None

    def create(self, validated_data):
        # Handle topics if provided
        topics = validated_data.pop('topics', None)
        validated_data['created_by'] = self.context['request'].user
        
        # Create the study group
        study_group = super().create(validated_data)
        
        # Save topics if provided
        if topics:
            study_group.topics = ','.join(topics)
            study_group.save()
        
        return study_group

    def update(self, instance, validated_data):
        # Handle topics if provided
        topics = validated_data.pop('topics', None)
        
        # Update the study group
        study_group = super().update(instance, validated_data)
        
        # Update topics if provided
        if topics is not None:
            study_group.topics = ','.join(topics)
            study_group.save()
        
        return study_group

    def validate_name(self, value):
        value = value.strip()
        if len(value) < 3 or len(value) > 255:
            raise serializers.ValidationError('Name must be between 3 and 255 characters.')
        return value

    def validate_subject_area(self, value):
        value = value.strip()
        if len(value) < 2 or len(value) > 100:
            raise serializers.ValidationError('Subject must be between 2 and 100 characters.')
        return value

    def validate_max_size(self, value):
        if value is None or value < 1 or value > 10:
            raise serializers.ValidationError('Max group size must be between 1 and 10.')
        return value


class JoinRequestSerializer(serializers.ModelSerializer):
    requester_name = serializers.SerializerMethodField()
    requester_usn = serializers.SerializerMethodField()
    project = ProjectSerializer(read_only=True)
    group = StudyGroupSerializer(read_only=True)

    class Meta:
        model = JoinRequest
        fields = [
            'request_id', 'requester', 'requester_name', 'requester_usn',
            'project', 'group', 'request_type', 'message', 'status',
            'is_read', 'created_at', 'updated_at', 'responded_at'
        ]
        read_only_fields = ['request_id', 'created_at', 'updated_at', 'responded_at', 'status']

    def get_requester_name(self, obj):
        try:
            return obj.requester.get_full_name() if hasattr(obj.requester, 'get_full_name') else ''
        except Exception:
            return ''

    def get_requester_usn(self, obj):
        try:
            return obj.requester.pk  # USN is the primary key
        except Exception:
            return None