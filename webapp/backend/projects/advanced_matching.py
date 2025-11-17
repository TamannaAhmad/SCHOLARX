"""
Advanced matching module for finding potential project teammates using skill-based matching
with graph analysis and network effects.
"""
from __future__ import annotations

import logging
import time
from typing import List, Dict, Any, Optional, Set, Tuple, TypedDict, DefaultDict
from collections import defaultdict

import numpy as np
import pandas as pd
from django.db.models import Prefetch, QuerySet
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.cluster import DBSCAN

from accounts.models import UserProfile, UserSkill, CustomUser
from .models import Project, ProjectSkill, TeamMember

# Constants for scoring weights and thresholds
SKILL_MATCH_WEIGHT = 0.7
NETWORK_ENHANCE_WEIGHT = 0.3
AVAILABILITY_WEIGHT = 0.2
PROFICIENCY_BONUS_WEIGHT = 0.2
SKILL_SIMILARITY_THRESHOLD = 0.5
NETWORK_SIMILARITY_THRESHOLD = 0.3
MAX_MATCHED_SKILLS = 5
MIN_SIMILARITY_FOR_PROFICIENCY = 0.5
PROFICIENCY_MAX_BONUS = 0.4  # Max bonus from proficiency (40% of skill component)

# Type aliases
SkillDict = Dict[str, Any]
UserProfileDict = Dict[str, Any]
SkillProficiency = Dict[str, float]
MatchedSkill = Dict[str, Any]
ScoreBreakdown = Dict[str, Dict[str, Any]]

class MatchResult(TypedDict):
    """Type definition for match results."""
    user_id: str
    name: str
    email: str
    department: Optional[str]
    year: Optional[int]
    skills: List[SkillDict]
    match_score: float
    match_percentage: float
    skill_match: float
    availability_match: float
    score_breakdown: ScoreBreakdown
    matched_skills: List[MatchedSkill]
    availability: List[Dict[str, Any]]
    profile_url: str

logger = logging.getLogger(__name__)

# Flag to enable/disable advanced features
ADVANCED_MATCHING_AVAILABLE = True

_SENTENCE_MODEL: Optional[SentenceTransformer] = None
_SKILL_EMBED_CACHE: Dict[str, np.ndarray] = {}


def get_sentence_model() -> SentenceTransformer:
    """
    Lazily initialize and cache the sentence transformer model.
    
    Returns:
        SentenceTransformer: The initialized sentence transformer model.
    """
    global _SENTENCE_MODEL
    if _SENTENCE_MODEL is None:
        _SENTENCE_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _SENTENCE_MODEL


