import json
import sqlite3
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, status, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.database import get_db_connection, init_db
import uuid
from app.models import (
    SymptomCreate,
    MedicationEventCreate,
    MedicationSchedule,
    MedicationScheduleCreate,
    MedicationScheduleUpdate,
    BatchSyncRequest,
    BatchSyncResponse,
    SyncOperationResult,
    HealthHistoryResponse,
    HealthHistoryItem
)

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="MediTrack Offline-First Healthcare API",
    description="Resilient healthcare tracking API with idempotent synchronization and conflict resolution",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "MediTrack Offline-First Backend",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

@app.get("/api/sync/status")
def sync_status():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) as count FROM operations")
    total_operations = cursor.fetchone()["count"]
    cursor.execute("SELECT COUNT(*) as count FROM symptoms")
    total_symptoms = cursor.fetchone()["count"]
    cursor.execute("SELECT COUNT(*) as count FROM medication_events")
    total_medication_events = cursor.fetchone()["count"]
    cursor.execute("SELECT COUNT(*) as count FROM medication_schedules")
    total_schedules = cursor.fetchone()["count"]
    conn.close()

    return {
        "status": "online",
        "server_time": datetime.now(timezone.utc).isoformat(),
        "total_operations_recorded": total_operations,
        "counts": {
            "symptoms": total_symptoms,
            "medication_events": total_medication_events,
            "schedules": total_schedules
        }
    }

def _process_symptom_operation(cursor: sqlite3.Cursor, symptom: SymptomCreate) -> SyncOperationResult:
    now_iso = datetime.now(timezone.utc).isoformat()
    # Check for existing operation (Idempotency)
    cursor.execute("SELECT * FROM operations WHERE operation_id = ?", (symptom.operation_id,))
    existing_op = cursor.fetchone()

    if existing_op:
        cached = json.loads(existing_op["response_payload"]) if existing_op["response_payload"] else {}
        return SyncOperationResult(
            operation_id=symptom.operation_id,
            entity_type="symptom",
            entity_id=symptom.id,
            status="idempotent_replay",
            message="Operation already processed. Replaying cached acknowledgement.",
            server_timestamp=now_iso,
            data=cached
        )

    # Insert into operations
    cursor.execute("""
    INSERT INTO operations (operation_id, entity_type, entity_id, status, response_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (symptom.operation_id, "symptom", symptom.id, "processed", None, now_iso))

    # Insert into symptoms
    cursor.execute("""
    INSERT INTO symptoms (id, operation_id, symptom_name, severity, notes, onset_time, logged_at, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        symptom.id,
        symptom.operation_id,
        symptom.symptom_name,
        symptom.severity,
        symptom.notes,
        symptom.onset_time,
        symptom.logged_at,
        now_iso
    ))

    result_data = {
        "id": symptom.id,
        "symptom_name": symptom.symptom_name,
        "severity": symptom.severity,
        "onset_time": symptom.onset_time,
        "synced_at": now_iso
    }

    # Update operation with response payload
    cursor.execute(
        "UPDATE operations SET response_payload = ? WHERE operation_id = ?",
        (json.dumps(result_data), symptom.operation_id)
    )

    return SyncOperationResult(
        operation_id=symptom.operation_id,
        entity_type="symptom",
        entity_id=symptom.id,
        status="synced",
        message="Symptom record safely synced to server database.",
        server_timestamp=now_iso,
        data=result_data
    )

