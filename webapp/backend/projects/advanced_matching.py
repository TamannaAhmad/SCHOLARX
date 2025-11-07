"""
Advanced matching functionality using the Profile_matching system.
This module integrates the GNN and SNA based matching from the Profile_matching directory.
"""
import os
import sys
import pandas as pd
import numpy as np
from typing import List, Dict, Any, Optional
from django.conf import settings
from django.db.models import Q
from accounts.models import UserProfile, UserSkill, Skill, UserAvailability
from projects.models import Project, ProjectSkill, TeamMember

# Add the Profile_matching directory to the Python path
def setup_advanced_matching():
    """Initialize the advanced matching system."""
    global ADVANCED_MATCHING_AVAILABLE
    
    try:
        profile_matching_path = os.path.join(settings.BASE_DIR, '..', '..', 'Profile_matching')
        if os.path.exists(profile_matching_path) and profile_matching_path not in sys.path:
            sys.path.append(profile_matching_path)

        from graph_analysis import (
            build_student_skill_graph,
            detect_communities_graph,
            compute_network_centrality,
            compute_complementarity_score,
            enhance_scores_with_graph
        )
        from nlp import get_sentence_model, encode_texts, compute_similarity_matrix
        
        # Store the imported modules/functions as globals
        globals().update({
            'build_student_skill_graph': build_student_skill_graph,
            'detect_communities_graph': detect_communities_graph,
            'compute_network_centrality': compute_network_centrality,
            'compute_complementarity_score': compute_complementarity_score,
            'enhance_scores_with_graph': enhance_scores_with_graph,
            'get_sentence_model': get_sentence_model,
            'encode_texts': encode_texts,
            'compute_similarity_matrix': compute_similarity_matrix
        })
        
        ADVANCED_MATCHING_AVAILABLE = True
        return True
        
    except ImportError as e:
        print(f"Warning: Advanced matching features not available: {e}")
        ADVANCED_MATCHING_AVAILABLE = False
        return False

# Initialize advanced matching on module import
ADVANCED_MATCHING_AVAILABLE = setup_advanced_matching()

def get_required_skills_embeddings(project_id: int) -> Dict[str, np.ndarray]:
    """
    Get embeddings for all required skills of a project.
    """
    if not ADVANCED_MATCHING_AVAILABLE:
        return {}
        
    try:
        model = get_sentence_model()
        project_skills = ProjectSkill.objects.filter(project_id=project_id).select_related('skill')
        
        skill_names = [ps.skill.name for ps in project_skills]
        if not skill_names:
            return {}
            
        # Get embeddings for each skill
        embeddings = {}
        for skill in skill_names:
            embedding = model.encode([skill], show_progress_bar=False, convert_to_numpy=True)
            embeddings[skill] = embedding[0]  # Store as 1D array
            
        return embeddings
    except Exception as e:
        print(f"Error getting skill embeddings: {e}")
        return {}

def get_user_skills_dataframe() -> pd.DataFrame:
    """
    Get all users and their skills as a pandas DataFrame for the matching system.
    """
    users = UserProfile.objects.all().select_related('user')
    
    data = []
    users_with_skills = 0
    
    for user in users:
        skills = UserSkill.objects.filter(user=user.user).select_related('skill')
        skill_list = list(skills)  # Convert to list to avoid multiple queries
        
        if skill_list:  # Only include users with skills
            users_with_skills += 1
            skill_names = [f"{us.skill.name} ({us.proficiency_level}/5)" for us in skill_list]
            
            data.append({
                'USN': user.user.usn,
                'Name': f"{user.user.first_name} {user.user.last_name}".strip(),
                'Email': user.user.email,
                'Department': user.user.department.name if user.user.department else 'Undeclared',
                'Year': user.user.study_year or 'N/A',
                'Skills': "; ".join(skill_names),
                'RawSkills': [us.skill.name.lower() for us in skill_list],
                'SkillProficiencies': {us.skill.name.lower(): us.proficiency_level for us in skill_list}
            })
    
    return pd.DataFrame(data)

