"""
Projects app initialization.

This module exposes the main matching functions from both advanced_matching.py and study_group_matching.py.
"""

# Define __all__ to specify what should be imported when using 'from projects import *'
__all__ = [
    'get_advanced_matches',
    'get_advanced_group_matches',
    'get_user_availability_overlap',
    'get_user_availability_entries',
    'compute_skill_scores',
    'enhance_scores_with_graph',
    'get_skill_embeddings'
]

# Use lazy imports to avoid circular imports
def __getattr__(name):
    if name in __all__:
        if name == 'get_advanced_group_matches':
            from .study_group_matching import get_advanced_group_matches
            return get_advanced_group_matches
        else:
            from .advanced_matching import (
                get_advanced_matches,
                get_user_availability_overlap,
                get_user_availability_entries,
                compute_skill_scores,
                enhance_scores_with_graph,
                get_skill_embeddings
            )
            return locals().get(name)
    raise AttributeError(f"module 'projects' has no attribute '{name}'")