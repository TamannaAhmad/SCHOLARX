from typing import List

import pandas as pd


def normalize_and_split_skills(skills_text: str) -> List[str]:
    if not isinstance(skills_text, str) or not skills_text.strip():
        return []
    parts = [p.strip().lower() for p in skills_text.replace("|", ";").split(";")]
    parts = [p for p in parts if p]
    # Deduplicate preserving order
    seen = set()
    out = []
    for p in parts:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def coalesce_columns(df: pd.DataFrame) -> pd.DataFrame:
    # Attempt to map similar column names to expected ones
    rename_map = {}

    def match(col: str) -> str:
        c = col.strip().lower()
        if c in {"usn", "student_id", "id"}:
            return "USN"
        if c in {"name", "student_name"}:
            return "Name"
        if c in {"dept", "department"}:
            return "Department"
        if c in {"skill", "skills", "skills_already_know", "known_skills"}:
            return "Skill"
        if c in {"proficiency", "proficiency_already_know", "skill_levels"}:
            return "Proficiency"
        return col

    for col in list(df.columns):
        target = match(col)
        if target != col:
            rename_map[col] = target

    if rename_map:
        df = df.rename(columns=rename_map)
    return df


def ensure_expected_columns(df: pd.DataFrame, expected: List[str]) -> pd.DataFrame:
    for col in expected:
        if col not in df.columns:
            df[col] = ""
    # Reorder to expected first
    ordered = [c for c in expected if c in df.columns] + [c for c in df.columns if c not in expected]
    return df[ordered]


def parse_user_input_skills(text: str) -> List[str]:
    if not isinstance(text, str):
        return []
    parts = [p.strip() for p in text.replace("/", ",").replace("|", ",").split(",")]
    parts = [p for p in parts if p]

    # Expand common acronyms/aliases to canonical phrases to help SBERT
    ACRONYM_MAP = {
        "ml": "machine learning",
        "dl": "deep learning",
        "nlp": "natural language processing",
        "ai": "artificial intelligence",
        "cv": "computer vision",
        "ds": "data science",
        "dbms": "database management systems",
        "sql": "structured query language",
        "oops": "object oriented programming",
        "os": "operating systems",
        "cn": "computer networks",
        "dsa": "data structures and algorithms",
    }

    expanded: List[str] = []
    for p in parts:
        key = p.strip().lower()
        expanded.append(ACRONYM_MAP.get(key, p))

    return expanded