def encode_texts(texts: List[str]) -> np.ndarray:
    """
    Encode a list of texts into normalized SBERT embeddings.
    
    Args:
        texts: List of text strings to encode
        
    Returns:
        np.ndarray: Array of embeddings with shape (n_texts, embedding_dim)
    """
    if not texts:
        return np.zeros((0, 384), dtype=np.float32)
    try:
        model = get_sentence_model()
        emb = model.encode(
            texts,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return emb.astype(np.float32)
    except Exception as e:
        logger.error(f"Error encoding texts: {e}")
        return np.zeros((len(texts), 384), dtype=np.float32)


def compute_similarity_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """
    Compute the cosine similarity matrix between two sets of embeddings.
    
    Args:
        a: First set of embeddings (n_samples_a, n_features)
        b: Second set of embeddings (n_samples_b, n_features)
        
    Returns:
        np.ndarray: Similarity matrix of shape (n_samples_a, n_samples_b)
    """
    if a.size == 0 or b.size == 0:
        b_cols = b.shape[0] if b.ndim > 1 else 0
        return np.zeros((a.shape[0], b_cols), dtype=np.float32)
    return np.inner(a, b)


def get_skill_embeddings(skills: List[str]) -> Dict[str, np.ndarray]:
    """
    Get cached embeddings for the provided skills, computing them if necessary.
    
    Args:
        skills: List of skill strings to get embeddings for
        
    Returns:
        Dict mapping normalized skill strings to their embeddings
    """
    embeddings: Dict[str, np.ndarray] = {}
    pending: List[str] = []

    for skill in skills:
        if not isinstance(skill, str):
            continue
        normalized = skill.strip().lower()
        if not normalized:
            continue
        if normalized in _SKILL_EMBED_CACHE:
            embeddings[normalized] = _SKILL_EMBED_CACHE[normalized]
        else:
            pending.append(skill.strip())

    if pending:
        new_emb = encode_texts(pending)
        for original, vector in zip(pending, new_emb):
            normalized = original.lower()
            _SKILL_EMBED_CACHE[normalized] = vector
            embeddings[normalized] = vector

    return embeddings


def normalize_and_split_skills(skills_text: str) -> List[str]:
    """
    Normalize and split a string of skills into a list of unique skill strings.
    
    Args:
        skills_text: Input string containing skills separated by | or ;
        
    Returns:
        List of unique, normalized skill strings
    """
    if not isinstance(skills_text, str) or not skills_text.strip():
        return []
    parts = [p.strip().lower() for p in skills_text.replace("|", ";").split(";")]
    parts = [p for p in parts if p]
    seen: Set[str] = set()
    ordered: List[str] = []
    for part in parts:
        if part not in seen:
            seen.add(part)
            ordered.append(part)
    return ordered


def compute_skill_scores(
    df: pd.DataFrame,
    input_skills: List[str],
    similarity_threshold: float = 0.5,
) -> Tuple[pd.DataFrame, Dict[str, List[Dict[str, Any]]]]:
    if df.empty or not input_skills:
        df = df.copy()
        df["Average_Similarity"] = 0.0
        df["Weighted_Score"] = 0.0
        return df, {}

    input_skills = [s.lower().strip() for s in input_skills if isinstance(s, str) and s.strip()]
    if not input_skills:
        df = df.copy()
        df["Average_Similarity"] = 0.0
        df["Weighted_Score"] = 0.0
        return df, {}

    input_emb = encode_texts(input_skills)

    student_skill_lists: List[List[str]] = []
    student_skill_texts: List[str] = []
    row_to_skill_slice: List[Tuple[int, int]] = []

    for _, row in df.iterrows():
        skills = normalize_and_split_skills(row.get("Skill", ""))
        start = len(student_skill_texts)
        student_skill_lists.append(skills)
        student_skill_texts.extend(skills if skills else [""])
        row_to_skill_slice.append((start, len(student_skill_texts)))

    if not student_skill_texts:
        df = df.copy()
        df["Average_Similarity"] = 0.0
        df["Weighted_Score"] = 0.0
        return df, {}

    student_emb = encode_texts(student_skill_texts)
    sim_full = compute_similarity_matrix(input_emb, student_emb)

    avg_scores: List[Tuple[float, float]] = []
    matched_details_by_usn: Dict[str, List[Dict[str, Any]]] = {}

    for idx, (_, row) in enumerate(df.iterrows()):
        usn = str(row.get("USN", ""))
        skills = student_skill_lists[idx]
        s_idx, e_idx = row_to_skill_slice[idx]

        if e_idx <= s_idx or not skills:
            avg_scores.append((0.0, 0.0))
            matched_details_by_usn[usn] = []
            continue

        sim_slice = sim_full[:, s_idx:e_idx]
        max_per_input: List[Tuple[float, str]] = []
        matched_details: List[Dict[str, Any]] = []

        skill_proficiencies_raw = row.get("Skill_Proficiencies", {})
        skill_proficiencies = skill_proficiencies_raw if isinstance(skill_proficiencies_raw, dict) else {}

        for k, input_skill in enumerate(input_skills):
            if k >= len(sim_slice):
                continue
            row_sim = sim_slice[k]
            if row_sim.size == 0:
                continue
            max_idx = int(np.argmax(row_sim))
            max_sim = float(row_sim[max_idx])
            matched_skill = skills[max_idx] if max_idx < len(skills) else ""
            max_per_input.append((max_sim, matched_skill))

            if max_sim >= similarity_threshold and matched_skill:
                prof_value = skill_proficiencies.get(matched_skill, 3)
                matched_details.append(
                    {
                        "input_skill": input_skill,
                        "matched_skill": matched_skill,
                        "similarity": max_sim,
                        "proficiency": prof_value,
                    }
                )

        matched_skills_count = 0
        weighted_similarity_sum = 0.0
        total_proficiency = 0.0
        max_possible_proficiency = 0.0

        # First, collect all valid skill matches with their proficiencies
        valid_matches = []
        for sim, matched_skill in max_per_input:
            if sim < similarity_threshold or not matched_skill:
                continue
                
            # Get the proficiency, defaulting to 3 (intermediate) if not found
            try:
                prof_value = int(skill_proficiencies.get(matched_skill, 3))
            except (TypeError, ValueError):
                prof_value = 3  # Default to intermediate on error
                
            # Skip skills marked as 'want to learn' (0)
            if prof_value == 0:
                continue
                
            valid_matches.append((sim, prof_value))
        
        # Process valid matches to calculate scores
        for sim, prof_value in valid_matches:
            # Normalize proficiency to 0-1 range
            prof_norm = prof_value / 5.0
            
            matched_skills_count += 1
            total_proficiency += prof_value  # Keep as integer for bonus calculation
            max_possible_proficiency += 5.0  # Max proficiency per skill is 5
            
            # Weight similarity by proficiency (more weight to higher proficiencies)
            proficiency_weighted_sim = sim * (0.3 + 0.7 * prof_norm)
            weighted_similarity_sum += proficiency_weighted_sim

        # Calculate average score and coverage
        coverage = matched_skills_count / len(input_skills) if input_skills else 0.0
        
        # Calculate average score only for matched skills
        avg_score = (weighted_similarity_sum / matched_skills_count) if matched_skills_count > 0 else 0.0
        
        # Calculate proficiency bonus based on actual vs max possible proficiency
        proficiency_bonus = 0.0
        if max_possible_proficiency > 0 and matched_skills_count > 0:
            # Calculate average proficiency per matched skill (will be in 0-1 range)
            avg_proficiency = total_proficiency / matched_skills_count
            
            # Debug log the raw values
            logger.debug(f"User {usn} - Matched skills: {matched_skills_count}, "
                       f"Total proficiency: {total_proficiency}, "
                       f"Avg proficiency: {avg_proficiency:.2f}, "
                       f"Coverage: {coverage:.2f}")
            
            # Map discrete proficiency levels to bonus percentages
            # Since we know proficiencies are integers 1-5 (0 was already filtered out)
            # We'll use the average to determine the bonus
            if avg_proficiency < 0.2:  # ~1/5
                proficiency_bonus = 0.02  # 2%
            elif avg_proficiency < 0.4:  # ~2/5
                proficiency_bonus = 0.05  # 5%
            elif avg_proficiency < 0.6:  # ~3/5
                proficiency_bonus = 0.10  # 10%
            elif avg_proficiency < 0.8:  # ~4/5
                proficiency_bonus = 0.15  # 15%
            else:  # 5/5
                proficiency_bonus = 0.20  # 20%
            
            # Scale bonus by coverage with a non-linear curve
            # This gives more weight to users who match more skills
            coverage_factor = coverage ** 0.7  # Slight curve to favor higher coverage
            proficiency_bonus *= coverage_factor
            
            logger.debug(f"User {usn} - Base bonus: {proficiency_bonus/coverage_factor:.2f}, "
                       f"Coverage factor: {coverage_factor:.2f}, "
                       f"Final bonus: {proficiency_bonus:.2f}")
        
        # Cap the base score at 0.8 to leave room for bonus
        max_base_score = 0.8
        if coverage < 1.0:
            max_base_score = 0.1 + (0.7 * coverage)  # Base score up to 0.8 if all skills matched
        
        # Calculate base score (weighted average of similarity and coverage)
        base_score = min(max_base_score, (0.6 * avg_score) + (0.4 * coverage))
        
        # Add proficiency bonus to get final score (up to 1.0)
        weighted_score = min(1.0, base_score + proficiency_bonus)
        
        # Add a small bonus for multiple skill matches (up to 5%)
        if matched_skills_count > 1:
            # Scale the bonus by the number of matched skills, but with diminishing returns
            multi_skill_bonus = 0.05 * (1 - 0.9 ** (matched_skills_count - 1))
            weighted_score = min(1.0, weighted_score + multi_skill_bonus)

        avg_scores.append((avg_score, min(1.0, weighted_score)))
        matched_details_by_usn[usn] = matched_details

    df = df.copy()
    df["Average_Similarity"] = [score[0] for score in avg_scores]
    df["Weighted_Score"] = [score[1] for score in avg_scores]

    if len(df) > 1 and df["Weighted_Score"].max() > 0:
        max_score = df["Weighted_Score"].max()
        if max_score > 0.8:  # Only normalize if we have a strong match
            df["Weighted_Score"] = df["Weighted_Score"].clip(upper=1.0)
        else:
            # Scale scores to better differentiate between lower matches
            df["Weighted_Score"] = (df["Weighted_Score"] / max_score) * 0.8

    df = df.sort_values("Weighted_Score", ascending=False).reset_index(drop=True)
    return df, matched_details_by_usn


def build_student_skill_graph(
    df: pd.DataFrame,
    skill_embeddings: Dict[str, np.ndarray],
    similarity_threshold: float = 0.3,
) -> Tuple[Dict[int, Set[int]], Dict[str, int]]:
    adjacency: Dict[int, Set[int]] = defaultdict(set)
    usn_to_id: Dict[str, int] = {}
    id_to_usn: Dict[int, str] = {}

    for idx, row in df.iterrows():
        usn = str(row.get("USN", f"student_{idx}"))
        usn_to_id[usn] = idx
        id_to_usn[idx] = usn

    student_embeddings_list: List[np.ndarray] = []
    student_ids: List[int] = []

    emb_dim = 384
    if skill_embeddings:
        example = next(iter(skill_embeddings.values()))
        if example is not None and example.shape:
            emb_dim = example.shape[0]

    for idx, row in df.iterrows():
        skills = normalize_and_split_skills(row.get("Skill", ""))
        if skills:
            emb_list = [skill_embeddings.get(skill, np.zeros(emb_dim)) for skill in skills]
            student_emb = np.mean(emb_list, axis=0)
        else:
            student_emb = np.zeros(emb_dim)
        student_embeddings_list.append(student_emb)
        student_ids.append(idx)

    if len(student_embeddings_list) < 2:
        return dict(adjacency), usn_to_id

    embeddings_matrix = np.array(student_embeddings_list)
    sim_matrix = cosine_similarity(embeddings_matrix)

    for i, idx_i in enumerate(student_ids):
        for j, idx_j in enumerate(student_ids):
            if i < j and sim_matrix[i][j] >= similarity_threshold:
                adjacency[idx_i].add(idx_j)
                adjacency[idx_j].add(idx_i)

    return dict(adjacency), usn_to_id


def detect_communities_graph(
    adjacency: Dict[int, Set[int]],
    min_samples: int = 2,
    eps: float = 0.5,
) -> Dict[int, int]:
    if not adjacency:
        return {}

    nodes = sorted(adjacency.keys())
    node_to_idx = {node: i for i, node in enumerate(nodes)}
    n_nodes = len(nodes)

    if n_nodes < 2:
        return {nodes[0]: 0} if n_nodes == 1 else {}

    adj_matrix = np.zeros((n_nodes, n_nodes))
    for node, neighbors in adjacency.items():
        if node not in node_to_idx:
            continue
        i = node_to_idx[node]
        for neighbor in neighbors:
            if neighbor in node_to_idx:
                j = node_to_idx[neighbor]
                adj_matrix[i][j] = 1
                adj_matrix[j][i] = 1

    clustering = DBSCAN(min_samples=min_samples, eps=eps, metric="precomputed")
    dist_matrix = 1 - adj_matrix
    np.fill_diagonal(dist_matrix, 0)

    try:
        labels = clustering.fit_predict(dist_matrix)
    except Exception:
        labels = list(range(n_nodes))

    community_map: Dict[int, int] = {}
    for node, idx in node_to_idx.items():
        community_map[node] = int(labels[idx])

    return community_map


def compute_network_centrality(
    adjacency: Dict[int, Set[int]],
    usn_to_id: Dict[str, int],
) -> Dict[str, float]:
    centrality: Dict[str, float] = {}
    id_to_usn = {idx: usn for usn, idx in usn_to_id.items()}

    for node_id, neighbors in adjacency.items():
        usn = id_to_usn.get(node_id)
        if not usn:
            continue
        degree = len(neighbors)
        centrality[usn] = float(degree)

    if centrality:
        max_cent = max(centrality.values())
        if max_cent > 0:
            centrality = {usn: value / max_cent for usn, value in centrality.items()}

    return centrality


def enhance_scores_with_graph(
    df: pd.DataFrame,
    ranked_df: pd.DataFrame,
    input_skills: List[str],
    skill_embeddings_dict: Dict[str, np.ndarray],
    network_weight: float = 0.1,
) -> pd.DataFrame:
    if df.empty or ranked_df.empty:
        return ranked_df

    skill_to_emb: Dict[str, np.ndarray] = {}
    for _, row in df.iterrows():
        skills = normalize_and_split_skills(row.get("Skill", ""))
        for skill in skills:
            if skill not in skill_to_emb and skill in skill_embeddings_dict:
                skill_to_emb[skill] = skill_embeddings_dict[skill]

    adjacency, usn_to_id = build_student_skill_graph(df, skill_to_emb, similarity_threshold=0.3)
    centrality = compute_network_centrality(adjacency, usn_to_id)
    communities = detect_communities_graph(adjacency, min_samples=2, eps=0.5)

    id_to_usn = {idx: usn for usn, idx in usn_to_id.items()}
    usn_to_community: Dict[str, int] = {}
    for node_id, community_id in communities.items():
        usn = id_to_usn.get(node_id)
        if usn:
            usn_to_community[usn] = community_id

    enhanced_df = ranked_df.copy()
    network_scores: List[float] = []

    for _, row in enhanced_df.iterrows():
        usn = str(row.get("USN", ""))
        base_score = float(row.get("Weighted_Score", 0.0))
        cent_bonus = centrality.get(usn, 0.0) * network_weight
        comm_bonus = 0.0
        if usn in usn_to_community:
            comm_bonus = 0.02  # small diversity bonus
        enhanced_score = min(1.0, base_score + cent_bonus + comm_bonus)
        network_scores.append(enhanced_score)

    enhanced_df["Network_Enhanced_Score"] = network_scores
    enhanced_df["Network_Centrality"] = [centrality.get(str(row.get("USN", "")), 0.0) for _, row in enhanced_df.iterrows()]
    enhanced_df = enhanced_df.sort_values("Network_Enhanced_Score", ascending=False).reset_index(drop=True)
    return enhanced_df


def get_user_availability_overlap(user1_usn: str, user2_usn: str) -> float:
    """Return overlap score (0-1) using the schedule matching algorithm."""
    from accounts.models import UserAvailability

    if not user1_usn or not user2_usn or user1_usn == user2_usn:
        return 0.5

    time_slots = [
        ("00:00", "02:00"),
        ("02:00", "04:00"),
        ("04:00", "06:00"),
        ("06:00", "08:00"),
        ("08:00", "10:00"),
        ("10:00", "12:00"),
        ("12:00", "14:00"),
        ("14:00", "16:00"),
        ("16:00", "18:00"),
        ("18:00", "20:00"),
        ("20:00", "22:00"),
        ("22:00", "00:00"),
    ]
    days = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ]
    day_to_index = {day: idx for idx, day in enumerate(days)}

    def normalize_time(value: Any) -> Optional[str]:
        if value is None:
            return None
        if hasattr(value, "strftime"):
            return value.strftime("%H:%M")
        value_str = str(value).strip()
        if not value_str:
            return None
        if ":" not in value_str and value_str.isdigit() and len(value_str) == 4:
            value_str = f"{value_str[:2]}:{value_str[2:]}"
        parts = value_str.split(":")
        if len(parts) < 2:
            return None
        hours = parts[0].zfill(2)
        minutes = parts[1].zfill(2)
        return f"{hours}:{minutes}"

    def build_schedule(slots: List[Tuple[Any, Any, Any]]) -> Dict[int, Set[Tuple[str, str]]]:
        schedule: Dict[int, Set[Tuple[str, str]]] = {idx: set() for idx in range(len(days))}
        for day_value, start, end in slots:
            day_index: Optional[int] = None
            if isinstance(day_value, int):
                if 0 <= day_value < len(days):
                    day_index = day_value
            elif isinstance(day_value, str):
                lowered = day_value.lower()
                day_index = day_to_index.get(lowered)
            if day_index is None:
                continue

            start_str = normalize_time(start)
            end_str = normalize_time(end)
            if not start_str or not end_str:
                continue

            schedule[day_index].add((start_str, end_str))
        return schedule

    def time_to_minutes(time_value: Union[str, time]) -> int:
        if hasattr(time_value, "hour"):
            return time_value.hour * 60 + getattr(time_value, "minute", 0)
        time_str = str(time_value)
        parts = time_str.split(":")
        hours = int(parts[0]) if parts and parts[0].isdigit() else 0
        minutes = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0
        return hours * 60 + minutes

    def slots_overlap(slot1: Tuple[str, str], slot2: Tuple[str, str]) -> bool:
        start1, end1 = slot1
        start2, end2 = slot2

        start1_min = time_to_minutes(start1)
        end1_min = time_to_minutes(end1)
        start2_min = time_to_minutes(start2)
        end2_min = time_to_minutes(end2)

        if end1_min <= start1_min:
            end1_min += 24 * 60
        if end2_min <= start2_min:
            end2_min += 24 * 60

        return not (end1_min <= start2_min or end2_min <= start1_min)

    user1_slots = list(
        UserAvailability.objects.filter(user_id=user1_usn, is_available=True).values_list(
            "day_of_week", "time_slot_start", "time_slot_end"
        )
    )
    user2_slots = list(
        UserAvailability.objects.filter(user_id=user2_usn, is_available=True).values_list(
            "day_of_week", "time_slot_start", "time_slot_end"
        )
    )

    schedule1 = build_schedule(user1_slots)
    schedule2 = build_schedule(user2_slots)

    user1_has_slots = any(schedule1[day_index] for day_index in schedule1)
    user2_has_slots = any(schedule2[day_index] for day_index in schedule2)
    if not user1_has_slots or not user2_has_slots:
        return 0.5

    total_possible_slots = 0
    common_slots = 0.0

    for day_index in range(len(days)):
        user1_available = schedule1.get(day_index, set())
        user2_available = schedule2.get(day_index, set())

        if not user1_available and not user2_available:
            total_possible_slots += len(time_slots)
            continue

        exact_matches = user1_available.intersection(user2_available)
        overlapping_matches = 0.0

        for slot1 in user1_available:
            for slot2 in user2_available:
                if slot1 == slot2:
                    continue
                if slots_overlap(slot1, slot2):
                    overlapping_matches += 0.5
                    break

        day_common = len(exact_matches) + overlapping_matches
        common_slots += day_common
        total_possible_slots += len(time_slots)

    if total_possible_slots == 0:
        return 0.5

    overlap_ratio = common_slots / float(total_possible_slots)
    if overlap_ratio < 0:
        overlap_ratio = 0.0
    if overlap_ratio > 1:
        overlap_ratio = 1.0
    return overlap_ratio


