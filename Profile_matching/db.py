import os
import sqlite3
from typing import Iterable, List, Tuple

import streamlit as st


DB_PATH = os.path.join(os.path.dirname(__file__), "student_groups.db")


def init_db() -> None:
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS groups (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_name TEXT NOT NULL,
                students TEXT NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def save_group(group_name: str, usns: Iterable[str]) -> bool:
    try:
        conn = sqlite3.connect(DB_PATH)
        try:
            students = ",".join(usns)
            conn.execute(
                "INSERT INTO groups (group_name, students) VALUES (?, ?)",
                (group_name, students),
            )
            conn.commit()
            return True
        finally:
            conn.close()
    except Exception:
        return False


def list_groups() -> List[Tuple[int, str, str]]:
    try:
        conn = sqlite3.connect(DB_PATH)
        try:
            rows = conn.execute("SELECT id, group_name, students FROM groups ORDER BY id DESC").fetchall()
            return [(int(r[0]), str(r[1]), str(r[2])) for r in rows]
        finally:
            conn.close()
    except Exception:
        return []


