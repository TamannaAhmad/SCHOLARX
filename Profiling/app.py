import os
import io
import sqlite3
from collections import defaultdict
from typing import List, Dict, Tuple, Optional

import numpy as np
import pandas as pd
import streamlit as st

from utils import (
    normalize_and_split_skills,
    coalesce_columns,
    ensure_expected_columns,
    parse_user_input_skills,
)
from nlp import (
    get_spacy_nlp,
    get_sentence_model,
    encode_texts,
    compute_similarity_matrix,
)
from db import init_db, save_group, list_groups
from theming import get_container_style
from viz import maybe_render_embeddings_plot


EXPECTED_COLUMNS = [
    "USN",
    "Name",
    "Department",
    "Skills_Already_Know",
    "Proficiency_Already_Know",
]


DEPT_SKILL_PRIORS: Dict[str, List[str]] = {
    "CSE": ["ai", "ml", "python", "cloud", "data", "algorithms"],
    "ECE": ["embedded", "vlsi", "signals", "verilog", "matlab"],
    "ME": ["cad", "cam", "manufacturing", "thermodynamics"],
    "EEE": ["power", "machines", "circuits", "electronics"],
    "CIV": ["autocad", "structures", "surveying", "geotech"],
}


@st.cache_data(show_spinner=False)
def cached_encode(texts: List[str]) -> np.ndarray:
    model = get_sentence_model()
    return encode_texts(model, texts)


@st.cache_data(show_spinner=False)
def cached_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return compute_similarity_matrix(a, b)


def load_file(uploaded_file) -> pd.DataFrame:
    if uploaded_file is None:
        return pd.DataFrame(columns=EXPECTED_COLUMNS)
    filename = uploaded_file.name.lower()
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(uploaded_file, encoding_errors="ignore")
        else:
            df = pd.read_excel(uploaded_file)
    except Exception:
        # Fallback to bytes buffer
        uploaded_file.seek(0)
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(uploaded_file.read()), encoding_errors="ignore")
        else:
            df = pd.read_excel(io.BytesIO(uploaded_file.read()))

    df = coalesce_columns(df)
    df = ensure_expected_columns(df, EXPECTED_COLUMNS)
    df["Skills_Already_Know"] = df["Skills_Already_Know"].fillna("")
    df["Proficiency_Already_Know"] = df["Proficiency_Already_Know"].fillna("")
    return df


def department_bonus(dept: str, student_skills: List[str], priors: Dict[str, List[str]]) -> float:
    if not dept:
        return 0.0
    dept_key = dept.strip().upper()
    prior_skills = priors.get(dept_key, priors.get(dept_key[:3], []))
    if not prior_skills:
        return 0.0
    student_skill_set = set(s.lower() for s in student_skills)
    prior_set = set(prior_skills)
    return float(len(student_skill_set & prior_set)) / max(1.0, float(len(prior_set)))


def compute_scores(
    df: pd.DataFrame,
    input_skills: List[str],
    similarity_threshold: float,
    dept_priors: Dict[str, List[str]],
    use_sentiment: bool,
) -> Tuple[pd.DataFrame, Dict[str, List[Dict]]]:
    if df.empty or not input_skills:
        return df, {}

    # Prepare inputs
    spacy_nlp = get_spacy_nlp()
    normalized_input = [
        " ".join(tok.lemma_.lower() for tok in spacy_nlp(skill)) if spacy_nlp else skill.lower()
        for skill in input_skills
    ]
    input_emb = cached_encode(normalized_input)

    # Per-student skill processing and embeddings
    student_skill_lists: List[List[str]] = []
    student_skill_texts: List[str] = []
    row_to_skill_slice: List[Tuple[int, int]] = []

    for _, row in df.iterrows():
        skills = normalize_and_split_skills(row.get("Skills_Already_Know", ""))
        start = len(student_skill_texts)
        student_skill_lists.append(skills)
        student_skill_texts.extend(skills if skills else [""])
        row_to_skill_slice.append((start, len(student_skill_texts)))

    if not student_skill_texts:
        df["Average_Similarity"] = 0.0
        df["Weighted_Score"] = 0.0
        return df, {}

    student_emb = cached_encode(student_skill_texts)
    sim_full = cached_similarity(input_emb, student_emb)  # shape: [num_input, total_skills]

    # Aggregate per student
    avg_similarities = []
    matched_skill_details_by_usn: Dict[str, List[Dict]] = {}

    from textblob import TextBlob  # local import to avoid overhead if unused

    for i, (_, row) in enumerate(df.iterrows()):
        usn = str(row.get("USN", ""))
        dept = str(row.get("Department", ""))
        skills = student_skill_lists[i]
        s_idx, e_idx = row_to_skill_slice[i]
        sim_slice = sim_full[:, s_idx:e_idx] if e_idx > s_idx else np.zeros((len(input_skills), 1))

        # For each input skill, take max similarity vs student's skills
        max_per_input = []
        matched_details = []
        for k, in_skill in enumerate(input_skills):
            if sim_slice.shape[1] == 0:
                max_per_input.append(0.0)
                continue
            row_sim = sim_slice[k]
            j = int(np.argmax(row_sim))
            max_sim = float(row_sim[j])
            max_per_input.append(max_sim)
            if max_sim >= similarity_threshold and skills:
                matched_details.append({
                    "input_skill": in_skill,
                    "matched_skill": skills[j],
                    "similarity": max_sim,
                })

        avg_sim = float(np.mean(max_per_input)) if max_per_input else 0.0
        dept_bonus = department_bonus(dept, skills, dept_priors)
        sentiment_val = 0.0
        if use_sentiment:
            try:
                sentiment_val = float(TextBlob("; ".join(skills)).sentiment.polarity)
            except Exception:
                sentiment_val = 0.0

        weighted = avg_sim + 0.05 * dept_bonus + 0.02 * sentiment_val
        avg_similarities.append((avg_sim, weighted))
        matched_skill_details_by_usn[usn] = matched_details

    df = df.copy()
    df["Average_Similarity"] = [v[0] for v in avg_similarities]
    df["Weighted_Score"] = [v[1] for v in avg_similarities]
    df = df.sort_values("Weighted_Score", ascending=False).reset_index(drop=True)
    return df, matched_skill_details_by_usn