def get_user_availability_entries(user_usn: str) -> List[Dict[str, Any]]:
    """Return serialized availability entries for the given CustomUser."""
    from accounts.models import UserAvailability

    if not user_usn:
        return []

    return list(
        UserAvailability.objects.filter(user_id=user_usn, is_available=True).values(
            "day_of_week",
            "time_slot_start",
            "time_slot_end",
            "is_available",
        )
    )


def _get_project_skills(project_id: int) -> List[str]:
    """Get required skills for a project."""
    required_skills = (
        ProjectSkill.objects
        .filter(project_id=project_id)
        .select_related('skill')
        .values_list('skill__name', flat=True)
    )
    return [s for s in required_skills if s]

def _get_potential_teammates(project_id: int, target_skills: List[str]) -> QuerySet[UserProfile]:
    """Get potential teammates who have at least one of the target skills."""
    current_members = TeamMember.objects.filter(project_id=project_id).values_list('user_id', flat=True)
    
    user_skills_prefetch = Prefetch(
        'user__user_skills',
        queryset=UserSkill.objects.select_related('skill')
    )
    
    return (
        UserProfile.objects
        .exclude(user_id__in=current_members)
        .filter(user__user_skills__skill__name__in=target_skills)
        .distinct()
        .prefetch_related(user_skills_prefetch)
    )

