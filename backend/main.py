from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pathlib import Path
import sqlite3
import mimetypes

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "data" / "studypilot.db"

app = FastAPI(title="StudyPilot API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:5174", "http://localhost:5174", "https://localhost"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def connect():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    return db

def initialize():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS subjects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#8175ed',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            subject_id INTEGER,
            due_date TEXT,
            completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(subject_id) REFERENCES subjects(id)
        );

        CREATE TABLE IF NOT EXISTS exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            exam_date TEXT NOT NULL,
            subject_id INTEGER
        );
        """)
        count = db.execute("SELECT COUNT(*) FROM subjects").fetchone()[0]
        if count == 0:
            db.execute(
                "INSERT INTO subjects(name,color) VALUES (?,?)",
                ("Mathematics", "#8175ed")
            )
            db.execute(
                "INSERT INTO subjects(name,color) VALUES (?,?)",
                ("Science", "#35b99a")
            )

initialize()

class SubjectInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = "#8175ed"

class TaskInput(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    subject_id: int | None = None
    due_date: str | None = None

class ExamInput(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    exam_date: str
    subject_id: int | None = None

@app.get("/api/health")
def health():
    return {"status": "online", "application": "StudyPilot"}

@app.get("/api/dashboard")
def dashboard():
    with connect() as db:
        subjects = db.execute("SELECT COUNT(*) FROM subjects").fetchone()[0]
        total = db.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]
        done = db.execute("SELECT COUNT(*) FROM tasks WHERE completed=1").fetchone()[0]
        exams = db.execute(
            "SELECT COUNT(*) FROM exams WHERE exam_date >= date('now')"
        ).fetchone()[0]
    return {
        "subjects": subjects,
        "tasks": total,
        "completed": done,
        "pending": total - done,
        "exams": exams,
        "completion": round(done / total * 100) if total else 0
    }

@app.get("/api/subjects")
def get_subjects():
    with connect() as db:
        return [dict(r) for r in db.execute(
            "SELECT * FROM subjects ORDER BY id DESC"
        ).fetchall()]

@app.post("/api/subjects")
def add_subject(item: SubjectInput):
    with connect() as db:
        cur = db.execute(
            "INSERT INTO subjects(name,color) VALUES (?,?)",
            (item.name.strip(), item.color)
        )
        return dict(db.execute(
            "SELECT * FROM subjects WHERE id=?", (cur.lastrowid,)
        ).fetchone())

@app.delete("/api/subjects/{subject_id}")
def delete_subject(subject_id: int):
    with connect() as db:
        if not db.execute(
            "SELECT id FROM subjects WHERE id=?", (subject_id,)
        ).fetchone():
            raise HTTPException(404, "Subject not found")
        db.execute("DELETE FROM subjects WHERE id=?", (subject_id,))
        db.execute("UPDATE tasks SET subject_id=NULL WHERE subject_id=?", (subject_id,))
        db.execute("UPDATE exams SET subject_id=NULL WHERE subject_id=?", (subject_id,))
    return {"success": True}

@app.get("/api/tasks")
def get_tasks():
    with connect() as db:
        return [dict(r) for r in db.execute("""
            SELECT tasks.*, subjects.name AS subject_name
            FROM tasks LEFT JOIN subjects ON tasks.subject_id=subjects.id
            ORDER BY tasks.completed ASC, tasks.due_date ASC, tasks.id DESC
        """).fetchall()]

@app.post("/api/tasks")
def add_task(item: TaskInput):
    with connect() as db:
        cur = db.execute(
            "INSERT INTO tasks(title,subject_id,due_date) VALUES (?,?,?)",
            (item.title.strip(), item.subject_id, item.due_date)
        )
        return dict(db.execute("""
            SELECT tasks.*, subjects.name AS subject_name
            FROM tasks LEFT JOIN subjects ON tasks.subject_id=subjects.id
            WHERE tasks.id=?
        """, (cur.lastrowid,)).fetchone())

@app.patch("/api/tasks/{task_id}/complete")
def complete_task(task_id: int):
    with connect() as db:
        task = db.execute(
            "SELECT completed FROM tasks WHERE id=?", (task_id,)
        ).fetchone()
        if not task:
            raise HTTPException(404, "Task not found")
        new_value = 0 if task["completed"] else 1
        db.execute("UPDATE tasks SET completed=? WHERE id=?", (new_value, task_id))
    return {"completed": new_value}

@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: int):
    with connect() as db:
        cur = db.execute("DELETE FROM tasks WHERE id=?", (task_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Task not found")
    return {"success": True}

@app.get("/api/exams")
def get_exams():
    with connect() as db:
        return [dict(r) for r in db.execute("""
            SELECT exams.*, subjects.name AS subject_name
            FROM exams LEFT JOIN subjects ON exams.subject_id=subjects.id
            ORDER BY exams.exam_date ASC
        """).fetchall()]

@app.post("/api/exams")
def add_exam(item: ExamInput):
    with connect() as db:
        cur = db.execute(
            "INSERT INTO exams(title,exam_date,subject_id) VALUES (?,?,?)",
            (item.title.strip(), item.exam_date, item.subject_id)
        )
        return dict(db.execute(
            "SELECT * FROM exams WHERE id=?", (cur.lastrowid,)
        ).fetchone())

@app.delete("/api/exams/{exam_id}")
def delete_exam(exam_id: int):
    with connect() as db:
        cur = db.execute("DELETE FROM exams WHERE id=?", (exam_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Exam not found")
    return {"success": True}

# ===== STAGE 2: SYLLABUS AND NOTES =====

class TopicInput(BaseModel):
    subject_id: int
    title: str = Field(min_length=1, max_length=200)

class NoteInput(BaseModel):
    subject_id: int | None = None
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(default="", max_length=50000)

def initialize_academic_tables():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS topics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            completed INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(subject_id) REFERENCES subjects(id)
        );

        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id INTEGER,
            title TEXT NOT NULL,
            content TEXT DEFAULT '',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(subject_id) REFERENCES subjects(id)
        );
        """)

