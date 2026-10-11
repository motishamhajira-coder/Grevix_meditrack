/**
 * MediTrack IndexedDB Local Storage Layer
 * Persistent offline storage for Symptoms, Medication Events, Schedules, and Durable Sync Queue.
 */

const DB_NAME = 'MediTrack_Offline_DB';
const DB_VERSION = 1;

export const SYNC_STATUS = {
  SAVED_LOCALLY: 'Saved locally',
  PENDING_SYNC: 'Pending sync',
  SYNCING: 'Syncing',
  SYNCED: 'Synced',
  SYNC_FAILED: 'Sync failed',
  CONFLICT: 'Conflict detected'
};

const DEFAULT_SCHEDULES = [
  {
    id: 'sched_amoxicillin',
    medication_name: 'Amoxicillin',
    dosage: '500mg',
    frequency: 'Every 8 hours',
    times: ['08:00', '14:00', '20:00'],
    instructions: 'Take with food or water. Complete full 7-day course.',
    version: 1,
    updated_at: new Date().toISOString()
  },
  {
    id: 'sched_metformin',
    medication_name: 'Metformin',
    dosage: '850mg',
    frequency: 'Twice daily',
    times: ['09:00', '19:00'],
    instructions: 'Take with morning and evening meals.',
    version: 1,
    updated_at: new Date().toISOString()
  },
  {
    id: 'sched_lisinopril',
    medication_name: 'Lisinopril',
    dosage: '10mg',
    frequency: 'Once daily',
    times: ['08:30'],
    instructions: 'Take in the morning for blood pressure maintenance.',
    version: 1,
    updated_at: new Date().toISOString()
  }
];

let dbInstance = null;

export function openDB() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }

  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Symptoms Store
      if (!db.objectStoreNames.contains('symptoms')) {
        const symptomsStore = db.createObjectStore('symptoms', { keyPath: 'id' });
        symptomsStore.createIndex('by_operation_id', 'operation_id', { unique: true });
        symptomsStore.createIndex('by_logged_at', 'logged_at', { unique: false });
        symptomsStore.createIndex('by_sync_status', 'sync_status', { unique: false });
      }

      // 2. Medication Events Store
      if (!db.objectStoreNames.contains('medication_events')) {
        const medStore = db.createObjectStore('medication_events', { keyPath: 'id' });
        medStore.createIndex('by_operation_id', 'operation_id', { unique: true });
        medStore.createIndex('by_taken_at', 'taken_at', { unique: false });
        medStore.createIndex('by_sync_status', 'sync_status', { unique: false });
      }

      // 3. Medication Schedules Store
      if (!db.objectStoreNames.contains('medication_schedules')) {
        const scheduleStore = db.createObjectStore('medication_schedules', { keyPath: 'id' });
        scheduleStore.createIndex('by_medication_name', 'medication_name', { unique: false });
      }

      // 4. Durable Sync Queue Store
      if (!db.objectStoreNames.contains('sync_queue')) {
        const queueStore = db.createObjectStore('sync_queue', { keyPath: 'operation_id' });
        queueStore.createIndex('by_status', 'status', { unique: false });
        queueStore.createIndex('by_created_at', 'created_at', { unique: false });
        queueStore.createIndex('by_next_retry', 'next_retry_at', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      // Pre-seed schedules if needed
      seedSchedulesIfEmpty(dbInstance).then(() => {
        resolve(dbInstance);
      }).catch(() => {
        resolve(dbInstance);
      });
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error:', event.target.error);
      reject(event.target.error);
    };
  });
}

function seedSchedulesIfEmpty(db) {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction('medication_schedules', 'readwrite');
      const store = tx.objectStore('medication_schedules');
      const countReq = store.count();

      countReq.onsuccess = () => {
        if (countReq.result === 0) {
          DEFAULT_SCHEDULES.forEach(s => store.put(s));
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch (e) {
      resolve();
    }
  });
}

// Helper to generate UUID
export function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Persist Symptom locally and atomically append to durable sync queue
 */
