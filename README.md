# MediTrack — Offline-First Healthcare Platform

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%2019%20+%20Vite-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![IndexedDB](https://img.shields.io/badge/Storage-Offline--First%20IndexedDB-F59E0B.svg)](#offline-first-storage)
[![SQLite](https://img.shields.io/badge/Database-SQLite%20(WAL%20Mode)-003B57.svg?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Tests](https://img.shields.io/badge/Tests-Pytest%20%2B%20Vitest-10B981.svg)](#running-tests)

> **Hackathon Prototype Notice**: Built for the **“The Unreliable Internet Connection”** hackathon challenge. Demonstrates resilient offline-first data retention, durable synchronization queuing, database idempotency, and conflict resolution. This is a prototype and not a certified medical device; no HIPAA/regulatory compliance or production-grade encryption is claimed.

---

## 1. Problem Statement

Modern healthcare and chronic disease management tools often fail when internet connectivity is intermittent, slow, or completely absent. When a patient in a rural clinic, an underground subway, an airplane, or an area with spotty cellular coverage attempts to record medication adherence or log severe symptoms:
- Traditional web apps display blocking error dialogs or spinning loading wheels.
- Patient entries are silently lost upon network failure or browser reload.
- Blind retries cause duplicated entries in health records (e.g. logging a double dose of medication).
- Overlapping offline edits overwrite critical regimen instructions without warning.

In healthcare tracking, **data loss and duplication are unacceptable risks**.

---

## 2. Proposed Solution

**MediTrack** is an offline-first healthcare tracking application designed specifically for volatile and disconnected network environments. 

### Core Capabilities:
1. **Immediate Local Persistence**: Every symptom entry and medication dose is written to client-side IndexedDB *before* network transmission is ever attempted.
2. **Durable Sync Queue**: A persistent background queue retains pending operations across page refreshes, tab closures, and device reboots.
3. **Database-Level Idempotency**: Unique `operation_id` tokens and SQLite constraints guarantee that duplicate or replayed HTTP requests never duplicate medical records.
4. **Resilient Synchronization**: Automatically detects network restoration and retries transient failures using bounded exponential backoff with jitter.
5. **Domain-Specific Consistency**:
   - Symptoms and medication intake events are append-only time-series events (never merged or overwritten).
   - Medication regimens and schedules use versioned optimistic concurrency checks (returns HTTP 409 Conflict if stale edits occur).
6. **Hackathon Demonstration Mode**: A prominent **Simulate Offline** switch enables live end-to-end testing of offline data capture, browser reloads, auto-recovery, and duplicate replays.

---

## 3. Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                                  BROWSER CLIENT                                   |
|                                                                                   |
|  [ User Interface (React 19 + Lucide Icons) ]                                    |
|         |                                  ^                                      |
|         v (1. Instant Save)                | (4. Reactive Status Updates)        |
|  +-----------------------------------------------------------------------------+  |
|  |                            IndexedDB Local Store                            |  |
|  |   - symptoms (local records)           - medication_schedules (cached)      |  |
|  |   - medication_events (local records)  - sync_queue (durable pending ops)   |  |
|  +-----------------------------------------------------------------------------+  |
|         |                                  ^                                      |
|         v (Read Pending Queue)             | (Ack: Evict Queue & Mark Synced)     |
|  +-----------------------------------------------------------------------------+  |
|  |                       Background Synchronization Engine                     |  |
|  |   - Online/Offline Event Listeners      - Concurrency Mutex Lock            |  |
|  |   - Bounded Exponential Backoff Jitter  - Idempotency Op-ID Replay Guard    |  |
|  +-----------------------------------------------------------------------------+  |
+----------------------------------------|------------------------------------------+
                                         | HTTP / JSON (operation_id in body/header)
                                         v
+-----------------------------------------------------------------------------------+
|                              FASTAPI BACKEND SERVICE                              |
|                                                                                   |
|  [ CORS & Validation Layer (Pydantic Models) ]                                    |
|  [ Idempotency Middleware / Op-ID Check ]                                         |
|         |                                                                         |
|         +-----------------------+------------------------+                        |
|         | New Operation         | Existing Op-ID         | Stale Version          |
|         v                       v                        v                        |
|  Insert DB & Cache Ack     Return Cached Ack (200)    Return 409 Conflict         |
|  HTTP 201 Created          (Zero Duplication)         (Resolution Guidance)       |
|         |                                                                         |
|         v                                                                         |
|  +-----------------------------------------------------------------------------+  |
|  |                           SQLite Database (WAL Mode)                        |  |
|  |   - operations (operation_id PK, response_payload cache)                   |  |
|  |   - symptoms (id PK, operation_id UNIQUE, severity, onset_time)             |  |
|  |   - medication_events (id PK, operation_id UNIQUE, taken_at)                |  |
|  |   - medication_schedules (id PK, version INT, times, instructions)         |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 4. Synchronization Strategy & State Machine

Every healthcare record undergoes a deterministic lifecycle:

```
+---------------+      Write to IDB      +---------------+
|  Form Submit  | ---------------------> | Saved locally |
+---------------+                        +---------------+
                                                 |
                                                 v
                                         +---------------+
                                         | Pending sync  |
                                         +---------------+
                                                 |
                                Network OK       |   Offline / Error
                            +--------------------+---------------------+
                            |                                          |
                            v                                          v
                     +---------------+                         +---------------+
                     |    Syncing    |                         |  Exponential  |
                     +---------------+                         |    Backoff    |
                            |                                  +---------------+
            +---------------+---------------+                          |
            |                               |                          v
      Server Confirms                 409 Conflict             Retry when Timer
        (200 / 201)                          |                 or Online Event
            v                                v                         |
     +---------------+               +---------------+                 |
     |    Synced     |               | Sync Conflict | <---------------+
     +---------------+               +---------------+
```

### Supported Statuses:
- **`Saved locally`**: Immediately saved to client IndexedDB. Safe against crashes.
- **`Pending sync`**: Enqueued in durable `sync_queue` awaiting network confirmation.
- **`Syncing`**: Request currently in-flight; protected by client concurrency mutex.
- **`Synced`**: Confirmed by server database response. Queue item safely evicted.
- **`Sync failed`**: Unrecoverable schema validation error (HTTP 422).
- **`Conflict detected`**: Regimen updated concurrently (HTTP 409). Interactive resolution required.

---

## 5. Consistency Guarantees & Conflict Handling

| Domain Entity | Consistency Model | Duplicate Prevention | Conflict Strategy |
| :--- | :--- | :--- | :--- |
| **Symptom Log** | Append-Only Event Stream | Client UUID + Unique `operation_id` constraint | Separate occurrences are independent events; duplicates replayed idempotently. |
| **Medication Dose Taken** | Append-Only Intake Event | Unique `operation_id` constraint in SQLite | Dose logging is idempotent; network drops cannot log duplicate pill ingestions. |
| **Medication Regimen** | Versioned Optimistic Concurrency | Integer version tag (`version: N`) | Stale updates rejected with **HTTP 409 Conflict**; provides interactive side-by-side diff. |

---

## 6. Trade-offs & Known Limitations

1. **Browser Quota & IndexedDB Lifetime**: While IndexedDB provides gigabytes of local storage, browsers in incognito mode or under extreme storage pressure may evict storage.
2. **Push Notifications**: Browser notifications require active browser sessions and explicit user permission. A scheduled notification is an alert, not clinical verification that medicine was consumed.
3. **Multi-Tab Concurrency**: While IndexedDB transactions are atomic, concurrent sync engines in multiple open tabs are harmonized via atomic queue retrieval and operation-level in-flight locks.
4. **Security Scope**: Designed as an offline-first architectural demonstration. Production deployment requires end-to-end encrypted storage, OAuth2/OIDC authentication, and HIPAA-compliant audit logging.

---

## 7. Prerequisites

- **Node.js**: v18.0.0 or higher (Tested on Node v24.15.0)
- **npm**: v9.0.0 or higher
- **Python**: 3.10 or higher
- **pip**: Current pip package manager

---

## 8. Installation Commands

### 1. Clone & Enter Directory
```bash
git clone https://github.com/motishamhajira-coder/Grevix_meditrack.git
cd Grevix_meditrack
```

### 2. Backend Setup
```bash
cd backend
python -m venv venv

# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux / macOS:
# source venv/bin/activate

pip install -r requirements.txt
cd ..
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cd ..
```

---

## 9. Commands to Run Frontend and Backend

### Terminal 1: Run Backend (FastAPI on Port 8000)
```bash
cd backend
.\venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
*Backend API Docs will be available at: http://127.0.0.1:8000/docs*

### Terminal 2: Run Frontend (Vite on Port 5173)
```bash
cd frontend
npm run dev
```
*Frontend Web Application will be available at: http://localhost:5173*

---

## 10. API Endpoints

| Method | Endpoint | Description | Idempotency |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status check | Read-only |
| `GET` | `/api/sync/status` | Current counts of symptoms, doses, operations | Read-only |
| `POST` | `/api/sync/symptom` | Ingests symptom entry | **Idempotent** (replays cached ack) |
| `POST` | `/api/sync/medication-event`| Ingests medication dose taken event | **Idempotent** (replays cached ack) |
| `POST` | `/api/sync/batch` | Batch synchronizes multiple operations | **Idempotent** per operation |
| `GET` | `/api/history` | Chronological unified health history | Read-only |
| `GET` | `/api/medications/schedule`| Active medication schedules | Read-only |
| `PUT` | `/api/medications/schedule/{id}` | Updates schedule with version conflict check | Version-guarded (409 on mismatch) |

---

## 11. Running Tests

### Backend Automated Test Suite (Pytest)
Validates record creation, idempotency replay, validation rejection (422), database persistence across connections, batch synchronization, and 409 conflict detection:
```bash
cd backend
.\venv\Scripts\pytest -v tests/test_api.py
```
*Result: 8 passed in ~2.2s*

### Frontend Unit Test Suite (Vitest)
Validates bounded exponential backoff calculation with jitter, simulated offline mode toggling, UUID generation, subscriber event notifications, and status definitions:
```bash
cd frontend
npm test
```
*Result: 5 passed in ~600ms*

### Production Frontend Build Validation
```bash
cd frontend
npm run build
```
*Result: Successfully transforms modules and compiles production bundle to `dist/`.*

---

## 12. Step-by-Step Hackathon Demonstration Script

The application includes an integrated **Hackathon Demonstration Console** directly on the dashboard. Follow these 8 steps to demonstrate all challenge requirements:

### Step 1: Record a Symptom While Online
1. Open `http://localhost:5173`.
2. Notice the green **Online** status badge in the header.
3. In the **Log Symptom** form, type `Mild Headache`, choose severity `3/10`, and click **Save Symptom (Offline-Safe)**.
4. **Verification**: 
   - Record immediately appears with a green **Synced** badge in the **Health History Timeline**.
   - Server SQLite database receives the record.

### Step 2: Disconnect the Network
1. Click the **Simulate Offline** toggle in the header (or click "Sever Network" in the demo console).
2. The UI displays an amber **Simulated Offline** badge and an informative alert banner: *"Network Disconnected: All symptoms and doses are safely persisted in browser IndexedDB."*
3. Network sync requests are strictly blocked.

### Step 3: Record Health Data While Disconnected
1. On the **Medication Regimen** card for **Amoxicillin**, click **Log Dose Taken**.
2. In the **Log Symptom** form, type `High Fever`, set severity `8/10`, and click **Save Symptom**.
3. **Verification**: 
   - Both records appear immediately in the timeline with amber **Pending sync** badges.
   - Header shows **2 Pending Syncs**.
   - Neither record was lost or blocked.

### Step 4: Refresh the Page While Offline (Zero Data Loss)
1. Press `F5` or click your browser's Refresh button while keeping offline mode active.
2. **Verification**: 
   - The page reloads cleanly.
   - Both offline records (**Amoxicillin Dose** and **High Fever**) are instantly restored from local IndexedDB.
   - The pending sync queue count remains exactly **2**.

### Step 5: Restore Connectivity
1. Toggle **Simulate Offline** back to **OFF** (or click "Restore Network").
2. The header switches to green **Online**.

### Step 6: Verify Automatic Synchronization
1. Observe the background sync engine automatically wake up.
2. The status temporarily changes to **Syncing** (blue animated spinner).
3. Within milliseconds, both pending items update to **Synced** (green checkmark).
4. The pending count drops to **0**.
5. Server status pill reflects the newly persisted records.

### Step 7: Test Duplicate Replay (Idempotency Proof)
1. On any synced record in the Health Timeline, click the **Test Replay** button.
2. The client re-sends the exact same `operation_id` to the server endpoint.
3. **Verification**:
   - The server inspects the `operations` table, recognizes the duplicate `operation_id`, and returns HTTP 200 with status `idempotent_replay`.
   - Toast notification appears: *"Idempotency Success! Server recognized op ID and returned cached ack without duplicating."*
   - Verify the server record count does NOT increment.

### Step 8: Verify Schedule Version Conflict Handling
1. Click **Edit** on a medication regimen (e.g. Amoxicillin).
2. Modify the dosage and click **Save Regimen**.
3. The server updates the schedule and increments its version from `v1` to `v2`.
4. If a client attempts to submit an edit using a stale version (`v1`), the server returns **HTTP 409 Conflict**.
5. The **Concurrency Conflict Modal** appears with a side-by-side comparison, preventing silent overwrites and empowering the user to choose the authoritative record.

---

## 13. File Structure

```
Grevix_meditrack/
├── .gitignore                      # Prevents committing venv, node_modules, secrets, .db
├── README.md                       # Comprehensive project documentation & demo guide
│
├── backend/
│   ├── requirements.txt            # FastAPI, Uvicorn, Pydantic, Pytest, HTTPX
│   ├── pytest.ini                  # Pytest pythonpath configuration
│   ├── app/
│   │   ├── __init__.py
│   │   ├── database.py             # SQLite WAL connection, idempotency table, schemas
│   │   ├── models.py               # Pydantic request models & sync batch schemas
│   │   └── main.py                 # FastAPI endpoints, CORS, idempotency replay handler
│   └── tests/
│       └── test_api.py             # 8 automated backend test cases
│
└── frontend/
    ├── package.json                # React 19, Vite, Lucide-React, Vitest
    ├── vite.config.js              # Vite bundler configuration
    ├── index.html                  # Responsive HTML5 template with Google Fonts
    └── src/
        ├── index.css               # Modern healthcare design system & glassmorphism
        ├── main.jsx                # Application entrypoint
        ├── App.jsx                 # Main dashboard orchestrator
        ├── services/
        │   ├── db.js               # IndexedDB offline store & durable sync queue
        │   └── syncEngine.js       # Background sync, exponential backoff, locks
        ├── components/
        │   ├── Header.jsx          # Status badges, Simulate Offline switch, manual sync
        │   ├── OverviewStats.jsx   # Regimens, symptoms, doses, queue count metrics
        │   ├── SymptomForm.jsx     # Symptom logger with severity slider & quick tags
        │   ├── MedicationScheduleList.jsx # Offline regimens, dose logger, reminders
        │   ├── HealthTimeline.jsx  # History timeline, dynamic sync badges, replay test
        │   ├── DemoWalkthrough.jsx # 8-step interactive hackathon demo console
        │   └── ConflictModal.jsx   # Regimen editor and 409 conflict resolver
        └── tests/
            └── sync.test.js        # Vitest unit tests for backoff, status, and UUIDs
```

---

## 14. License

Distributed under the MIT License for hackathon evaluation and demonstration.