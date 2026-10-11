from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime

class SymptomCreate(BaseModel):
    id: str = Field(..., description="Unique record identifier generated on client")
    operation_id: str = Field(..., description="Unique idempotency operation token")
    symptom_name: str = Field(..., min_length=1, max_length=100)
    severity: int = Field(..., ge=1, le=10, description="Severity score from 1 (mild) to 10 (emergency)")
    notes: Optional[str] = Field(None, max_length=1000)
    onset_time: str = Field(..., description="ISO 8601 timestamp of symptom onset")
    logged_at: str = Field(..., description="ISO 8601 timestamp when user recorded the symptom locally")

    @field_validator("symptom_name")
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("Symptom name cannot be empty")
        return clean

class MedicationEventCreate(BaseModel):
    id: str = Field(..., description="Unique record identifier generated on client")
    operation_id: str = Field(..., description="Unique idempotency operation token")
    medication_name: str = Field(..., min_length=1, max_length=100)
    dosage: str = Field(..., min_length=1, max_length=50)
    scheduled_time: Optional[str] = None
    taken_at: str = Field(..., description="ISO 8601 timestamp when medication was consumed or skipped")
    status: Literal["taken", "skipped"] = "taken"
    notes: Optional[str] = Field(None, max_length=500)

class MedicationSchedule(BaseModel):
    id: str
    medication_name: str
    dosage: str
    frequency: str
    times: List[str]
    instructions: Optional[str] = None
    version: int
    updated_at: str

class MedicationScheduleCreate(BaseModel):
    id: Optional[str] = None
    medication_name: str = Field(..., min_length=1)
    dosage: str = Field(..., min_length=1)
    frequency: str = Field(..., min_length=1)
    times: List[str]
    instructions: Optional[str] = None

class MedicationScheduleUpdate(BaseModel):
    id: str
    medication_name: str = Field(..., min_length=1)
    dosage: str = Field(..., min_length=1)
    frequency: str = Field(..., min_length=1)
    times: List[str]
    instructions: Optional[str] = None
    client_version: int = Field(..., ge=1, description="Version client was editing; checked against server version")

class BatchSyncItem(BaseModel):
    operation_id: str
    entity_type: Literal["symptom", "medication_event", "schedule_update"]
    payload: Dict[str, Any]

class BatchSyncRequest(BaseModel):
    operations: List[BatchSyncItem]

class SyncOperationResult(BaseModel):
    operation_id: str
    entity_type: str
    entity_id: Optional[str] = None
    status: Literal["synced", "idempotent_replay", "conflict", "rejected", "failed"]
    message: str
    server_timestamp: str
    data: Optional[Dict[str, Any]] = None
    conflict_detail: Optional[Dict[str, Any]] = None

class BatchSyncResponse(BaseModel):
    synced_count: int
    replayed_count: int
    conflict_count: int
    failed_count: int
    results: List[SyncOperationResult]

class HealthHistoryItem(BaseModel):
    id: str
    type: Literal["symptom", "medication_event"]
    title: str
    subtitle: str
    timestamp: str
    synced_at: str
    details: Dict[str, Any]

class HealthHistoryResponse(BaseModel):
    total_records: int
    history: List[HealthHistoryItem]
    schedules: List[MedicationSchedule]
    server_time: str