export async function saveSymptomLocally(symptomInput) {
  const db = await openDB();
  const id = symptomInput.id || generateUUID();
  const operation_id = symptomInput.operation_id || generateUUID();
  const now = new Date().toISOString();

  const record = {
    id,
    operation_id,
    symptom_name: symptomInput.symptom_name.trim(),
    severity: Number(symptomInput.severity),
    notes: symptomInput.notes ? symptomInput.notes.trim() : '',
    onset_time: symptomInput.onset_time || now,
    logged_at: symptomInput.logged_at || now,
    sync_status: SYNC_STATUS.PENDING_SYNC,
    synced_at: null,
    error_message: null
  };

  const queueItem = {
    operation_id,
    entity_type: 'symptom',
    entity_id: id,
    payload: {
      id: record.id,
      symptom_name: record.symptom_name,
      severity: record.severity,
      notes: record.notes,
      onset_time: record.onset_time,
      logged_at: record.logged_at
    },
    status: 'pending',
    attempts: 0,
    next_retry_at: 0,
    created_at: now,
    last_error: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['symptoms', 'sync_queue'], 'readwrite');
    tx.objectStore('symptoms').put(record);
    tx.objectStore('sync_queue').put(queueItem);

    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => {
      console.error('Error saving symptom to IndexedDB:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Persist Medication Event locally and atomically append to sync queue
 */
export async function saveMedicationEventLocally(eventInput) {
  const db = await openDB();
  const id = eventInput.id || generateUUID();
  const operation_id = eventInput.operation_id || generateUUID();
  const now = new Date().toISOString();

  const record = {
    id,
    operation_id,
    medication_name: eventInput.medication_name.trim(),
    dosage: eventInput.dosage.trim(),
    scheduled_time: eventInput.scheduled_time || null,
    taken_at: eventInput.taken_at || now,
    status: eventInput.status || 'taken',
    notes: eventInput.notes ? eventInput.notes.trim() : '',
    sync_status: SYNC_STATUS.PENDING_SYNC,
    synced_at: null,
    error_message: null
  };

  const queueItem = {
    operation_id,
    entity_type: 'medication_event',
    entity_id: id,
    payload: {
      id: record.id,
      medication_name: record.medication_name,
      dosage: record.dosage,
      scheduled_time: record.scheduled_time,
      taken_at: record.taken_at,
      status: record.status,
      notes: record.notes
    },
    status: 'pending',
    attempts: 0,
    next_retry_at: 0,
    created_at: now,
    last_error: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['medication_events', 'sync_queue'], 'readwrite');
    tx.objectStore('medication_events').put(record);
    tx.objectStore('sync_queue').put(queueItem);

    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => {
      console.error('Error saving medication event to IndexedDB:', e.target.error);
      reject(e.target.error);
    };
  });
}

/**
 * Queue Schedule update with version check
 */
export async function queueScheduleUpdate(scheduleUpdate) {
  const db = await openDB();
  const operation_id = generateUUID();
  const now = new Date().toISOString();

  const queueItem = {
    operation_id,
    entity_type: 'schedule_update',
    entity_id: scheduleUpdate.id,
    payload: {
      id: scheduleUpdate.id,
      medication_name: scheduleUpdate.medication_name,
      dosage: scheduleUpdate.dosage,
      frequency: scheduleUpdate.frequency,
      times: scheduleUpdate.times,
      instructions: scheduleUpdate.instructions || '',
      client_version: scheduleUpdate.version
    },
    status: 'pending',
    attempts: 0,
    next_retry_at: 0,
    created_at: now,
    last_error: null
  };

  // Locally apply optimistic update
  const updatedSchedule = {
    ...scheduleUpdate,
    updated_at: now
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['medication_schedules', 'sync_queue'], 'readwrite');
    tx.objectStore('medication_schedules').put(updatedSchedule);
    tx.objectStore('sync_queue').put(queueItem);

    tx.oncomplete = () => resolve({ schedule: updatedSchedule, operation_id });
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Create a new medication schedule locally and enqueue sync operation
 */
export async function createScheduleLocally(scheduleInput) {
  const db = await openDB();
  const id = scheduleInput.id || `sched_${generateUUID().slice(0, 8)}`;
  const operation_id = generateUUID();
  const now = new Date().toISOString();

  const record = {
    id,
    medication_name: scheduleInput.medication_name.trim(),
    dosage: scheduleInput.dosage.trim(),
    frequency: scheduleInput.frequency.trim(),
    times: scheduleInput.times || ['08:00'],
    instructions: scheduleInput.instructions ? scheduleInput.instructions.trim() : '',
    version: 1,
    updated_at: now
  };

  const queueItem = {
    operation_id,
    entity_type: 'schedule_create',
    entity_id: id,
    payload: {
      id: record.id,
      medication_name: record.medication_name,
      dosage: record.dosage,
      frequency: record.frequency,
      times: record.times,
      instructions: record.instructions
    },
    status: 'pending',
    attempts: 0,
    next_retry_at: 0,
    created_at: now,
    last_error: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['medication_schedules', 'sync_queue'], 'readwrite');
    tx.objectStore('medication_schedules').put(record);
    tx.objectStore('sync_queue').put(queueItem);

    tx.oncomplete = () => resolve(record);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Delete a medication schedule locally and queue server deletion
 */
export async function deleteScheduleLocally(scheduleId) {
  const db = await openDB();
  const operation_id = generateUUID();
  const now = new Date().toISOString();

  const queueItem = {
    operation_id,
    entity_type: 'schedule_delete',
    entity_id: scheduleId,
    payload: { id: scheduleId },
    status: 'pending',
    attempts: 0,
    next_retry_at: 0,
    created_at: now,
    last_error: null
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['medication_schedules', 'sync_queue'], 'readwrite');
    tx.objectStore('medication_schedules').delete(scheduleId);
    tx.objectStore('sync_queue').put(queueItem);

    tx.oncomplete = () => resolve(scheduleId);
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Remove a local symptom record
 */
export async function deleteSymptomLocally(symptomId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('symptoms', 'readwrite');
      tx.objectStore('symptoms').delete(symptomId);
      tx.oncomplete = () => resolve(symptomId);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    return symptomId;
  }
}

/**
 * Remove a local medication dose event
 */
export async function deleteMedicationEventLocally(eventId) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('medication_events', 'readwrite');
      tx.objectStore('medication_events').delete(eventId);
      tx.oncomplete = () => resolve(eventId);
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    return eventId;
  }
}

/**
 * Force immediate retry of a queue item
 */
export async function retryQueueItem(operationId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      const store = tx.objectStore('sync_queue');
      const req = store.get(operationId);
      req.onsuccess = () => {
        if (req.result) {
          req.result.status = 'pending';
          req.result.next_retry_at = 0;
          req.result.last_error = null;
          store.put(req.result);
        }
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    return;
  }
}

/**
 * Remove an item directly from the sync queue
 */
export async function clearQueueItem(operationId) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('sync_queue', 'readwrite');
      tx.objectStore('sync_queue').delete(operationId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    return;
  }
}