def _process_candidate_skills(
    profile: UserProfile,
    profile_by_usn: Dict[str, UserProfile],
    candidate_skill_names: Set[str],
) -> Optional[Dict[str, Any]]:
    """Process skills for a single candidate and return their record."""
    custom_user = profile.user
    if not isinstance(custom_user, CustomUser):
        return None

    skills_normalized = []
    skill_entries = []
    skill_proficiencies = {}

    for user_skill in custom_user.user_skills.all():
        if not user_skill.skill or not user_skill.skill.name.strip():
            continue
            
        original_name = user_skill.skill.name.strip()
        normalized = original_name.lower()
        
        skills_normalized.append(normalized)
        candidate_skill_names.add(normalized)
        
        # Create a proper skill entry dictionary
        skill_entry = {
            'skill_id': user_skill.skill_id,
            'name': original_name,
            'proficiency': user_skill.proficiency_level,
        }
        skill_entries.append(skill_entry)
        skill_proficiencies[normalized] = user_skill.proficiency_level

    record = {
        'USN': custom_user.usn,
        'Department': custom_user.department.name if custom_user.department else '',
        'Skill': '; '.join(skills_normalized),
        'Skill_Proficiencies': skill_entries  # Store the full skill entries here
    }
    
    # Store the profile for later reference
    profile_by_usn[custom_user.usn] = profile
    
    # Also store the skill entries in the profile for easy access
    setattr(profile, '_skill_entries', skill_entries)
    
    return record