def _process_medication_event_operation(cursor: sqlite3.Cursor, event: MedicationEventCreate) -> SyncOperationResult:
    now_iso = datetime.now(timezone.utc).isoformat()
    # Check for existing operation (Idempotency)
    cursor.execute("SELECT * FROM operations WHERE operation_id = ?", (event.operation_id,))
    existing_op = cursor.fetchone()

    if existing_op:
        cached = json.loads(existing_op["response_payload"]) if existing_op["response_payload"] else {}
        return SyncOperationResult(
            operation_id=event.operation_id,
            entity_type="medication_event",
            entity_id=event.id,
            status="idempotent_replay",
            message="Operation already processed. Replaying cached acknowledgement.",
            server_timestamp=now_iso,
            data=cached
        )

    # Insert into operations
    cursor.execute("""
    INSERT INTO operations (operation_id, entity_type, entity_id, status, response_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (event.operation_id, "medication_event", event.id, "processed", None, now_iso))

    # Insert into medication_events
    cursor.execute("""
    INSERT INTO medication_events (id, operation_id, medication_name, dosage, scheduled_time, taken_at, status, notes, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        event.id,
        event.operation_id,
        event.medication_name,
        event.dosage,
        event.scheduled_time,
        event.taken_at,
        event.status,
        event.notes,
        now_iso
    ))

    result_data = {
        "id": event.id,
        "medication_name": event.medication_name,
        "dosage": event.dosage,
        "taken_at": event.taken_at,
        "status": event.status,
        "synced_at": now_iso
    }

    # Cache response
    cursor.execute(
        "UPDATE operations SET response_payload = ? WHERE operation_id = ?",
        (json.dumps(result_data), event.operation_id)
    )

    return SyncOperationResult(
        operation_id=event.operation_id,
        entity_type="medication_event",
        entity_id=event.id,
        status="synced",
        message="Medication event safely synced to server database.",
        server_timestamp=now_iso,
        data=result_data
    )

@app.post("/api/sync/symptom", response_model=SyncOperationResult, status_code=status.HTTP_201_CREATED)
def sync_symptom(symptom: SymptomCreate, response: Response):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        result = _process_symptom_operation(cursor, symptom)
        conn.commit()
        if result.status == "idempotent_replay":
            response.status_code = status.HTTP_200_OK
        return result
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during symptom sync: {str(e)}")
    finally:
        conn.close()

@app.post("/api/sync/medication-event", response_model=SyncOperationResult, status_code=status.HTTP_201_CREATED)
def sync_medication_event(event: MedicationEventCreate, response: Response):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        result = _process_medication_event_operation(cursor, event)
        conn.commit()
        if result.status == "idempotent_replay":
            response.status_code = status.HTTP_200_OK
        return result
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Database error during medication sync: {str(e)}")
    finally:
        conn.close()

