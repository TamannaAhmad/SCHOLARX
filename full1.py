import pandas as pd
import streamlit as st
import io
from collections import defaultdict

# -----------------------------
# Utility Functions
# -----------------------------
def normalize_skill(skill):
    return skill.strip().lower()

def safe_prof(value):
    try:
        v = int(value)
        return max(1, min(v, 5))
    except:
        return 3


# -----------------------------
# Load student data from CSV/Excel
# -----------------------------
def load_students_from_csv(file_path):
    df = pd.read_csv(file_path) if not hasattr(file_path, "read") else pd.read_csv(file_path)
    students = []

    for _, row in df.iterrows():
        usn = str(row.get("USN", "")).strip()
        dept = str(row.get("Department", "")).strip()
        year = int(row.get("Year", 0))
        skills_dict = {}

        if "Skills_Already_Know" in df.columns and pd.notna(row["Skills_Already_Know"]):
            skills = [normalize_skill(s) for s in str(row["Skills_Already_Know"]).split(";") if s.strip()]
            if "Proficiency_Already_Know" in df.columns and pd.notna(row["Proficiency_Already_Know"]):
                profs = [safe_prof(p) for p in str(row["Proficiency_Already_Know"]).split(";")]
            else:
                profs = [3] * len(skills)
            for skill, prof in zip(skills, profs):
                skills_dict[skill] = prof

        students.append({
            "usn": usn,
            "department": dept,
            "year": year,
            "skills": skills_dict
        })
    return students


# -----------------------------
# Skill-Based Ranking
# -----------------------------
def rank_students_by_skills(students, input_skills):
    input_skills = [normalize_skill(s) for s in input_skills]
    results = []

    for student in students:
        student_skills = student["skills"]
        matched = [s for s in input_skills if s in student_skills]
        match_count = len(matched)
        total_prof = sum(student_skills[s] for s in matched) if matched else 0

        results.append({
            "usn": student["usn"],
            "dept": student["department"],
            "year": student["year"],
            "matched_skills": matched,
            "num_matches": match_count,
            "total_proficiency": total_prof,
            "avg_proficiency": round(total_prof / match_count, 2) if match_count else 0
        })

    ranked = sorted(results, key=lambda x: (x["num_matches"], x["total_proficiency"]), reverse=True)
    return ranked


# -----------------------------
# Streamlit App
# -----------------------------
st.set_page_config(page_title="🎯 Skill-Based Student Matcher", layout="wide")
st.title("🎯 Skill-Based Student Matcher")

if "selected_students" not in st.session_state:
    st.session_state.selected_students = []
if "final_group" not in st.session_state:
    st.session_state.final_group = []

# Sidebar
with st.sidebar:
    st.header("👥 Selected Students")
    if st.session_state.selected_students:
        for usn in list(st.session_state.selected_students):
            st.write(usn)
            if st.button(f"Remove {usn}", key=f"remove_{usn}"):
                st.session_state.selected_students.remove(usn)
                st.experimental_rerun()
        if st.button("Clear All Selections"):
            st.session_state.selected_students = []
            st.experimental_rerun()
    else:
        st.info("No students selected yet.")

# Upload file
uploaded_file = st.file_uploader("📂 Upload CSV or Excel File", type=["csv", "xlsx"])