def _calculate_scores(
    row: pd.Series,
    matched_details: Dict[str, List[Dict[str, Any]]],
    skill_entries: List[Dict[str, Any]],
    include_availability: bool,
    project_creator_usn: Optional[str],
) -> Dict[str, Any]:
    """Calculate all scores for a candidate."""
    usn = str(row.get('USN', ''))
    
    # Base skill component
    base_skill_component = float(row.get('Weighted_Score', 0.0))
    network_enhanced = float(row.get('Network_Enhanced_Score', base_skill_component))
    
    # Combine base skill with network enhancement
    combined_skill_score = (SKILL_MATCH_WEIGHT * base_skill_component) + \
                          (NETWORK_ENHANCE_WEIGHT * network_enhanced)
    combined_skill_score = min(max(combined_skill_score, 0.0), 1.0)
    
    # Process matched skills and calculate proficiency bonus
    matched_items = matched_details.get(usn, [])
    skill_lookup = {entry['name'].strip().lower(): entry for entry in skill_entries if entry.get('name')}
    matched_skills = []
    proficiency_bonus = 0.0
    
    if matched_items:
        for item in matched_items:
            skill_name = item.get('matched_skill', '').lower()
            if skill_name in skill_lookup:
                proficiency = skill_lookup[skill_name].get('proficiency', 3)
                similarity = item.get('similarity', 0.0)
                
                if similarity > MIN_SIMILARITY_FOR_PROFICIENCY:
                    proficiency_bonus += (proficiency / 5.0) * PROFICIENCY_MAX_BONUS * (similarity ** 2)
                
                matched_skills.append({
                    'name': skill_name,
                    'proficiency': proficiency,
                    'similarity': round(similarity, 3),
                })
        
        if matched_items:  # Avoid division by zero
            proficiency_bonus = proficiency_bonus / len(matched_items)
    
    # Limit matched skills
    matched_skills = sorted(
        matched_skills,
        key=lambda x: x.get('similarity', 0),
        reverse=True
    )[:MAX_MATCHED_SKILLS]
    
    # Calculate final score
    adjusted_skill_component = combined_skill_score + proficiency_bonus
    
    # Get availability score if needed
    availability_score = 0.0
    if include_availability and project_creator_usn:
        availability_score = get_user_availability_overlap(project_creator_usn, usn) 
        final_score = (
            (0.6 * adjusted_skill_component) + 
            (0.2 * availability_score) + 
            (0.2 * proficiency_bonus)
        )
    else:
        final_score = (0.7 * adjusted_skill_component) + (0.3 * proficiency_bonus)
    
    # Ensure score is within valid range
    final_score = max(0.0, min(1.0, final_score))
    
    return {
        'final_score': final_score,
        'combined_skill_score': combined_skill_score,
        'adjusted_skill_component': adjusted_skill_component,
        'proficiency_bonus': proficiency_bonus,
        'availability_score': availability_score if (include_availability and project_creator_usn) else 0,
        'matched_skills': matched_skills,
    }

