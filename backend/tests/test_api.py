import os
import pytest
import uuid
import json
from datetime import datetime, timezone
from fastapi.testclient import TestClient

# Set test DB before importing app
TEST_DB = os.path.join(os.path.dirname(__file__), "test_meditrack.db")
os.environ["MEDITRACK_DB_PATH"] = TEST_DB

from app.main import app
from app.database import init_db, get_db_connection

@pytest.fixture(autouse=True)
def setup_and_teardown():
    # Remove old test DB if present
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass
    init_db(TEST_DB)
    yield
    # Cleanup after test
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass

client = TestClient(app)

def test_health_and_sync_status():
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    res_status = client.get("/api/sync/status")
    assert res_status.status_code == 200
    data = res_status.json()
    assert data["status"] == "online"
    assert data["counts"]["schedules"] >= 3

def test_successful_record_creation():
    op_id = str(uuid.uuid4())
    symptom_id = str(uuid.uuid4())
    payload = {
        "id": symptom_id,
        "operation_id": op_id,
        "symptom_name": "Throat irritation and mild cough",
        "severity": 4,
        "notes": "Started after morning walk",
        "onset_time": datetime.now(timezone.utc).isoformat(),
        "logged_at": datetime.now(timezone.utc).isoformat()
    }
    response = client.post("/api/sync/symptom", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "synced"
    assert data["operation_id"] == op_id
    assert data["entity_id"] == symptom_id

    # Verify database persistence
    conn = get_db_connection(TEST_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM symptoms WHERE id = ?", (symptom_id,))
    row = cursor.fetchone()
    assert row is not None
    assert row["symptom_name"] == "Throat irritation and mild cough"
    assert row["severity"] == 4
    conn.close()

def test_duplicate_operation_submission_idempotency():
    op_id = "op_idempotency_test_123"
    event_id = "event_test_123"
    payload = {
        "id": event_id,
        "operation_id": op_id,
        "medication_name": "Amoxicillin",
        "dosage": "500mg",
        "scheduled_time": "08:00",
        "taken_at": datetime.now(timezone.utc).isoformat(),
        "status": "taken",
        "notes": "Taken with glass of water"
    }

    # First submission
    first_res = client.post("/api/sync/medication-event", json=payload)
    assert first_res.status_code == 201
    assert first_res.json()["status"] == "synced"

    # Replay of identical operation (e.g. client retried because response was dropped)
    second_res = client.post("/api/sync/medication-event", json=payload)
    assert second_res.status_code == 200
    assert second_res.json()["status"] == "idempotent_replay"
    assert "already processed" in second_res.json()["message"].lower()

    # Verify only ONE record exists in the database
    conn = get_db_connection(TEST_DB)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM medication_events WHERE operation_id = ?", (op_id,))
    count = cursor.fetchone()["count"]
    assert count == 1
    cursor.execute("SELECT COUNT(*) as count FROM operations WHERE operation_id = ?", (op_id,))
    op_count = cursor.fetchone()["count"]
    assert op_count == 1
    conn.close()

def test_invalid_payloads_rejected():
    # Empty symptom name and out-of-range severity (> 10)
    bad_payload = {
        "id": str(uuid.uuid4()),
        "operation_id": str(uuid.uuid4()),
        "symptom_name": "",
        "severity": 15,
        "onset_time": datetime.now(timezone.utc).isoformat(),
        "logged_at": datetime.now(timezone.utc).isoformat()
    }
    response = client.post("/api/sync/symptom", json=bad_payload)
    assert response.status_code == 422

def test_database_persistence_across_connections():
    op_id = str(uuid.uuid4())
    sym_id = str(uuid.uuid4())
    payload = {
        "id": sym_id,
        "operation_id": op_id,
        "symptom_name": "Migraine",
        "severity": 8,
        "onset_time": datetime.now(timezone.utc).isoformat(),
        "logged_at": datetime.now(timezone.utc).isoformat()
    }
    res = client.post("/api/sync/symptom", json=payload)
    assert res.status_code == 201

    # Close and reopen new independent connection
    new_conn = get_db_connection(TEST_DB)
    cur = new_conn.cursor()
    cur.execute("SELECT * FROM symptoms WHERE operation_id = ?", (op_id,))
    row = cur.fetchone()
    assert row is not None
    assert row["symptom_name"] == "Migraine"
    new_conn.close()

def test_batch_sync_and_retry_behavior():
    op1 = str(uuid.uuid4())
    op2 = str(uuid.uuid4())

    batch_payload = {
        "operations": [
            {
                "operation_id": op1,
                "entity_type": "symptom",
                "payload": {
                    "id": str(uuid.uuid4()),
                    "symptom_name": "Dizziness",
                    "severity": 5,
                    "onset_time": datetime.now(timezone.utc).isoformat(),
                    "logged_at": datetime.now(timezone.utc).isoformat()
                }
            },
            {
                "operation_id": op2,
                "entity_type": "medication_event",
                "payload": {
                    "id": str(uuid.uuid4()),
                    "medication_name": "Metformin",
                    "dosage": "850mg",
                    "taken_at": datetime.now(timezone.utc).isoformat(),
                    "status": "taken"
                }
            }
        ]
    }

    # Initial sync
    res = client.post("/api/sync/batch", json=batch_payload)
    assert res.status_code == 200
    data = res.json()
    assert data["synced_count"] == 2
    assert data["replayed_count"] == 0

    # Retry batch (simulating network dropped response retry)
    res_retry = client.post("/api/sync/batch", json=batch_payload)
    assert res_retry.status_code == 200
    data_retry = res_retry.json()
    assert data_retry["replayed_count"] == 2
    assert data_retry["synced_count"] == 0

def test_conflict_detection_on_schedule_update():
    # Fetch default schedule
    res = client.get("/api/medications/schedule")
    assert res.status_code == 200
    schedules = res.json()
    amox = next(s for s in schedules if s["id"] == "sched_amoxicillin")
    initial_version = amox["version"]

    # First update: client sends matching version
    update_payload = {
        "id": amox["id"],
        "medication_name": "Amoxicillin Trihydrate",
        "dosage": "500mg",
        "frequency": "Every 8 hours",
        "times": ["08:00", "14:00", "20:00"],
        "instructions": "Take with full meal.",
        "client_version": initial_version
    }
    update_res = client.put(f"/api/medications/schedule/{amox['id']}", json=update_payload)
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["version"] == initial_version + 1

    # Second update from offline client holding STALE version
    stale_payload = {
        "id": amox["id"],
        "medication_name": "Amoxicillin Conflicting Name",
        "dosage": "250mg",
        "frequency": "Once daily",
        "times": ["09:00"],
        "client_version": initial_version  # Outdated version!
    }
    conflict_res = client.put(f"/api/medications/schedule/{amox['id']}", json=stale_payload)
    assert conflict_res.status_code == 409
    conflict_data = conflict_res.json()
    assert conflict_data["error"] == "version_conflict"
    assert conflict_data["server_version"] == initial_version + 1
    assert conflict_data["client_version"] == initial_version

def test_health_history_endpoint():
    # Insert a symptom
    op_id = str(uuid.uuid4())
    client.post("/api/sync/symptom", json={
        "id": str(uuid.uuid4()),
        "operation_id": op_id,
        "symptom_name": "Fatigue",
        "severity": 3,
        "onset_time": datetime.now(timezone.utc).isoformat(),
        "logged_at": datetime.now(timezone.utc).isoformat()
    })

    # Retrieve history
    history_res = client.get("/api/history")
    assert history_res.status_code == 200
    history_data = history_res.json()
    assert history_data["total_records"] >= 1
    assert any(item["details"].get("symptom_name") == "Fatigue" for item in history_data["history"])
    assert len(history_data["schedules"]) >= 3

def test_create_and_delete_medication_schedule():
    new_sched = {
        "id": "sched_ibuprofen_test",
        "medication_name": "Ibuprofen",
        "dosage": "400mg",
        "frequency": "Every 6 hours as needed",
        "times": ["08:00", "14:00", "20:00"],
        "instructions": "Take with food for pain."
    }
    create_res = client.post("/api/medications/schedule", json=new_sched)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["id"] == "sched_ibuprofen_test"
    assert created["version"] == 1

    # Verify present in schedules list
    get_res = client.get("/api/medications/schedule")
    assert any(s["id"] == "sched_ibuprofen_test" for s in get_res.json())

    # Delete schedule
    del_res = client.delete("/api/medications/schedule/sched_ibuprofen_test")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # Verify deleted
    get_after = client.get("/api/medications/schedule")
    assert not any(s["id"] == "sched_ibuprofen_test" for s in get_after.json())
