"""
Graph Neural Network and Social Network Analysis module for student matching.
Based on research: Personalized MOOC Learning Group Recommendation using GNN and SNA.
Implements graph-based clustering and community detection for better group formation.
"""
from typing import Dict, List, Tuple, Set
import numpy as np
import pandas as pd
from collections import defaultdict
from sklearn.cluster import DBSCAN
from sklearn.metrics.pairwise import cosine_similarity


def build_student_skill_graph(
    df: pd.DataFrame,
    skill_embeddings: Dict[str, np.ndarray],
    similarity_threshold: float = 0.3,
) -> Tuple[Dict[int, Set[int]], Dict[str, int]]:
    """
    Build a graph where nodes are students and edges represent skill similarity.
    Returns: (adjacency dict, usn_to_node_id mapping)
    Based on SNA approach from the research papers.
    """
    adjacency: Dict[int, Set[int]] = defaultdict(set)
    usn_to_id: Dict[str, int] = {}
    id_to_usn: Dict[int, str] = {}
    
    # Create node mapping
    for idx, row in df.iterrows():
        usn = str(row.get("USN", f"student_{idx}"))
        usn_to_id[usn] = idx
        id_to_usn[idx] = usn
    
    # Build edges based on skill similarity
    n = len(df)
    student_embeddings_list = []
    student_ids = []
    
    # Get embedding dimension from first available embedding, default to 384 (SBERT)
    emb_dim = 384
    if skill_embeddings:
        first_emb = next(iter(skill_embeddings.values()))
        if first_emb is not None and len(first_emb.shape) > 0:
            emb_dim = first_emb.shape[0]
    
    for idx, row in df.iterrows():
        usn = str(row.get("USN", f"student_{idx}"))
        skills = row.get("Skill", "").split(";")
        skills = [s.strip().lower() for s in skills if s.strip()]
        
        # Aggregate skill embeddings
        if skills:
            emb_list = [skill_embeddings.get(sk, np.zeros(emb_dim)) for sk in skills]
            student_emb = np.mean(emb_list, axis=0)
        else:
            student_emb = np.zeros(emb_dim)
        
        student_embeddings_list.append(student_emb)
        student_ids.append(idx)
    
    if len(student_embeddings_list) < 2:
        return dict(adjacency), usn_to_id
    
    # Compute similarity matrix
    embeddings_matrix = np.array(student_embeddings_list)
    sim_matrix = cosine_similarity(embeddings_matrix)
    
    # Create edges for similar students
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
    """
    Detect communities using graph clustering (DBSCAN on graph structure).
    Returns: node_id -> community_id mapping.
    """
    if not adjacency:
        return {}
    
    # Build adjacency matrix for clustering
    nodes = sorted(adjacency.keys())
    node_to_idx = {node: i for i, node in enumerate(nodes)}
    n = len(nodes)
    
    if n < 2:
        return {nodes[0]: 0} if n == 1 else {}
    
    # Create adjacency matrix
    adj_matrix = np.zeros((n, n))
    for node, neighbors in adjacency.items():
        if node in node_to_idx:
            i = node_to_idx[node]
            for neighbor in neighbors:
                if neighbor in node_to_idx:
                    j = node_to_idx[neighbor]
                    adj_matrix[i][j] = 1
                    adj_matrix[j][i] = 1
    
    # Use DBSCAN for community detection
    clustering = DBSCAN(min_samples=min_samples, eps=eps, metric='precomputed')
    # Convert to distance matrix
    dist_matrix = 1 - adj_matrix
    np.fill_diagonal(dist_matrix, 0)
    
    try:
        labels = clustering.fit_predict(dist_matrix)
    except Exception:
        # Fallback: assign each node to its own community
        labels = list(range(n))
    
    # Map back to original node IDs
    community_map = {}
    for node, idx in node_to_idx.items():
        community_map[node] = int(labels[idx])
    
    return community_map


def compute_network_centrality(
    adjacency: Dict[int, Set[int]],
    usn_to_id: Dict[str, int],
) -> Dict[str, float]:
    """
    Compute degree centrality for each student in the skill network.
    Higher centrality = more connections = better group connector.
    """
    centrality: Dict[str, float] = {}
    
    id_to_usn = {v: k for k, v in usn_to_id.items()}
    
    for node_id, neighbors in adjacency.items():
        usn = id_to_usn.get(node_id, "")
        if usn:
            degree = len(neighbors)
            # Normalize by max possible connections
            centrality[usn] = float(degree)
    
    # Normalize to 0-1 range
    if centrality:
        max_cent = max(centrality.values()) if centrality.values() else 1.0
        if max_cent > 0:
            centrality = {k: v / max_cent for k, v in centrality.items()}
    
    return centrality