@app.post("/api/sync/batch", response_model=BatchSyncResponse)
def sync_batch(batch: BatchSyncRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    results: List[SyncOperationResult] = []
    synced_count = 0
    replayed_count = 0
    conflict_count = 0
    failed_count = 0

    for item in batch.operations:
        try:
            if item.entity_type == "symptom":
                symptom_data = SymptomCreate(**item.payload, operation_id=item.operation_id)
                res = _process_symptom_operation(cursor, symptom_data)
                conn.commit()
                results.append(res)
                if res.status == "synced":
                    synced_count += 1
                elif res.status == "idempotent_replay":
                    replayed_count += 1

            elif item.entity_type == "medication_event":
                med_data = MedicationEventCreate(**item.payload, operation_id=item.operation_id)
                res = _process_medication_event_operation(cursor, med_data)
                conn.commit()
                results.append(res)
                if res.status == "synced":
                    synced_count += 1
                elif res.status == "idempotent_replay":
                    replayed_count += 1

            elif item.entity_type == "schedule_update":
                schedule_data = MedicationScheduleUpdate(**item.payload)
                # Check current version on server
                cursor.execute("SELECT * FROM medication_schedules WHERE id = ?", (schedule_data.id,))
                current = cursor.fetchone()
                if not current:
                    failed_count += 1
                    results.append(SyncOperationResult(
                        operation_id=item.operation_id,
                        entity_type="schedule_update",
                        status="failed",
                        message=f"Schedule ID {schedule_data.id} not found on server",
                        server_timestamp=datetime.now(timezone.utc).isoformat()
                    ))
                elif current["version"] != schedule_data.client_version:
                    conflict_count += 1
                    server_data = {
                        "id": current["id"],
                        "medication_name": current["medication_name"],
                        "dosage": current["dosage"],
                        "frequency": current["frequency"],
                        "times": json.loads(current["times"]),
                        "instructions": current["instructions"],
                        "version": current["version"],
                        "updated_at": current["updated_at"]
                    }
                    results.append(SyncOperationResult(
                        operation_id=item.operation_id,
                        entity_type="schedule_update",
                        entity_id=schedule_data.id,
                        status="conflict",
                        message="Conflict: Server version differs from client version.",
                        server_timestamp=datetime.now(timezone.utc).isoformat(),
                        conflict_detail={
                            "client_version": schedule_data.client_version,
                            "server_version": current["version"],
                            "server_data": server_data,
                            "resolution_advice": "Review server changes before reapplying local edit."
                        }
                    ))
                else:
                    new_version = current["version"] + 1
                    now_iso = datetime.now(timezone.utc).isoformat()
                    cursor.execute("""
                    UPDATE medication_schedules
                    SET medication_name = ?, dosage = ?, frequency = ?, times = ?, instructions = ?, version = ?, updated_at = ?
                    WHERE id = ?
                    """, (
                        schedule_data.medication_name,
                        schedule_data.dosage,
                        schedule_data.frequency,
                        json.dumps(schedule_data.times),
                        schedule_data.instructions,
                        new_version,
                        now_iso,
                        schedule_data.id
                    ))
                    conn.commit()
                    synced_count += 1
                    results.append(SyncOperationResult(
                        operation_id=item.operation_id,
                        entity_type="schedule_update",
                        entity_id=schedule_data.id,
                        status="synced",
                        message="Schedule updated safely with version bump.",
                        server_timestamp=now_iso,
                        data={
                            "id": schedule_data.id,
                            "version": new_version,
                            "updated_at": now_iso
                        }
                    ))

            else:
                failed_count += 1
                results.append(SyncOperationResult(
                    operation_id=item.operation_id,
                    entity_type=item.entity_type,
                    status="rejected",
                    message=f"Unsupported entity type: {item.entity_type}",
                    server_timestamp=datetime.now(timezone.utc).isoformat()
                ))

        except Exception as err:
            conn.rollback()
            failed_count += 1
            results.append(SyncOperationResult(
                operation_id=item.operation_id,
                entity_type=item.entity_type,
                status="failed",
                message=f"Sync error on item: {str(err)}",
                server_timestamp=datetime.now(timezone.utc).isoformat()
            ))

    conn.close()
    return BatchSyncResponse(
        synced_count=synced_count,
        replayed_count=replayed_count,
        conflict_count=conflict_count,
        failed_count=failed_count,
        results=results
    )

@app.get("/api/medications/schedule", response_model=List[MedicationSchedule])
def get_medication_schedules():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM medication_schedules ORDER BY medication_name ASC")
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        result.append(MedicationSchedule(
            id=r["id"],
            medication_name=r["medication_name"],
            dosage=r["dosage"],
            frequency=r["frequency"],
            times=json.loads(r["times"]),
            instructions=r["instructions"],
            version=r["version"],
            updated_at=r["updated_at"]
        ))
    return result

@app.post("/api/medications/schedule", response_model=MedicationSchedule, status_code=status.HTTP_201_CREATED)
def create_medication_schedule(schedule_in: MedicationScheduleCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    sched_id = schedule_in.id or f"sched_{uuid.uuid4().hex[:10]}"
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        cursor.execute("""
        INSERT INTO medication_schedules (id, medication_name, dosage, frequency, times, instructions, version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sched_id,
            schedule_in.medication_name,
            schedule_in.dosage,
            schedule_in.frequency,
            json.dumps(schedule_in.times),
            schedule_in.instructions or "",
            1,
            now_iso
        ))
        conn.commit()
        return MedicationSchedule(
            id=sched_id,
            medication_name=schedule_in.medication_name,
            dosage=schedule_in.dosage,
            frequency=schedule_in.frequency,
            times=schedule_in.times,
            instructions=schedule_in.instructions,
            version=1,
            updated_at=now_iso
        )
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create schedule: {str(e)}")
    finally:
        conn.close()

@app.delete("/api/medications/schedule/{schedule_id}")
def delete_medication_schedule(schedule_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id FROM medication_schedules WHERE id = ?", (schedule_id,))
    if not cursor.fetchone():
        conn.close()
        raise HTTPException(status_code=404, detail="Medication schedule not found")
    cursor.execute("DELETE FROM medication_schedules WHERE id = ?", (schedule_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted", "id": schedule_id}

@app.put("/api/medications/schedule/{schedule_id}", response_model=MedicationSchedule)
def update_medication_schedule(schedule_id: str, update: MedicationScheduleUpdate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM medication_schedules WHERE id = ?", (schedule_id,))
    current = cursor.fetchone()

    if not current:
        conn.close()
        raise HTTPException(status_code=404, detail="Medication schedule not found")

    # Conflict check: ensure client version matches server version
    if current["version"] != update.client_version:
        server_data = {
            "id": current["id"],
            "medication_name": current["medication_name"],
            "dosage": current["dosage"],
            "frequency": current["frequency"],
            "times": json.loads(current["times"]),
            "instructions": current["instructions"],
            "version": current["version"],
            "updated_at": current["updated_at"]
        }
        conn.close()
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "error": "version_conflict",
                "message": "Schedule was modified by another source or device.",
                "client_version": update.client_version,
                "server_version": current["version"],
                "server_data": server_data,
                "resolution_guidance": "Examine current server version and merge changes before saving."
            }
        )

    new_version = current["version"] + 1
    now_iso = datetime.now(timezone.utc).isoformat()

    cursor.execute("""
    UPDATE medication_schedules
    SET medication_name = ?, dosage = ?, frequency = ?, times = ?, instructions = ?, version = ?, updated_at = ?
    WHERE id = ?
    """, (
        update.medication_name,
        update.dosage,
        update.frequency,
        json.dumps(update.times),
        update.instructions,
        new_version,
        now_iso,
        schedule_id
    ))
    conn.commit()

    cursor.execute("SELECT * FROM medication_schedules WHERE id = ?", (schedule_id,))
    updated_row = cursor.fetchone()
    conn.close()

    return MedicationSchedule(
        id=updated_row["id"],
        medication_name=updated_row["medication_name"],
        dosage=updated_row["dosage"],
        frequency=updated_row["frequency"],
        times=json.loads(updated_row["times"]),
        instructions=updated_row["instructions"],
        version=updated_row["version"],
        updated_at=updated_row["updated_at"]
    )

@app.get("/api/history", response_model=HealthHistoryResponse)
def get_health_history():
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM symptoms ORDER BY logged_at DESC")
    symptoms = cursor.fetchall()

    cursor.execute("SELECT * FROM medication_events ORDER BY taken_at DESC")
    med_events = cursor.fetchall()

    cursor.execute("SELECT * FROM medication_schedules ORDER BY medication_name ASC")
    schedules = cursor.fetchall()

    conn.close()

    history: List[HealthHistoryItem] = []

    for s in symptoms:
        history.append(HealthHistoryItem(
            id=s["id"],
            type="symptom",
            title=f"Symptom: {s['symptom_name']}",
            subtitle=f"Severity: {s['severity']}/10 • Onset: {s['onset_time']}",
            timestamp=s["logged_at"],
            synced_at=s["synced_at"],
            details={
                "symptom_name": s["symptom_name"],
                "severity": s["severity"],
                "notes": s["notes"],
                "onset_time": s["onset_time"],
                "operation_id": s["operation_id"]
            }
        ))

    for m in med_events:
        history.append(HealthHistoryItem(
            id=m["id"],
            type="medication_event",
            title=f"Dose Log: {m['medication_name']} ({m['dosage']})",
            subtitle=f"Status: {m['status'].upper()}{' • ' + m['scheduled_time'] if m['scheduled_time'] else ''}",
            timestamp=m["taken_at"],
            synced_at=m["synced_at"],
            details={
                "medication_name": m["medication_name"],
                "dosage": m["dosage"],
                "status": m["status"],
                "notes": m["notes"],
                "operation_id": m["operation_id"]
            }
        ))

    # Sort history newest first
    history.sort(key=lambda x: x.timestamp, reverse=True)

    schedules_list = [
        MedicationSchedule(
            id=sch["id"],
            medication_name=sch["medication_name"],
            dosage=sch["dosage"],
            frequency=sch["frequency"],
            times=json.loads(sch["times"]),
            instructions=sch["instructions"],
            version=sch["version"],
            updated_at=sch["updated_at"]
        )
        for sch in schedules
    ]

    return HealthHistoryResponse(
        total_records=len(history),
        history=history,
        schedules=schedules_list,
        server_time=datetime.now(timezone.utc).isoformat()
    )