initialize_academic_tables()

@app.get("/api/topics")
def get_topics():
    with connect() as db:
        return [dict(r) for r in db.execute("""
            SELECT topics.*, subjects.name AS subject_name
            FROM topics
            JOIN subjects ON topics.subject_id=subjects.id
            ORDER BY subjects.name, topics.id DESC
        """).fetchall()]

@app.post("/api/topics")
def add_topic(item: TopicInput):
    with connect() as db:
        subject = db.execute(
            "SELECT id FROM subjects WHERE id=?", (item.subject_id,)
        ).fetchone()
        if not subject:
            raise HTTPException(404, "Subject not found")

        cur = db.execute(
            "INSERT INTO topics(subject_id,title) VALUES (?,?)",
            (item.subject_id, item.title.strip())
        )
        return dict(db.execute(
            "SELECT * FROM topics WHERE id=?", (cur.lastrowid,)
        ).fetchone())

@app.patch("/api/topics/{topic_id}/complete")
def complete_topic(topic_id: int):
    with connect() as db:
        topic = db.execute(
            "SELECT completed FROM topics WHERE id=?", (topic_id,)
        ).fetchone()
        if not topic:
            raise HTTPException(404, "Topic not found")
        value = 0 if topic["completed"] else 1
        db.execute(
            "UPDATE topics SET completed=? WHERE id=?", (value, topic_id)
        )
        return {"completed": value}

@app.delete("/api/topics/{topic_id}")
def delete_topic(topic_id: int):
    with connect() as db:
        cur = db.execute("DELETE FROM topics WHERE id=?", (topic_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Topic not found")
    return {"success": True}

@app.get("/api/notes")
def get_notes():
    with connect() as db:
        return [dict(r) for r in db.execute("""
            SELECT notes.*, subjects.name AS subject_name
            FROM notes
            LEFT JOIN subjects ON notes.subject_id=subjects.id
            ORDER BY notes.id DESC
        """).fetchall()]

@app.post("/api/notes")
def add_note(item: NoteInput):
    with connect() as db:
        if item.subject_id is not None:
            subject = db.execute(
                "SELECT id FROM subjects WHERE id=?", (item.subject_id,)
            ).fetchone()
            if not subject:
                raise HTTPException(404, "Subject not found")

        cur = db.execute(
            "INSERT INTO notes(subject_id,title,content) VALUES (?,?,?)",
            (item.subject_id, item.title.strip(), item.content)
        )
        return dict(db.execute(
            "SELECT * FROM notes WHERE id=?", (cur.lastrowid,)
        ).fetchone())

@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int):
    with connect() as db:
        cur = db.execute("DELETE FROM notes WHERE id=?", (note_id,))
        if cur.rowcount == 0:
            raise HTTPException(404, "Note not found")
    return {"success": True}


# ========== STUDYPILOT AI MONITOR ==========

import os
import json
import urllib.request
import urllib.error

def load_backend_env():
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

load_backend_env()

class AIAnalysisInput(BaseModel):
    progress: dict = Field(default_factory=dict)

@app.get("/api/ai/status")
def ai_status():
    return {
        "available": bool(os.getenv("GEMINI_API_KEY")),
        "provider": "Google Gemini",
        "feature": "StudyPilot AI Monitor"
    }

@app.post("/api/ai/analyze")
def analyze_study_progress(item: AIAnalysisInput):
    api_key = os.getenv("GEMINI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Gemini API key is not configured. Add it to backend/.env."
        )

    progress_json = json.dumps(item.progress, ensure_ascii=False)

    if len(progress_json) > 12000:
        raise HTTPException(413, "Progress data is too large.")

    prompt = f"""
You are StudyPilot AI Monitor, a supportive academic study assistant.

Analyse this student's study progress:
{progress_json}

Return a useful report with these sections:
1. Overall progress
2. Strong areas
3. Subjects or topics needing attention
4. Recommended revision actions
5. Three practical next study tasks
6. Positive, realistic encouragement

Be specific, constructive and concise.
Do not shame the student or invent missing information.
Do not claim to know exam results or abilities that were not provided.
Return plain readable text.
"""

    url = (
        "https://generativelanguage.googleapis.com/v1beta/"
        "models/gemini-3.5-flash-lite:generateContent?key=" + api_key
    )

    payload = {
        "contents": [{
            "parts": [{"text": prompt}]
        }],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 1200
        }
    }

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(request, timeout=40) as response:
            result = json.loads(response.read().decode("utf-8"))

        candidates = result.get("candidates", [])
        if not candidates:
            raise HTTPException(502, "AI returned an empty response.")

        text = "".join(
            part.get("text", "")
            for part in candidates[0].get("content", {}).get("parts", [])
        )

        return {
            "success": True,
            "provider": "Google Gemini",
            "analysis": text
        }

    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise HTTPException(
            status_code=502,
            detail="Gemini API error: " + detail[:1000]
        )
    except urllib.error.URLError:
        raise HTTPException(
            status_code=503,
            detail="Unable to connect to Gemini. Check your internet connection."
        )






# Serve the production React/PWA frontend
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/javascript", ".mjs")
FRONTEND_DIST = ROOT / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount(
        "/",
        StaticFiles(directory=FRONTEND_DIST, html=True),
        name="frontend"
    )