def compute_complementarity_score(
    student_usn: str,
    selected_usns: List[str],
    df: pd.DataFrame,
    skill_embeddings: Dict[str, np.ndarray],
) -> float:
    """
    Compute how well a student complements the selected group.
    Higher score = student brings different but related skills.
    Based on multi-level network analysis from the research.
    """
    if not selected_usns:
        return 1.0
    
    student_row = df[df["USN"].astype(str) == student_usn]
    if student_row.empty:
        return 0.0
    
    student_skills = student_row.iloc[0].get("Skill", "").split(";")
    student_skills = [s.strip().lower() for s in student_skills if s.strip()]
    
    # Get selected group skills
    selected_rows = df[df["USN"].astype(str).isin(selected_usns)]
    group_skills_set = set()
    for _, row in selected_rows.iterrows():
        skills = row.get("Skill", "").split(";")
        group_skills_set.update(s.strip().lower() for s in skills if s.strip())
    
    # Compute overlap
    student_skills_set = set(student_skills)
    overlap = len(student_skills_set & group_skills_set)
    unique = len(student_skills_set - group_skills_set)
    
    # Balance: some overlap (can work together) but also unique skills (adds value)
    if not student_skills_set:
        return 0.0
    
    complementarity = (unique * 0.7 + overlap * 0.3) / len(student_skills_set)
    return float(complementarity)


def enhance_scores_with_graph(
    df: pd.DataFrame,
    ranked_df: pd.DataFrame,
    input_skills: List[str],
    skill_embeddings_dict: Dict[str, np.ndarray],
    network_weight: float = 0.1,
) -> pd.DataFrame:
    """
    Enhance matching scores using graph-based network analysis.
    Adds network centrality and community-based bonuses.
    """
    if df.empty or len(ranked_df) == 0:
        return ranked_df
    
    # Build skill-to-embedding mapping from student skills
    skill_to_emb = {}
    for _, row in df.iterrows():
        skills = row.get("Skill", "").split(";")
        skills = [s.strip().lower() for s in skills if s.strip()]
        for skill in skills:
            if skill not in skill_to_emb:
                # Use a representative embedding (or compute from skill name)
                if skill in skill_embeddings_dict:
                    skill_to_emb[skill] = skill_embeddings_dict[skill]
    
    # Build graph
    adjacency, usn_to_id = build_student_skill_graph(df, skill_to_emb, similarity_threshold=0.3)
    
    # Compute network centrality
    centrality = compute_network_centrality(adjacency, usn_to_id)
    
    # Detect communities
    communities = detect_communities_graph(adjacency, min_samples=2, eps=0.5)
    
    # Create community-based bonus (students in same community get small bonus)
    id_to_usn = {v: k for k, v in usn_to_id.items()}
    usn_to_community = {}
    for node_id, comm_id in communities.items():
        usn = id_to_usn.get(node_id, "")
        if usn:
            usn_to_community[usn] = comm_id
    
    # Enhance scores
    enhanced_df = ranked_df.copy()
    network_scores = []
    
    for _, row in enhanced_df.iterrows():
        usn = str(row.get("USN", ""))
        base_score = float(row.get("Weighted_Score", 0.0))
        
        # Network centrality bonus (well-connected students)
        cent_bonus = centrality.get(usn, 0.0) * network_weight
        
        # Community diversity bonus (students from different communities can form diverse groups)
        # This is a small bonus, can be tuned
        comm_bonus = 0.0
        
        enhanced_score = base_score + cent_bonus + comm_bonus
        network_scores.append(enhanced_score)
    
    enhanced_df["Network_Enhanced_Score"] = network_scores
    enhanced_df["Network_Centrality"] = [centrality.get(str(row.get("USN", "")), 0.0) for _, row in enhanced_df.iterrows()]
    
    # Re-sort by enhanced score
    enhanced_df = enhanced_df.sort_values("Network_Enhanced_Score", ascending=False).reset_index(drop=True)
    
    return enhanced_df

