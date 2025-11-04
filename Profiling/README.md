# NLP-Powered Student Matcher

A Streamlit app that matches students to target skills using NLP (spaCy + SBERT), ranks by similarity with department-aware weighting, supports grouping and SQLite persistence, and exports.

## Features
- Upload CSV/Excel with columns: `USN, Name, Department, Skills_Already_Know, Proficiency_Already_Know`
- Normalize skills, embed with Sentence-BERT (`all-MiniLM-L6-v2`)
- Rank by cosine similarity, with optional sentiment adjustment
- Department skill priors boost relevant students
- Group selection persists during session; save to SQLite
- Export matches to CSV/Excel
- Optional Plotly PCA/KMeans visualization
- Dark/light adaptive student cards

## Setup
1. Create a virtual environment (recommended) and install deps:
```bash
pip install -r requirements.txt
```

2. (Optional) Download spaCy model for best lemmatization:
```bash
python -m spacy download en_core_web_sm
```
If unavailable, the app falls back to a blank English model.

3. Run the app:
```bash
streamlit run app.py
```

## Notes
- First run of Sentence-BERT downloads the model.
- SQLite DB is created at `student_groups.db` beside the code.
- Similarity threshold defaults to 0.45; tune as desired.

## Data Example
CSV sample:
```csv
USN,Name,Department,Skills_Already_Know,Proficiency_Already_Know
1,Alice,CSE,"Python; NLP; Deep Learning","Advanced; Advanced; Intermediate"
2,Bob,ECE,"Embedded; Signals; Verilog","Intermediate; Advanced; Intermediate"
```

## Roadmap
- FAISS integration for large datasets
- UMAP-based visualization
- Cross-session embedding cache

