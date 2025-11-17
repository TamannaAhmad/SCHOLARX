"""
Utility functions for skill matching and availability calculation.
This module provides functions for calculating skill matches and availability overlaps.
"""
from typing import Dict, List, Any, Tuple, Set, Optional
import logging
import numpy as np
import pandas as pd
from django.db.models import Q
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.feature_extraction.text import TfidfVectorizer
import networkx as nx
from collections import defaultdict

logger = logging.getLogger(__name__)

def get_user_availability_overlap(user1_id: str, user2_id: str) -> float:
    """
    Calculate the availability overlap between two users.
    Returns a score between 0 (no overlap) and 1 (perfect overlap).
    """
    from accounts.models import UserAvailability
    
    # Get availability for both users
    user1_availability = set(
        UserAvailability.objects
        .filter(user_id=user1_id, is_available=True)
        .values_list('day_of_week', 'time_slot_start', 'time_slot_end')
    )
    
    user2_availability = set(
        UserAvailability.objects
        .filter(user_id=user2_id, is_available=True)
        .values_list('day_of_week', 'time_slot_start', 'time_slot_end')
    )
    
    if not user1_availability or not user2_availability:
        return 0.5  # Neutral score if no availability data
    
    # Calculate overlap
    overlap = len(user1_availability.intersection(user2_availability))
    max_possible = min(len(user1_availability), len(user2_availability))
    
    return overlap / max_possible if max_possible > 0 else 0

def get_user_availability_entries(user_id: str) -> List[Dict[str, Any]]:
    """
    Get a user's availability entries.
    """
    from accounts.models import UserAvailability
    
    return list(
        UserAvailability.objects
        .filter(user_id=user_id, is_available=True)
        .values('day_of_week', 'time_slot_start', 'time_slot_end')
    )

def compute_skill_scores(
    df: pd.DataFrame, 
    required_skills: List[str],
    similarity_threshold: float = 0.5
) -> Tuple[pd.DataFrame, Dict[str, List[Dict[str, Any]]]]:
    """
    Compute skill match scores between candidates and required skills.
    Returns a tuple of (scored_df, matched_details)
    """
    if df.empty or not required_skills:
        return pd.DataFrame(), {}
    
    # Create a copy to avoid modifying the original
    df = df.copy()
    
    # Initialize TF-IDF vectorizer
    vectorizer = TfidfVectorizer(tokenizer=lambda x: x.lower().split('; '), token_pattern=None)
    
    # Fit and transform the skills
    try:
        tfidf_matrix = vectorizer.fit_transform(df['Skill'].fillna(''))
    except ValueError:
        # If no valid skills, return empty results
        return pd.DataFrame(), {}
    
    # Calculate similarity between required skills and candidate skills
    matched_details = {}
    skill_scores = []
    
    for _, row in df.iterrows():
        user_skills = row['Skill'].lower().split('; ')
        user_skill_proficiencies = row.get('Skill_Proficiencies', {})
        
        matches = []
        total_similarity = 0.0
        
        for req_skill in required_skills:
            req_skill_lower = req_skill.lower()
            best_similarity = 0.0
            best_match = None
            
            for user_skill in user_skills:
                # Simple string matching first
                if req_skill_lower in user_skill or user_skill in req_skill_lower:
                    similarity = 0.9  # High similarity for substring matches
                else:
                    # Use TF-IDF similarity for more complex matching
                    req_vec = vectorizer.transform([req_skill_lower])
                    user_vec = vectorizer.transform([user_skill])
                    similarity = cosine_similarity(req_vec, user_vec)[0][0]
                
                if similarity > best_similarity and similarity >= similarity_threshold:
                    best_similarity = similarity
                    best_match = user_skill
            
            if best_match is not None:
                matches.append({
                    'required_skill': req_skill,
                    'matched_skill': best_match,
                    'similarity': best_similarity,
                    'proficiency': user_skill_proficiencies.get(best_match, 0)
                })
                total_similarity += best_similarity
        
        # Calculate average similarity score
        avg_similarity = total_similarity / len(required_skills) if required_skills else 0
        skill_scores.append(avg_similarity)
        
        # Store match details
        user_id = row['USN']
        matched_details[user_id] = matches
    
    # Add scores to dataframe
    df['Skill_Score'] = skill_scores
    
    return df, matched_details

def get_skill_embeddings(skills: List[str]) -> Dict[str, np.ndarray]:
    """
    Convert skills to embeddings using TF-IDF.
    Returns a dictionary mapping skill names to their embeddings.
    """
    if not skills:
        return {}
    
    # Simple TF-IDF vectorizer for skill embeddings
    vectorizer = TfidfVectorizer()
    try:
        tfidf_matrix = vectorizer.fit_transform(skills)
    except ValueError:
        return {}
    
    # Convert to dictionary of numpy arrays
    return {
        skill: tfidf_matrix[i].toarray().flatten()
        for i, skill in enumerate(skills)
    }

def enhance_scores_with_graph(
    df: pd.DataFrame,
    scored_df: pd.DataFrame,
    required_skills: List[str],
    skill_embeddings: Dict[str, np.ndarray],
    network_weight: float = 0.1
) -> pd.DataFrame:
    """
    Enhance match scores using graph-based network analysis.
    """
    if df.empty or 'Skill_Score' not in scored_df.columns:
        return df
    
    # Create a graph
    G = nx.Graph()
    
    # Add nodes for skills and users
    for skill in required_skills:
        G.add_node(f"skill_{skill}", type='skill')
    
    for _, row in df.iterrows():
        user_id = row['USN']
        G.add_node(user_id, type='user')
        
        # Add edges between users and their skills
        user_skills = row['Skill'].lower().split('; ')
        for skill in user_skills:
            if f"skill_{skill}" in G:
                G.add_edge(user_id, f"skill_{skill}", weight=1.0)
    
    # Calculate PageRank scores
    try:
        pagerank = nx.pagerank(G, weight='weight')
    except:
        # If PageRank fails, return the original scores
        return scored_df
    
    # Calculate network-enhanced scores
    network_scores = []
    for _, row in df.iterrows():
        user_id = row['USN']
        network_score = pagerank.get(user_id, 0)
        network_scores.append(network_score)
    
    # Normalize network scores
    if network_scores:
        max_network = max(network_scores) if max(network_scores) > 0 else 1
        network_scores = [s / max_network for s in network_scores]
    
    # Combine with original scores
    enhanced_scores = []
    for i, row in scored_df.iterrows():
        original_score = row['Skill_Score']
        network_score = network_scores[i] if i < len(network_scores) else 0
        enhanced_score = (1 - network_weight) * original_score + network_weight * network_score
        enhanced_scores.append(enhanced_score)
    
    # Add enhanced scores to the dataframe
    scored_df['Network_Enhanced_Score'] = enhanced_scores
    
    return scored_df