/**
 * Fetch all local symptoms
 */
export async function getAllSymptoms() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('symptoms', 'readonly');
      const store = tx.objectStore('symptoms');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result || [];
        records.sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at));
        resolve(records);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    return [];
  }
}

/**
 * Fetch all local medication events
 */
export async function getAllMedicationEvents() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('medication_events', 'readonly');
      const store = tx.objectStore('medication_events');
      const request = store.getAll();
      request.onsuccess = () => {
        const records = request.result || [];
        records.sort((a, b) => new Date(b.taken_at) - new Date(a.taken_at));
        resolve(records);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    return [];
  }
}

/**
 * Fetch all local medication schedules
 */
export async function getAllSchedules() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('medication_schedules', 'readonly');
      const store = tx.objectStore('medication_schedules');
      const request = store.getAll();
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    return DEFAULT_SCHEDULES;
  }
}

/**
 * Replace local schedules with authoritative schedules fetched from server
 */
export async function syncServerSchedules(schedules) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('medication_schedules', 'readwrite');
      const store = tx.objectStore('medication_schedules');
      schedules.forEach(s => store.put(s));
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    return;
  }
}

/**
 * Get all durable queue items
 */
export async function getPendingQueue() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sync_queue', 'readonly');
      const store = tx.objectStore('sync_queue');
      const request = store.getAll();
      request.onsuccess = () => {
        const all = request.result || [];
        resolve(all);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (e) {
    return [];
  }
}

/**
 * Mark queue item as actively syncing
 */