def get_advanced_matches(
    project_id: int, 
    selected_skills: Optional[List[str]] = None,
    include_availability: bool = True,
    limit: int = 20
) -> List[MatchResult]:
    """
    Find potential teammates for a project using advanced matching algorithms.
    
    Args:
        project_id: ID of the project to find teammates for
        selected_skills: List of skill names to prioritize in matching
        include_availability: Whether to include availability in scoring
        limit: Maximum number of matches to return
        
    Returns:
        List of user profiles with match scores and details
    """
    try:
        # Get project and required skills
        project = Project.objects.get(project_id=project_id)
        all_required_skills = _get_project_skills(project_id)
        
        # Determine target skills for matching
        target_skills = [s.strip() for s in selected_skills] if selected_skills else all_required_skills
        target_skills = [s for s in target_skills if isinstance(s, str) and s.strip()]
        
        if not target_skills:
            return []

        # Get potential teammates and process their skills
        potential_teammates = _get_potential_teammates(project_id, target_skills)
        
        candidate_records = []
        user_skill_details = {}
        profile_by_usn = {}
        candidate_skill_names = set()

        for profile in potential_teammates[:1000]:  # Limit to first 1000 for performance
            record = _process_candidate_skills(profile, profile_by_usn, candidate_skill_names)
            if record:
                candidate_records.append(record)
                # Get skill entries from the profile we stored earlier
                skill_entries = getattr(profile, '_skill_entries', [])
                user_skill_details[record['USN']] = [
                    {
                        'skill_id': s['skill_id'],
                        'name': s['name'],
                        'proficiency': s['proficiency']
                    }
                    for s in skill_entries
                ]

        if not candidate_records:
            return []

        # Calculate skill scores and network enhancements
        df = pd.DataFrame(candidate_records)
        matching_skills = target_skills if selected_skills else all_required_skills
        
        scored_df, matched_details = compute_skill_scores(
            df, 
            matching_skills, 
            similarity_threshold=SKILL_SIMILARITY_THRESHOLD
        )
        
        skill_embeddings_dict = get_skill_embeddings(
            list(candidate_skill_names | {s.lower() for s in matching_skills})
        )
        
        enhanced_df = enhance_scores_with_graph(
            df, 
            scored_df, 
            matching_skills, 
            skill_embeddings_dict, 
            network_weight=NETWORK_ENHANCE_WEIGHT
        )

        # Process results
        project_creator_usn = project.created_by.usn if project.created_by else None
        results = []

        for _, row in enhanced_df.iterrows():
            usn = str(row.get('USN', ''))
            profile = profile_by_usn.get(usn)
            if not profile:
                continue
                
            skill_entries = user_skill_details.get(usn, [])
            
            # Calculate all scores
            scores = _calculate_scores(
                row, 
                matched_details, 
                skill_entries,
                include_availability,
                project_creator_usn
            )
            
            # Prepare result dictionary
            result: MatchResult = {
                'user_id': usn,
                'name': profile.user.get_full_name() or profile.user.email,
                'email': profile.user.email,
                'department': profile.user.department.name if profile.user.department else None,
                'year': profile.user.study_year,
                'skills': skill_entries,
                'match_score': round(scores['final_score'] * 100, 1),
                'match_percentage': round(scores['final_score'] * 100, 1),
                'skill_match': round(scores['combined_skill_score'] * 100, 1),
                'availability_match': round(scores['availability_score'] * 100, 1) if include_availability else 0,
                'score_breakdown': {
                    'overall': {
                        'percentage': f"{scores['final_score'] * 100:.1f}%",
                        'raw': scores['final_score']
                    },
                    'skill': {
                        'percentage': f"{scores['combined_skill_score'] * 100:.1f}%",
                        'raw': scores['combined_skill_score'],
                        'details': [
                            {
                                'skill': item['input_skill'],
                                'matched_skill': item['matched_skill'],
                                'similarity': f"{item.get('similarity', 0) * 100:.1f}%",
                                'proficiency': next(
                                    (s['proficiency'] for s in skill_entries 
                                     if s['name'].lower() == item['matched_skill'].lower()),
                                    3  # Default proficiency
                                )
                            }
                            for item in matched_details.get(usn, [])
                        ]
                    },
                    'availability': {
                        'percentage': f"{scores['availability_score'] * 100:.1f}%" if include_availability else "0%",
                        'raw': scores['availability_score'] if include_availability else 0.0
                    },
                    'proficiency_bonus': {
                        'percentage': f"{scores['proficiency_bonus'] * 100:.1f}%",
                        'raw': scores['proficiency_bonus'],
                        'details': {
                            'bonus_percentage': f"{scores['proficiency_bonus'] * 100:.1f}%",
                            'total_skill_component': round(scores['adjusted_skill_component'], 4)
                        }
                    }
                },
                'matched_skills': scores['matched_skills'],
                'availability': get_user_availability_entries(usn) if include_availability else [],
                'profile_url': f"/profile/{usn}",
            }
            
            results.append(result)

        # Sort by match score in descending order and apply limit
        results.sort(key=lambda x: x['match_score'], reverse=True)
        return results[:limit]
        
    except Exception as e:
        logger.error(f"Error in advanced matching: {str(e)}", exc_info=True)
        return []

# Study group matching has been moved to study_group_matching.py