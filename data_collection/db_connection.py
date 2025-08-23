import psycopg2
from psycopg2 import sql
import os
from datetime import time
from typing import List, Dict, Any
from dotenv import load_dotenv

load_dotenv()

def get_db_connection():
    return psycopg2.connect(
        dbname=os.getenv("DB_NAME", "scholarx"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD", "postgres"),
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432")
    )

def initialize_database():
    # Create tables if they don't exist
    
    conn = get_db_connection()
    cur = conn.cursor()
    """
    # Create tables
    with open('schema.sql', 'r') as f:
        cur.execute(f.read())
    """
    # Insert skills if they don't exist
    with open('../SQL_scripts/skills.sql', 'r') as f:
        cur.execute(f.read())
    
    conn.commit()
    cur.close()
    conn.close()

def get_departments() -> List[str]:
    return [
        "Computer Science Engineering",
        "Artificial Intelligence and Data Science",
        "Computer Science and Business Systems",
        "Electronics and Communications Engineering",
        "Mechanical Engineering Engineering",
        "Civil Engineering Engineering"
    ]

def get_skills() -> List[str]:
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT name FROM skills ORDER BY name")
    skills = [row[0] for row in cur.fetchall()]
    cur.close()
    conn.close()
    return skills