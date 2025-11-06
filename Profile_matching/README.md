# NLP-Powered Student Matcher

A Streamlit app that matches students to target skills using NLP (spaCy + SBERT), ranks by similarity with department-aware weighting, supports grouping and SQLite persistence, and exports.

## Features
- Upload CSV/Excel with columns: `USN, Department, Year, Skill, Proficiency`
- Normalize skills, embed with Sentence-BERT (`all-MiniLM-L6-v2`)
- **Graph Neural Network (GNN) & Social Network Analysis (SNA)**: Advanced graph-based matching that considers student networks and communities for better group formation (based on research: [arXiv:2410.10658](https://doi.org/10.48550/arXiv.2410.10658))
- Rank by cosine similarity, with optional sentiment adjustment
- Network centrality scoring: identifies well-connected students who can serve as group connectors
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
CSV sample (supports both formats):
```csv
USN,Department,Year,Skill,Proficiency
1,CS,3,"Python; NLP; Deep Learning","Advanced; Advanced; Intermediate"
2,EC,2,"Embedded; Signals; Verilog","Intermediate; Advanced; Intermediate"
```

Or normalized format (one row per skill):
```csv
USN,Department,Year,Skill,Proficiency
1,CS,3,Python,Advanced
1,CS,3,NLP,Advanced
1,CS,3,Deep Learning,Intermediate
2,EC,2,Embedded,Intermediate
```

**Department Codes:**
- AD: Artificial Intelligence and Data Science
- CB: Computer Science and Business Systems
- CS: Computer Science Engineering
- CV: Civil Engineering
- EC: Electronics and Communication Engineering
- ME: Mechanical Engineering

## Advanced Features

### Graph Neural Network & Social Network Analysis
The app includes advanced graph-based matching inspired by research on personalized learning group recommendations:
- **Student-Skill Graph**: Builds a network where students are nodes and edges represent skill similarity
- **Community Detection**: Uses DBSCAN clustering to identify student communities
- **Network Centrality**: Computes degree centrality to find well-connected students who can enhance group dynamics
- **Multi-level Network Scoring**: Considers both individual skill matches and network effects

This feature is enabled by default but can be toggled in the sidebar. It enhances matching by considering how students relate to each other in the skill network, leading to more cohesive and effective groups.

## Roadmap
- FAISS integration for large datasets
- UMAP-based visualization
- Cross-session embedding cache
- Enhanced community-based group recommendations

