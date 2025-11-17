"""
Advanced matching module for finding potential study group members using skill-based matching
with graph analysis and network effects, optimized for study groups with proficiency-based ranking.
"""
from __future__ import annotations

import logging
from typing import Dict, List, Any, Set, Tuple, Optional, TypedDict, DefaultDict
from collections import defaultdict

import numpy as np
import pandas as pd
from django.db.models import Prefetch, Q
from sentence_transformers import SentenceTransformer

from accounts.models import UserProfile, UserSkill, CustomUser
from .models import StudyGroup, StudyGroupMember, StudyGroupSkill
from .skill_utils import (
    get_user_availability_overlap,
    get_user_availability_entries,
    compute_skill_scores,
    enhance_scores_with_graph,
    get_skill_embeddings
)

# Constants for scoring weights and thresholds
SKILL_MATCH_WEIGHT = 0.6
AVAILABILITY_WEIGHT = 0.4
SKILL_SIMILARITY_THRESHOLD = 0.5
NETWORK_WEIGHT = 0.1
MAX_MATCHED_SKILLS = 5
MIN_SIMILARITY_FOR_PROFICIENCY = 0.5
PROFICIENCY_MAX_BONUS = 0.4  # Max bonus from proficiency (40% of skill component)

logger = logging.getLogger(__name__)

class MatchResult(TypedDict):
    """Type definition for match results."""
    user_id: str
    name: str
    email: str
    department: Optional[str]
    year: Optional[int]
    skills: List[Dict[str, Any]]
    match_score: float
    match_percentage: float
    skill_match: float
    adjusted_skill_match: float
    proficiency_bonus: float
    avg_proficiency: float
    availability_match: float
    matched_skills: List[Dict[str, Any]]
    availability: List[Dict[str, Any]]
    profile_url: str

def _get_group_skills(group_id: int) -> List[str]:
    """Get the list of skills required for a study group."""
    return list(
        StudyGroupSkill.objects
        .filter(study_group_id=group_id)
        .select_related('skill')
        .values_list('skill__name', flat=True)
    )

def _get_potential_members(group_id: int, group_topics: List[str]) -> Tuple[List[Dict[str, Any]], Dict[str, Any], Dict[str, List[Dict[str, Any]]], Set[str]]:
    """Get potential members for a study group with their skills."""
    # Get current members to exclude
    current_members = StudyGroupMember.objects.filter(group_id=group_id).values_list('user_id', flat=True)
    
    # Find users with matching skills/interests
    user_skills_prefetch = Prefetch(
        'user__user_skills',
        queryset=UserSkill.objects.select_related('skill')
    )
    
    potential_members = UserProfile.objects.exclude(
        user_id__in=current_members
    ).select_related('user').prefetch_related(user_skills_prefetch)
    
    # If group has topics, filter by them
    if group_topics:
        potential_members = potential_members.filter(
            Q(user__user_skills__skill__name__in=group_topics) |
            Q(bio__icontains=StudyGroup.objects.get(group_id=group_id).subject_area)
        ).distinct()

    candidate_records = []
    profile_by_usn = {}
    user_skill_details = {}
    candidate_skill_names = set()

    for profile in potential_members[:1000]:  # Limit to prevent excessive processing
        custom_user = profile.user
        if not isinstance(custom_user, CustomUser):
            continue

        skills_normalized = []
        skill_entries = []

        for user_skill in custom_user.user_skills.all():
            if not user_skill.skill:
                continue
            original_name = user_skill.skill.name.strip()
            if not original_name:
                continue
            normalized = original_name.lower()
            skills_normalized.append(normalized)
            candidate_skill_names.add(normalized)
            skill_entries.append({
                'skill_id': user_skill.skill_id,
                'name': original_name,
                'proficiency': user_skill.proficiency_level,
            })

        skill_proficiencies = {
            entry['name'].strip().lower(): entry.get('proficiency', 3)
            for entry in skill_entries
            if entry.get('name')
        }
        
        candidate_records.append({
            'USN': custom_user.usn,
            'Department': custom_user.department.name if custom_user.department else '',
            'Skill': '; '.join(skills_normalized),
            'Skill_Proficiencies': skill_proficiencies
        })
        user_skill_details[custom_user.usn] = skill_entries
        profile_by_usn[custom_user.usn] = profile

    return candidate_records, profile_by_usn, user_skill_details, candidate_skill_names