export async function markQueueItemSyncing(operation_id, entity_type, entity_id) {
  const db = await openDB();
  return new Promise((resolve) => {
    const txStores = ['sync_queue'];
    if (entity_type === 'symptom') txStores.push('symptoms');
    if (entity_type === 'medication_event') txStores.push('medication_events');

    const tx = db.transaction(txStores, 'readwrite');
    const queueStore = tx.objectStore('sync_queue');
    const req = queueStore.get(operation_id);

    req.onsuccess = () => {
      if (req.result) {
        req.result.status = 'syncing';
        queueStore.put(req.result);
      }
    };

    if (entity_type === 'symptom') {
      const symStore = tx.objectStore('symptoms');
      const sReq = symStore.get(entity_id);
      sReq.onsuccess = () => {
        if (sReq.result) {
          sReq.result.sync_status = SYNC_STATUS.SYNCING;
          symStore.put(sReq.result);
        }
      };
    } else if (entity_type === 'medication_event') {
      const medStore = tx.objectStore('medication_events');
      const mReq = medStore.get(entity_id);
      mReq.onsuccess = () => {
        if (mReq.result) {
          mReq.result.sync_status = SYNC_STATUS.SYNCING;
          medStore.put(mReq.result);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Remove queue item on confirmed server response and update record status to 'Synced'
 */
export async function markQueueItemSuccess(operation_id, entity_type, entity_id, syncedAt) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txStores = ['sync_queue'];
    if (entity_type === 'symptom') txStores.push('symptoms');
    if (entity_type === 'medication_event') txStores.push('medication_events');
    if (entity_type === 'schedule_update') txStores.push('medication_schedules');

    const tx = db.transaction(txStores, 'readwrite');
    tx.objectStore('sync_queue').delete(operation_id);

    if (entity_type === 'symptom' && entity_id) {
      const sStore = tx.objectStore('symptoms');
      const req = sStore.get(entity_id);
      req.onsuccess = () => {
        if (req.result) {
          req.result.sync_status = SYNC_STATUS.SYNCED;
          req.result.synced_at = syncedAt || new Date().toISOString();
          req.result.error_message = null;
          sStore.put(req.result);
        }
      };
    } else if (entity_type === 'medication_event' && entity_id) {
      const mStore = tx.objectStore('medication_events');
      const req = mStore.get(entity_id);
      req.onsuccess = () => {
        if (req.result) {
          req.result.sync_status = SYNC_STATUS.SYNCED;
          req.result.synced_at = syncedAt || new Date().toISOString();
          req.result.error_message = null;
          mStore.put(req.result);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Handle retryable failure with exponential backoff
 */
export async function markQueueItemRetryableError(operation_id, entity_type, entity_id, errorMsg, delayMs) {
  const db = await openDB();
  return new Promise((resolve) => {
    const txStores = ['sync_queue'];
    if (entity_type === 'symptom') txStores.push('symptoms');
    if (entity_type === 'medication_event') txStores.push('medication_events');

    const tx = db.transaction(txStores, 'readwrite');
    const queueStore = tx.objectStore('sync_queue');
    const req = queueStore.get(operation_id);

    req.onsuccess = () => {
      if (req.result) {
        req.result.status = 'pending';
        req.result.attempts = (req.result.attempts || 0) + 1;
        req.result.next_retry_at = Date.now() + delayMs;
        req.result.last_error = errorMsg;
        queueStore.put(req.result);
      }
    };

    if (entity_type === 'symptom' && entity_id) {
      const sStore = tx.objectStore('symptoms');
      const sReq = sStore.get(entity_id);
      sReq.onsuccess = () => {
        if (sReq.result) {
          sReq.result.sync_status = SYNC_STATUS.PENDING_SYNC;
          sReq.result.error_message = errorMsg;
          sStore.put(sReq.result);
        }
      };
    } else if (entity_type === 'medication_event' && entity_id) {
      const mStore = tx.objectStore('medication_events');
      const mReq = mStore.get(entity_id);
      mReq.onsuccess = () => {
        if (mReq.result) {
          mReq.result.sync_status = SYNC_STATUS.PENDING_SYNC;
          mReq.result.error_message = errorMsg;
          mStore.put(mReq.result);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Handle conflict (e.g. Schedule version conflict)
 */
export async function markQueueItemConflict(operation_id, entity_type, entity_id, conflictDetail) {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction('sync_queue', 'readwrite');
    const queueStore = tx.objectStore('sync_queue');
    const req = queueStore.get(operation_id);

    req.onsuccess = () => {
      if (req.result) {
        req.result.status = 'conflict';
        req.result.conflict_data = conflictDetail;
        req.result.last_error = conflictDetail.message || 'Conflict detected';
        queueStore.put(req.result);
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/**
 * Handle non-retryable / permanent validation rejection
 */
export async function markQueueItemPermanentFailure(operation_id, entity_type, entity_id, errorMsg) {
  const db = await openDB();
  return new Promise((resolve) => {
    const txStores = ['sync_queue'];
    if (entity_type === 'symptom') txStores.push('symptoms');
    if (entity_type === 'medication_event') txStores.push('medication_events');

    const tx = db.transaction(txStores, 'readwrite');
    const queueStore = tx.objectStore('sync_queue');
    const req = queueStore.get(operation_id);

    req.onsuccess = () => {
      if (req.result) {
        req.result.status = 'failed';
        req.result.last_error = errorMsg;
        queueStore.put(req.result);
      }
    };

    if (entity_type === 'symptom' && entity_id) {
      const sStore = tx.objectStore('symptoms');
      const sReq = sStore.get(entity_id);
      sReq.onsuccess = () => {
        if (sReq.result) {
          sReq.result.sync_status = SYNC_STATUS.SYNC_FAILED;
          sReq.result.error_message = errorMsg;
          sStore.put(sReq.result);
        }
      };
    } else if (entity_type === 'medication_event' && entity_id) {
      const mStore = tx.objectStore('medication_events');
      const mReq = mStore.get(entity_id);
      mReq.onsuccess = () => {
        if (mReq.result) {
          mReq.result.sync_status = SYNC_STATUS.SYNC_FAILED;
          mReq.result.error_message = errorMsg;
          mStore.put(mReq.result);
        }
      };
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}
