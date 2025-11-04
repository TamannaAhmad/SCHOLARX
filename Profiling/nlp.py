from typing import List, Optional

import numpy as np
import streamlit as st


@st.cache_resource(show_spinner=False)
def get_spacy_nlp():
    try:
        import spacy

        try:
            return spacy.load("en_core_web_sm")
        except Exception:
            # Fallback to blank English if model isn't available
            return spacy.blank("en")
    except Exception:
        return None


@st.cache_resource(show_spinner=False)
def get_sentence_model():
    # Sentence-BERT model
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer("all-MiniLM-L6-v2")


def encode_texts(model, texts: List[str]) -> np.ndarray:
    if not texts:
        return np.zeros((0, 384), dtype=np.float32)
    emb = model.encode(texts, show_progress_bar=False, convert_to_numpy=True, normalize_embeddings=True)
    return emb.astype(np.float32)


def compute_similarity_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    if a.size == 0 or b.size == 0:
        return np.zeros((a.shape[0], b.shape[0] if b.ndim > 1 else 0), dtype=np.float32)
    # With normalized embeddings, cosine similarity == inner product
    return np.inner(a, b)