def main() -> None:
    st.set_page_config(page_title="Student Matcher", layout="wide")
    init_db()

    st.title("NLP-Powered Student Matcher")
    st.caption("Upload students, enter skills, rank and group matches. ")

    with st.sidebar:
        st.header("Controls")
        uploaded = st.file_uploader("Upload CSV or Excel", type=["csv", "xlsx", "xls"])
        skill_text = st.text_input("Target skills (comma-separated)", value="Python, NLP, Deep Learning")
        threshold = st.slider("Similarity threshold", min_value=0.0, max_value=1.0, value=0.45, step=0.01)
        use_sentiment = st.checkbox("Use sentiment adjustment", value=False)
        show_plot = st.checkbox("Show visualization (PCA/KMeans)", value=False)
        group_name = st.text_input("Group name", value="Cohort A")
        st.divider()
        st.subheader("Saved Groups")
        saved = list_groups()
        if saved:
            for gid, name, students_str in saved:
                st.write(f"{gid}. {name} — {students_str}")
        else:
            st.caption("No groups saved yet.")

    df = load_file(uploaded)
    if df.empty:
        st.info("Upload a dataset to begin. Expected columns: " + ", ".join(EXPECTED_COLUMNS))
        return

    input_skills = parse_user_input_skills(skill_text)
    if not input_skills:
        st.warning("Enter at least one skill to match.")
        return

    with st.spinner("Computing matches..."):
        ranked_df, matched_by_usn = compute_scores(
            df, input_skills, threshold, DEPT_SKILL_PRIORS, use_sentiment
        )

    st.success(f"Found {len(ranked_df)} students. Displaying by department.")

    # Selections persistence
    if "selected_usns" not in st.session_state:
        st.session_state.selected_usns = []  # store as list for safer persistence

    # Group by department
    by_dept: Dict[str, pd.DataFrame] = dict(tuple(ranked_df.groupby("Department", dropna=False)))

    selected_blocks: List[Tuple[str, str]] = []  # (USN, Name)

    # Two-column layout: left results, right selection panel
    results_col, selection_col = st.columns([4, 1])

    with results_col:
        # Global form with Apply button at the top for all departments
        with st.form(key="global-select-form"):
            submitted_global = st.form_submit_button("Apply selections")
            pending_checkbox_keys = []

            for dept, subdf in by_dept.items():
                with st.expander(f"{dept or 'Unknown Department'} ({len(subdf)})", expanded=False):
                    st.caption("Target skills: " + ", ".join(input_skills))
                    for _, row in subdf.iterrows():
                        usn = str(row["USN"]) if pd.notna(row["USN"]) else ""
                        name = str(row["Name"]) if pd.notna(row["Name"]) else ""
                        avg_sim = float(row["Average_Similarity"]) if pd.notna(row["Average_Similarity"]) else 0.0
                        weighted = float(row["Weighted_Score"]) if pd.notna(row["Weighted_Score"]) else 0.0
                        skills = normalize_and_split_skills(row.get("Skills_Already_Know", ""))
                        matched = matched_by_usn.get(usn, [])

                        style = get_container_style()
                        st.markdown(style, unsafe_allow_html=True)
                        with st.container():
                            col1, col2, col3, col4 = st.columns([3, 2, 2, 2])
                            with col1:
                                st.markdown(
                                    f"<div class='student-box'><b>{name}</b> — {usn}<br/>", unsafe_allow_html=True
                                )
                                st.caption(f"Top skill: {skills[0] if skills else 'N/A'}")
                            with col2:
                                st.metric("Avg match", f"{avg_sim*100:.1f}%")
                            with col3:
                                st.metric("Weighted score", f"{weighted:.3f}")
                            with col4:
                                default_checked = usn in set(st.session_state.selected_usns)
                                key = f"sel-{usn}"
                                st.checkbox("Select", value=default_checked, key=key)
                                pending_checkbox_keys.append((usn, key, name))

                            # Relevant vs Other skills columns
                            rel_col, other_col = st.columns(2)
                            matched_skill_names = {m["matched_skill"] for m in matched}
                            with rel_col:
                                st.caption("Relevant to target (>= threshold):")
                                if matched:
                                    for item in matched:
                                        st.write(f"- {item['matched_skill']} ({item['similarity']:.2f})")
                                else:
                                    st.write("- None")
                            with other_col:
                                st.caption("Other skills:")
                                others = [s for s in skills if s not in matched_skill_names]
                                if others:
                                    for s in others:
                                        st.write(f"- {s}")
                                else:
                                    st.write("- None")

                            st.markdown("</div>", unsafe_allow_html=True)

            if submitted_global:
                # Update selection state only on submit to avoid reruns per toggle
                current = set(st.session_state.selected_usns)
                for usn, key, name in pending_checkbox_keys:
                    if st.session_state.get(key):
                        current.add(usn)
                        selected_blocks.append((usn, name))
                    else:
                        if usn in current:
                            current.discard(usn)
                st.session_state.selected_usns = sorted(current)

    with selection_col:
        st.subheader("Selected")
        sel_usns = list(st.session_state.selected_usns)
        if sel_usns:
            try:
                names_lookup = ranked_df.set_index("USN")["Name"].to_dict()
            except Exception:
                names_lookup = {}
            for u in sel_usns:
                st.write(f"{u} — {names_lookup.get(u, '')}")

            group_name = st.text_input("Group name", value="Cohort A", key="group-name-main")
            if st.button("Finalize Group", key="finalize-main"):
                if not group_name.strip():
                    st.error("Please enter a group name.")
                else:
                    ok = save_group(group_name.strip(), sel_usns)
                    if ok:
                        st.success("Group saved.")
                    else:
                        st.error("Failed to save group.")
            if st.button("Clear selection", key="clear-selection"):
                st.session_state.selected_usns = []
        else:
            st.caption("No students selected.")

    st.divider()
    with st.sidebar:
        st.subheader("Selected students")
        sel_usns = list(st.session_state.selected_usns)
        if sel_usns:
            # Show USN and Name for clarity
            try:
                names_lookup = ranked_df.set_index("USN")["Name"].to_dict()
            except Exception:
                names_lookup = {}
            lines = [f"{u} — {names_lookup.get(u, '')}" for u in sel_usns]
            st.write("\n".join(lines))
            if st.button("Finalize Group"):
                if not group_name.strip():
                    st.error("Please enter a group name.")
                else:
                    ok = save_group(group_name.strip(), sel_usns)
                    if ok:
                        st.success("Group saved.")
                    else:
                        st.error("Failed to save group.")
        else:
            st.caption("No students selected.")

    # Exports
    st.subheader("Export Results")
    col_a, col_b = st.columns(2)
    with col_a:
        csv_bytes = ranked_df.to_csv(index=False).encode("utf-8")
        st.download_button("Download CSV", data=csv_bytes, file_name="matched_students.csv", mime="text/csv")
    with col_b:
        excel_buf = io.BytesIO()
        with pd.ExcelWriter(excel_buf, engine="xlsxwriter") as writer:
            ranked_df.to_excel(writer, index=False, sheet_name="Matches")
        st.download_button(
            "Download Excel",
            data=excel_buf.getvalue(),
            file_name="matched_students.xlsx",
            mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    # Optional visualization
    if show_plot:
        try:
            maybe_render_embeddings_plot(ranked_df, input_skills, cached_encode)
        except Exception as e:
            st.warning(f"Visualization unavailable: {e}")


if __name__ == "__main__":
    main()


