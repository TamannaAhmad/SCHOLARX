import streamlit as st


def get_container_style() -> str:
    base = st.get_option("theme.base") or "light"
    if base == "dark":
        bg = "#1e1e1e"
        text = "#ffffff"
        border = "#3b82f6"
    else:
        bg = "#f8fbff"
        text = "#111827"
        border = "#3b82f6"
    return f"""
<style>
.student-box {{
  background: {bg};
  color: {text};
  border: 1px solid {border};
  border-radius: 10px;
  padding: 12px 14px;
  margin-bottom: 10px;
}}
</style>
"""


