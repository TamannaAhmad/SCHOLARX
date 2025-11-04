from typing import Callable, List

import numpy as np
import pandas as pd
import plotly.express as px
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans


def maybe_render_embeddings_plot(
    ranked_df: pd.DataFrame,
    input_skills: List[str],
    encode_fn: Callable[[List[str]], np.ndarray],
) -> None:
    skills_col = ranked_df.get("Skills_Already_Know")
    if skills_col is None or len(skills_col) == 0:
        return
    texts: List[str] = []
    owners: List[str] = []
    for _, row in ranked_df.iterrows():
        usn = str(row.get("USN", ""))
        s = str(row.get("Skills_Already_Know", ""))
        for part in [p.strip() for p in s.split(";") if p.strip()]:
            texts.append(part)
            owners.append(usn)
    if not texts:
        return
    emb = encode_fn(texts)
    if emb.shape[0] < 3:
        return

    pca = PCA(n_components=2, random_state=42)
    xy = pca.fit_transform(emb)
    km = KMeans(n_clusters=min(10, max(2, emb.shape[0] // 20))),
    # Some versions return tuple when trailing comma added accidentally; ensure we get model
    kmeans = km[0] if isinstance(km, tuple) else km
    try:
        labels = kmeans.fit_predict(emb)  # type: ignore[attr-defined]
    except Exception:
        labels = np.zeros(emb.shape[0], dtype=int)

    df_plot = pd.DataFrame({
        "x": xy[:, 0],
        "y": xy[:, 1],
        "skill": texts,
        "owner": owners,
        "cluster": labels,
    })
    fig = px.scatter(
        df_plot,
        x="x",
        y="y",
        color="cluster",
        hover_data=["skill", "owner"],
        title="Skill clusters (PCA)",
    )
    import streamlit as st

    st.plotly_chart(fig, use_container_width=True)