def get_advanced_matches(project_id: int, limit: int = 20, selected_skills: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Get advanced matches for a project using the Profile_matching system.
    Returns a list of user profiles with enhanced matching scores.
    """
    if not ADVANCED_MATCHING_AVAILABLE:
        return []
    
    try:
        print(f"[DEBUG] Starting advanced matching for project {project_id}")
        
        # Get project and required skills
        project = Project.objects.get(project_id=project_id)
        required_skills = list(ProjectSkill.objects.filter(
            project_id=project_id
        ).select_related('skill').values_list('skill__name', flat=True))
        
        # If specific skills are selected, use those; otherwise use all required skills
        if selected_skills:
            # Only include skills that are actually in the project's required skills
            filtered_skills = [s for s in selected_skills if s in required_skills]
            if filtered_skills:
                required_skills = filtered_skills
                print(f"[DEBUG] Using selected skills: {required_skills}")
            else:
                print("[DEBUG] No valid selected skills, using all required skills")
        
        # Store the original required skills for filtering
        original_required_skills = required_skills.copy()
        
        if not required_skills:
            print("[DEBUG] No required skills found for project")
            return {
                'project_title': project.title,
                'required_skills': required_skills,
                'profiles': []
            }
        
        df = get_user_skills_dataframe()
        
        if df.empty:
            return []
            
        # Get skill embeddings
        skill_embeddings = get_required_skills_embeddings(project_id)
        
        # Build skill graph and detect communities
        adjacency, usn_to_id = build_student_skill_graph(df, skill_embeddings)
        communities = detect_communities_graph(adjacency)
        
        # Get network centrality
        centrality_scores = compute_network_centrality(adjacency, usn_to_id)
        
        # First compute base scores with skill similarities
        import sys
        from pathlib import Path
        
        # Add the project root to Python path
        project_root = str(Path(__file__).resolve().parents[3])
        if project_root not in sys.path:
            sys.path.append(project_root)
            
        from Profile_matching.matching_utils import compute_skill_similarity
        
        # Compute base scores with skill similarities
        base_df, _ = compute_skill_similarity(
            df,
            input_skills=required_skills,
            similarity_threshold=0.3  # Default threshold
        )
        
        # Keep only necessary columns for enhancement
        ranked_df = pd.DataFrame({
            'USN': df['USN'],
            'Name': df['Name'],
            'Skills': df['Skills'],
            'Department': df['Department'],
            'Year': df['Year'],
            'Weighted_Score': base_df['Weighted_Score'],
            'Average_Similarity': base_df['Average_Similarity']
        })
        
        # Enhance scores with graph analysis
        enhanced_df = enhance_scores_with_graph(
            df, 
            ranked_df, 
            required_skills,
            skill_embeddings,
            network_weight=0.2  # Adjust based on testing
        )
        
        # Convert to list of dicts
        results = []
        for _, row in enhanced_df.head(limit).iterrows():
            # Skip if no skills match the selected ones
            if not any(skill in row['Skills'] for skill in original_required_skills):
                print(f"[DEBUG] Skipping user {row['USN']} - no matching skills")
                continue
                
            try:
                user = UserProfile.objects.get(user__usn=row['USN'])
                
                # Get availability
                availability = list(UserAvailability.objects
                                   .filter(user=user.user, is_available=True)
                                   .values('day_of_week', 'time_slot_start', 'time_slot_end'))
            except UserProfile.DoesNotExist:
                print(f"[DEBUG] User profile not found for USN: {row['USN']}")
                continue
            
            profile_data = {
                'id': user.user.usn,  # Using usn as the ID since it's the primary key
                'usn': user.user.usn,
                'name': f"{user.user.first_name} {user.user.last_name}".strip(),
                'email': user.user.email,
                'department': user.user.department.name if user.user.department else None,
                'year': user.user.study_year,
                'skills': row['Skills'],
                'match_percentage': round(row['Network_Enhanced_Score'] * 100, 1),
                'availability': availability,
                'match_details': {
                    'skill_similarity': round(row['Average_Similarity'] * 100, 1),
                    'network_centrality': round(row.get('Network_Centrality', 0) * 100, 1),
                    'community_bonus': round(row.get('Community_Bonus', 0) * 100, 1)
                },
                # Add match_details at root level for backward compatibility
                'skill_similarity': round(row['Average_Similarity'] * 100, 1),
                'network_centrality': round(row.get('Network_Centrality', 0) * 100, 1),
                'community_bonus': round(row.get('Community_Bonus', 0) * 100, 1)
            }
            results.append(profile_data)
            
        # Return results with match details and required skills
        return {
            'project_title': project.title,
            'required_skills': required_skills,
            'profiles': results
        }
        
    except Exception as e:
        print(f"Error in advanced matching: {e}")
        return []
