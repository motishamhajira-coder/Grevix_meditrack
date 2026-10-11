/**
 * MediTrack Synchronization Engine
 * Manages offline/online state detection, durable queue flushing,
 * bounded exponential backoff retries, concurrency locks, and idempotency guarantees.
 */

import {
  getPendingQueue,
  markQueueItemSyncing,
  markQueueItemSuccess,
  markQueueItemRetryableError,
  markQueueItemPermanentFailure,
  markQueueItemConflict,
  getAllSymptoms,
  getAllMedicationEvents,
  getAllSchedules,
  syncServerSchedules
} from './db';

const API_BASE_URL = 'http://127.0.0.1:8000';

class SyncEngine {
  constructor() {
    this.isSimulatedOffline = false;
    this.isOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
      ? navigator.onLine
      : true;
    this.isSyncing = false;
    this.inFlightOperations = new Set();
    this.subscribers = new Set();
    this.heartbeatInterval = null;
    this.lastSyncTime = null;
    this.lastSyncError = null;

    this.initNetworkListeners();
    this.startHeartbeat();
  }

  initNetworkListeners() {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifySubscribers({ event: 'network_status_change', online: this.effectiveOnlineStatus() });
      if (this.effectiveOnlineStatus()) {
        this.syncQueue();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifySubscribers({ event: 'network_status_change', online: false });
    });
  }

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    // Periodically process queue for any items whose exponential backoff expired
    this.heartbeatInterval = setInterval(() => {
      if (this.effectiveOnlineStatus() && !this.isSyncing) {
        this.syncQueue();
      }
    }, 8000);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }

  setSimulatedOffline(simulated) {
    this.isSimulatedOffline = !!simulated;
    this.notifySubscribers({
      event: 'simulated_offline_change',
      simulated: this.isSimulatedOffline,
      online: this.effectiveOnlineStatus()
    });

    if (this.effectiveOnlineStatus()) {
      this.syncQueue();
    }
  }

  effectiveOnlineStatus() {
    return Boolean(this.isOnline && !this.isSimulatedOffline);
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notifySubscribers(data) {
    this.subscribers.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error('Sync subscriber callback error:', err);
      }
    });
  }

  calculateBackoffDelay(attempts) {
    // Bounded exponential backoff: 1.5s, 3s, 6s, 12s, up to 30s + small jitter
    const base = 1500;
    const factor = Math.min(Math.pow(2, attempts), 20);
    const jitter = Math.floor(Math.random() * 500);
    return Math.min(base * factor + jitter, 30000);
  }

  async syncQueue() {
    if (!this.effectiveOnlineStatus()) {
      return { success: false, reason: 'offline' };
    }

    if (this.isSyncing) {
      return { success: false, reason: 'already_syncing' };
    }

    this.isSyncing = true;
    this.notifySubscribers({ event: 'sync_started', inFlightCount: this.inFlightOperations.size });

    try {
      const queueItems = await getPendingQueue();
      const now = Date.now();

      // Filter eligible items: not in-flight, not in conflict, and retry time has passed
      const eligibleItems = queueItems.filter(item => {
        if (this.inFlightOperations.has(item.operation_id)) return false;
        if (item.status === 'conflict') return false; // conflicts require user review
        if (item.next_retry_at && item.next_retry_at > now) return false;
        return true;
      });

      if (eligibleItems.length === 0) {
        this.isSyncing = false;
        this.notifySubscribers({ event: 'sync_idle' });
        return { success: true, processed: 0 };
      }

      for (const item of eligibleItems) {
        // Double-check if offline toggled while syncing
        if (!this.effectiveOnlineStatus()) {
          break;
        }

        this.inFlightOperations.add(item.operation_id);
        await markQueueItemSyncing(item.operation_id, item.entity_type, item.entity_id);
        this.notifySubscribers({ event: 'item_syncing', item });

        try {
          await this.processSingleOperation(item);
        } catch (itemError) {
          console.warn(`Sync failed for operation ${item.operation_id}:`, itemError);
        } finally {
          this.inFlightOperations.delete(item.operation_id);
        }
      }

      this.lastSyncTime = new Date().toISOString();
      this.lastSyncError = null;

      // Also refresh schedules from server when online to maintain sync
      await this.refreshServerSchedules();

      this.notifySubscribers({ event: 'sync_completed', timestamp: this.lastSyncTime });
      return { success: true };
    } catch (globalError) {
      console.error('Fatal sync error:', globalError);
      this.lastSyncError = globalError.message;
      this.notifySubscribers({ event: 'sync_failed', error: globalError.message });
      return { success: false, error: globalError.message };
    } finally {
      this.isSyncing = false;
    }
  }

  async processSingleOperation(item) {
    const { operation_id, entity_type, entity_id, payload, attempts } = item;
    let url = '';

    let method = 'POST';
    if (entity_type === 'symptom') {
      url = `${API_BASE_URL}/api/sync/symptom`;
    } else if (entity_type === 'medication_event') {
      url = `${API_BASE_URL}/api/sync/medication-event`;
    } else if (entity_type === 'schedule_update') {
      url = `${API_BASE_URL}/api/medications/schedule/${entity_id}`;
      method = 'PUT';
    } else if (entity_type === 'schedule_create') {
      url = `${API_BASE_URL}/api/medications/schedule`;
      method = 'POST';
    } else if (entity_type === 'schedule_delete') {
      url = `${API_BASE_URL}/api/medications/schedule/${entity_id}`;
      method = 'DELETE';
    }

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Operation-ID': operation_id
        },
        body: method !== 'DELETE' ? JSON.stringify({
          ...payload,
          operation_id
        }) : undefined
      });

      // 1. Success (200 OK or 201 Created)
      if (response.ok) {
        const data = await response.json();
        await markQueueItemSuccess(operation_id, entity_type, entity_id, data.server_timestamp);
        this.notifySubscribers({ event: 'item_synced', operation_id, entity_id, data });
        return;
      }

      // 2. Conflict (409 Conflict)
      if (response.status === 409) {
        const conflictData = await response.json();
        await markQueueItemConflict(operation_id, entity_type, entity_id, conflictData);
        this.notifySubscribers({ event: 'item_conflict', operation_id, entity_id, conflict: conflictData });
        return;
      }

      // 3. Permanent Client Validation Failure (400, 422)
      if (response.status === 400 || response.status === 422) {
        const errorData = await response.json().catch(() => ({ detail: 'Validation failed' }));
        const errorDetail = JSON.stringify(errorData.detail || errorData);
        await markQueueItemPermanentFailure(operation_id, entity_type, entity_id, errorDetail);
        this.notifySubscribers({ event: 'item_rejected', operation_id, error: errorDetail });
        return;
      }

      // 4. Server error (5xx) -> Retryable with bounded exponential backoff
      const delay = this.calculateBackoffDelay(attempts || 0);
      const errMsg = `Server returned HTTP ${response.status}`;
      await markQueueItemRetryableError(operation_id, entity_type, entity_id, errMsg, delay);
      this.notifySubscribers({ event: 'item_retry_scheduled', operation_id, delay, error: errMsg });

    } catch (networkError) {
      // Network disconnected / connection refused / DNS failure / timeout
      const delay = this.calculateBackoffDelay(attempts || 0);
      const errMsg = networkError.message || 'Network connection failed';
      await markQueueItemRetryableError(operation_id, entity_type, entity_id, errMsg, delay);
      this.notifySubscribers({ event: 'item_retry_scheduled', operation_id, delay, error: errMsg });
    }
  }

  async refreshServerSchedules() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/medications/schedule`);
      if (response.ok) {
        const schedules = await response.json();
        await syncServerSchedules(schedules);
        this.notifySubscribers({ event: 'schedules_updated', schedules });
      }
    } catch (e) {
      // Ignore if offline
    }
  }

  async checkServerHealth() {
    try {
      const res = await fetch(`${API_BASE_URL}/api/health`, { method: 'GET' });
      return res.ok;
    } catch (e) {
      return false;
    }
  }
}

export const syncEngine = new SyncEngine();
