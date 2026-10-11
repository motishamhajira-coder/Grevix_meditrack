import sqlite3
import json
import os
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

DB_PATH = os.environ.get("MEDITRACK_DB_PATH", os.path.join(os.path.dirname(os.path.dirname(__file__)), "meditrack.db"))

def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    target_path = db_path or DB_PATH
    conn = sqlite3.connect(target_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn

def init_db(db_path: Optional[str] = None) -> None:
    conn = get_db_connection(db_path)
    cursor = conn.cursor()

    # Operations table for idempotency tracking
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS operations (
        operation_id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        status TEXT NOT NULL,
        response_payload TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # Symptoms table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS symptoms (
        id TEXT PRIMARY KEY,
        operation_id TEXT UNIQUE NOT NULL,
        symptom_name TEXT NOT NULL,
        severity INTEGER NOT NULL CHECK (severity >= 1 AND severity <= 10),
        notes TEXT,
        onset_time TEXT NOT NULL,
        logged_at TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        FOREIGN KEY (operation_id) REFERENCES operations (operation_id)
    );
    """)

    # Medication Events (taking/skipping doses)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS medication_events (
        id TEXT PRIMARY KEY,
        operation_id TEXT UNIQUE NOT NULL,
        medication_name TEXT NOT NULL,
        dosage TEXT NOT NULL,
        scheduled_time TEXT,
        taken_at TEXT NOT NULL,
        status TEXT NOT NULL,
        notes TEXT,
        synced_at TEXT NOT NULL,
        FOREIGN KEY (operation_id) REFERENCES operations (operation_id)
    );
    """)

    # Medication Schedules with versioning for conflict detection
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS medication_schedules (
        id TEXT PRIMARY KEY,
        medication_name TEXT NOT NULL,
        dosage TEXT NOT NULL,
        frequency TEXT NOT NULL,
        times TEXT NOT NULL,
        instructions TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
    );
    """)

    # Seed default medication schedules if empty
    cursor.execute("SELECT COUNT(*) as count FROM medication_schedules")
    count = cursor.fetchone()["count"]
    if count == 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        initial_schedules = [
            (
                "sched_amoxicillin",
                "Amoxicillin",
                "500mg",
                "Every 8 hours",
                json.dumps(["08:00", "14:00", "20:00"]),
                "Take with food or water. Complete full 7-day course.",
                1,
                now_iso
            ),
            (
                "sched_metformin",
                "Metformin",
                "850mg",
                "Twice daily",
                json.dumps(["09:00", "19:00"]),
                "Take with morning and evening meals.",
                1,
                now_iso
            ),
            (
                "sched_lisinopril",
                "Lisinopril",
                "10mg",
                "Once daily",
                json.dumps(["08:30"]),
                "Take in the morning for blood pressure maintenance.",
                1,
                now_iso
            )
        ]
        cursor.executemany("""
        INSERT INTO medication_schedules (id, medication_name, dosage, frequency, times, instructions, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, initial_schedules)

    conn.commit()
    conn.close()

# Auto-initialize when database module is loaded
init_db()