if uploaded_file:
    if uploaded_file.name.endswith(".xlsx"):
        df = pd.read_excel(uploaded_file)
        tmp = "temp_uploaded.csv"
        df.to_csv(tmp, index=False)
        file_path = tmp
    else:
        file_path = uploaded_file

    students = load_students_from_csv(file_path)
    st.success(f"✅ Loaded {len(students)} student profiles.")

    st.subheader("🧠 Enter the Skills You're Looking For")
    skill_input = st.text_input("Enter comma-separated skills (e.g., Python, Machine Learning, TensorFlow):")

    if skill_input:
        input_skills = [s.strip() for s in skill_input.split(",") if s.strip()]
        st.write(f"🔍 Searching for students with: **{', '.join(input_skills)}**")

        ranked_students = rank_students_by_skills(students, input_skills)
        ranked_students = [r for r in ranked_students if r["num_matches"] > 0]

        if not ranked_students:
            st.warning("No matches found for the given skills.")
        else:
            st.success(f"Found {len(ranked_students)} matching students!")

            dept_groups = defaultdict(list)
            for r in ranked_students:
                dept_groups[r["dept"]].append(r)

            # Display results grouped by department
            for dept, group in dept_groups.items():
                with st.expander(f"🏫 Department: {dept} ({len(group)} students)", expanded=False):
                    for idx, r in enumerate(group):
                        key = f"select_{r['usn']}_{dept}_{r['year']}_{idx}"
                        checked = st.checkbox(
                            f"Select {r['usn']} (Matches: {r['num_matches']}, Score: {r['total_proficiency']})",
                            key=key
                        )

                        if checked and r["usn"] not in st.session_state.selected_students:
                            st.session_state.selected_students.append(r["usn"])
                        if not checked and r["usn"] in st.session_state.selected_students:
                            st.session_state.selected_students.remove(r["usn"])

                        st.markdown(
                            f"""
                            <div style="
                                border: 2px solid #3498db;
                                border-radius: 10px;
                                padding: 10px;
                                margin: 8px 0;
                                background-color: #f9f9f9;">
                                <b>USN:</b> {r['usn']} | <b>Year:</b> {r['year']}<br>
                                <b>Matched Skills:</b> {', '.join(r['matched_skills'])}<br>
                                <b>Number of Matches:</b> {r['num_matches']}<br>
                                <b>Total Proficiency:</b> {r['total_proficiency']} | 
                                <b>Avg Proficiency:</b> {r['avg_proficiency']}
                            </div>
                            """,
                            unsafe_allow_html=True
                        )

            # Group builder
            st.subheader("👥 Group Builder")
            if st.session_state.selected_students:
                st.success(f"Selected Students: {', '.join(st.session_state.selected_students)}")

                if st.button("Finalize Group"):
                    st.session_state.final_group = [
                        r for r in ranked_students if r["usn"] in st.session_state.selected_students
                    ]
                    st.success("🎉 Group finalized successfully!")
                    st.write(pd.DataFrame(st.session_state.final_group))
            else:
                st.info("Select students from above to build a group.")

            # Export all matches
            export_df = pd.DataFrame(ranked_students)
            st.subheader("📥 Download Results")

            csv_buffer = io.BytesIO()
            csv_buffer.write(export_df.to_csv(index=False).encode("utf-8"))
            st.download_button(
                "⬇️ Download All Matches (CSV)",
                data=csv_buffer.getvalue(),
                file_name="ranked_student_matches.csv",
                mime="text/csv"
            )

            excel_buffer = io.BytesIO()
            export_df.to_excel(excel_buffer, index=False, engine="openpyxl")
            excel_buffer.seek(0)
            st.download_button(
                "⬇️ Download All Matches (Excel)",
                data=excel_buffer,
                file_name="ranked_student_matches.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )

            # Export Finalized Group
            if st.session_state.final_group:
                st.subheader("📦 Download Finalized Group")

                group_df = pd.DataFrame(st.session_state.final_group)
                group_csv = io.BytesIO()
                group_csv.write(group_df.to_csv(index=False).encode("utf-8"))

                group_excel = io.BytesIO()
                group_df.to_excel(group_excel, index=False, engine="openpyxl")
                group_excel.seek(0)

                st.download_button(
                    "⬇️ Download Finalized Group (CSV)",
                    data=group_csv.getvalue(),
                    file_name="finalized_group.csv",
                    mime="text/csv"
                )
                st.download_button(
                    "⬇️ Download Finalized Group (Excel)",
                    data=group_excel,
                    file_name="finalized_group.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )

else:
    st.info("Please upload your student skills CSV or Excel file to start.")