def _calculate_scores(
    row: pd.Series,
    matched_details: Dict[str, List[Dict[str, Any]]],
    skill_entries: List[Dict[str, Any]],
    current_member_usns: List[str],
    usn: str,
    profile_by_usn: Dict[str, UserProfile],
    include_availability: bool = True
) -> Dict[str, Any]:
    """Calculate all scores for a candidate."""
    skill_component = float(row.get('Network_Enhanced_Score', row.get('Weighted_Score', 0.0)))
    skill_component = min(max(skill_component, 0.0), 1.0)

    # Calculate availability score
    overlaps = [
        get_user_availability_overlap(member_usn, usn)
        for member_usn in current_member_usns
        if member_usn and member_usn != usn
    ]
    availability_score = sum(overlaps) / len(overlaps) if overlaps else 0.5

    # Store the original skill component before adjustments
    original_skill_component = skill_component
    matched_items = matched_details.get(usn, [])
    skill_lookup = {entry['name'].strip().lower(): entry for entry in skill_entries if entry.get('name')}
    matched_skills = []

    # Track proficiency bonus separately for the response
    proficiency_bonus = 0
    total_proficiency = 0
    valid_skills = 0

    for item in matched_items:
        matched_name = item['matched_skill']
        source_entry = skill_lookup.get(matched_name)
        proficiency = source_entry.get('proficiency') if source_entry else None

        # Only consider valid proficiencies (1-5)
        if proficiency is not None and 1 <= proficiency <= 5:
            # For study groups, lower proficiency gets higher bonus
            # This gives weights: 1.0 (proficiency 1) to 0.2 (proficiency 5)
            proficiency_bonus_per_skill = ((6 - proficiency) * 0.08)  # 40% for 1, 32% for 2, 24% for 3, 16% for 4, 8% for 5
            proficiency_bonus += proficiency_bonus_per_skill
            total_proficiency += proficiency
            valid_skills += 1

        matched_skills.append({
            'name': source_entry['name'] if source_entry else matched_name,
            'proficiency': proficiency,
            'similarity': round(item.get('similarity', 0.0), 3),
        })

    # Apply the calculated proficiency bonus
    avg_proficiency = 0
    if valid_skills > 0:
        # Calculate average proficiency for display
        avg_proficiency = total_proficiency / valid_skills
        # Apply the total bonus to the skill component, capping at PROFICIENCY_MAX_BONUS
        proficiency_bonus = min(proficiency_bonus, PROFICIENCY_MAX_BONUS)
        skill_component = min(skill_component * (1.0 + proficiency_bonus), 1.0)

    matched_skills = matched_skills[:MAX_MATCHED_SKILLS]

    # Final score calculation with adjusted skill component
    if include_availability and current_member_usns:
        final_score = (0.6 * skill_component) + (0.4 * availability_score)
    else:
        final_score = skill_component  # Only use skill component if availability is not included
    
    profile = profile_by_usn.get(usn, {})
    user = getattr(profile, 'user', {})
    
    return {
        'user_id': usn,
        'name': getattr(user, 'get_full_name', lambda: getattr(user, 'email', ''))(),
        'email': getattr(user, 'email', ''),
        'department': getattr(getattr(user, 'department', None), 'name', None),
        'year': getattr(user, 'study_year', None),
        'skills': skill_entries,
        'match_score': round(final_score * 100, 1),
        'match_percentage': round(final_score * 100, 1),
        'skill_match': round(original_skill_component * 100, 1),
        'adjusted_skill_match': round(skill_component * 100, 1),
        'proficiency_bonus': round((proficiency_bonus * 100) if valid_skills > 0 else 0, 1),
        'avg_proficiency': round(avg_proficiency, 1) if valid_skills > 0 else 0,
        'availability_match': round(availability_score * 100, 1),
        'matched_skills': matched_skills,
        'availability': get_user_availability_entries(usn),
        'profile_url': f"/profile/{usn}",
    }

def get_advanced_group_matches(
    group_id: int, 
    limit: int = 20, 
    include_availability: bool = True,
    selected_skills: Optional[List[str]] = None
) -> List[MatchResult]:
    """
    Find potential members for a study group using advanced matching.
    This version is specifically optimized for study groups with proficiency-based ranking.
    
    Args:
        group_id: ID of the study group to find members for
        limit: Maximum number of matches to return
        include_availability: Whether to include availability in scoring
        selected_skills: List of skill names to filter by (optional)
        
    Returns:
        List of user profiles with match scores and details
    """
    try:
        # Get group skills
        group_topics = _get_group_skills(group_id)
        if not group_topics:
            logger.warning(f"No skills found for study group {group_id}")
            return []
            
        # Get potential members and their skills
        candidate_records, profile_by_usn, user_skill_details, candidate_skill_names = _get_potential_members(
            group_id, selected_skills if selected_skills else group_topics
        )

        if not candidate_records:
            return []

        # Compute skill scores and enhance with network effects
        df = pd.DataFrame(candidate_records)
        scored_df, matched_details = compute_skill_scores(
            df, group_topics, similarity_threshold=SKILL_SIMILARITY_THRESHOLD
        )

        skill_embeddings_dict = get_skill_embeddings(
            list(candidate_skill_names | set(topic.lower() for topic in group_topics))
        )
        enhanced_df = enhance_scores_with_graph(
            df, scored_df, group_topics, skill_embeddings_dict, network_weight=NETWORK_WEIGHT
        )

        # Get current members for availability calculation
        current_member_usns = [str(usn) for usn in StudyGroupMember.objects
                             .filter(group_id=group_id)
                             .values_list('user_id', flat=True)]
        
        # Calculate scores for each candidate
        results = []
        for _, row in enhanced_df.iterrows():
            usn = str(row.get('USN', ''))
            if usn not in profile_by_usn:
                continue
                
            result = _calculate_scores(
                row=row,
                matched_details=matched_details,
                skill_entries=user_skill_details.get(usn, []),
                current_member_usns=current_member_usns if include_availability else [],
                usn=usn,
                profile_by_usn=profile_by_usn,
                include_availability=include_availability
            )
            results.append(result)

        # Sort by match score in descending order and limit results
        results.sort(key=lambda x: x['match_score'], reverse=True)
        return results[:limit]

    except StudyGroup.DoesNotExist:
        logger.error(f"Study group {group_id} not found")
        return []
    except Exception as e:
        logger.exception(f"Error in get_advanced_group_matches: {str(e)}")
        return []

        results.sort(key=lambda x: x['match_score'], reverse=True)
        return results[:limit]
        
    except Exception as e:
        logger.error(f"Error in advanced group matching: {str(e)}", exc_info=True)
        return []
