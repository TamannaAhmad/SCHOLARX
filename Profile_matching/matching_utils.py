"""
Utility functions for skill matching without Streamlit dependencies.
"""
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Set, Any
from .nlp import get_sentence_model, encode_texts, compute_similarity_matrix

def normalize_and_split_skills(skills_text: str) -> List[str]:
    if not isinstance(skills_text, str) or not skills_text.strip():
        return []
    parts = [p.strip().lower() for p in skills_text.replace("|", ";").split(";")]
    parts = [p for p in parts if p]
    # Deduplicate preserving order
    seen: Set[str] = set()
    out = []
    for p in parts:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out

def compute_skill_similarity(
    df: pd.DataFrame,
    input_skills: List[str],
    similarity_threshold: float = 0.3,
) -> Tuple[pd.DataFrame, Dict[str, List[Dict]]]:
    """
    Compute skill similarities without Streamlit dependencies.
    
    Args:
        df: DataFrame containing student skills
        input_skills: List of skills to match against
        similarity_threshold: Threshold for considering a match
        
    Returns:
        Tuple of (scored_df, matched_details)
    """
    if df.empty or not input_skills:
        df["Average_Similarity"] = 0.0
        df["Weighted_Score"] = 0.0
        return df, {}

    # Prepare inputs - normalize and clean input skills
    input_skills = [s.lower().strip() for s in input_skills if s.strip()]
    if not input_skills:
        df["Average_Similarity"] = 0.0
        df["Weighted_Score"] = 0.0
        return df, {}
    
    # Initialize model and encode input skills
    model = get_sentence_model()
    input_emb = encode_texts(model, input_skills)
    
    # Process student skills
    student_skill_lists = []
    student_skill_texts = []
    row_to_skill_slice = []
    
    for _, row in df.iterrows():
        skill_text = row.get("Skill", row.get("Skills", ""))
        skills = normalize_and_split_skills(skill_text)
        start = len(student_skill_texts)
        student_skill_lists.append(skills)
        student_skill_texts.extend(skills if skills else [""])
        row_to_skill_slice.append((start, len(student_skill_texts)))

    if not student_skill_texts:
        df["Average_Similarity"] = 0.0
        df["Weighted_Score"] = 0.0
        return df, {}
    
    # Encode all student skills at once for better performance
    student_emb = encode_texts(model, student_skill_texts)
    
    # Compute similarities between all input skills and all student skills
    sim_full = compute_similarity_matrix(input_emb, student_emb)
    
    # Process results for each student
    avg_similarities = []
    matched_skill_details_by_usn = {}
    
    for i, (_, row) in enumerate(df.iterrows()):
        usn = str(row.get("USN", ""))
        skills = student_skill_lists[i]
        s_idx, e_idx = row_to_skill_slice[i]
        
        if e_idx <= s_idx or not skills:
            avg_similarities.append((0.0, 0.0))
            matched_skill_details_by_usn[usn] = []
            continue
            
        # Get similarities for this student's skills
        sim_slice = sim_full[:, s_idx:e_idx]
        
        # For each input skill, find best matching student skill
        max_per_input = []
        matched_details = []
        
        for k, in_skill in enumerate(input_skills):
            if k >= len(sim_slice):
                continue
                
            row_sim = sim_slice[k]
            max_idx = int(np.argmax(row_sim))
            max_sim = float(row_sim[max_idx])
            max_per_input.append(max_sim)
            
            if max_sim >= similarity_threshold and skills:
                matched_details.append({
                    "input_skill": in_skill,
                    "matched_skill": skills[max_idx],
                    "similarity": max_sim,
                })
        
        # Calculate base score considering both skill match and proficiency
        base_score = 0.0
        matched_skills_count = 0
        
        # Track the maximum possible score for normalization
        max_possible_score = 0.0
        
        for j, sim in enumerate(max_per_input):
            if sim >= similarity_threshold:
                matched_skills_count += 1
                
                # Calculate score with proficiency bonus
                # The bonus increases with higher similarity scores
                proficiency_bonus = min(1.0, sim * 1.5)  # Increased to 1.5 for better differentiation
                base_score += proficiency_bonus
                
                # Track maximum possible score (if all skills matched perfectly)
                max_possible_score += 1.0
        
        # Calculate average score per skill (0 if no matches)
        avg_score = (base_score / len(input_skills)) if input_skills else 0.0
        
        # Calculate coverage (percentage of required skills matched)
        coverage = matched_skills_count / len(input_skills) if input_skills else 0.0
        
        # If we matched all skills, give a perfect score
        if matched_skills_count == len(input_skills) and matched_skills_count > 0:
            weighted_score = 1.0
        else:
            # Weight the score based on both average match quality and coverage
            # 50% weight to the average score, 50% to coverage
            weighted_score = (0.5 * avg_score) + (0.5 * coverage)
            
            # Add a bonus for matching multiple skills
            if matched_skills_count > 1:
                # Up to 15% bonus for multiple skills
                multi_skill_bonus = min(0.15, matched_skills_count * 0.03)
                weighted_score = min(1.0, weighted_score + multi_skill_bonus)
                
            # Ensure the score doesn't exceed 1.0
            weighted_score = min(1.0, weighted_score)
        
        avg_similarities.append((avg_score, weighted_score))
        matched_skill_details_by_usn[usn] = matched_details
        
        # Debug output for a few users
        if i < 3:  # Print first 3 users for debugging
            print(f"[DEBUG] USN {usn} - Skills: {skills}")
            print(f"        Matches: {matched_details}")
            print(f"        Avg score: {avg_score:.2f}")
            print(f"        Weighted score: {weighted_score:.2f}")
            print(f"        Matched skills: {matched_skills_count}/{len(input_skills) if input_skills else 0}")
    
    # Update DataFrame with scores
    df = df.copy()
    df["Average_Similarity"] = [r[0] for r in avg_similarities]
    df["Weighted_Score"] = [r[1] for r in avg_similarities]
    
    # Normalize scores to 0-1 range based on actual distribution
    if len(df) > 1:
        # Ensure we don't divide by zero
        max_score = df["Weighted_Score"].max()
        if max_score > 0:
            df["Weighted_Score"] = df["Weighted_Score"] / max_score
            df["Average_Similarity"] = df["Average_Similarity"] / max_score
    
    # Sort by weighted score
    df = df.sort_values("Weighted_Score", ascending=False).reset_index(drop=True)
    
    return df, matched_skill_details_by_usn
