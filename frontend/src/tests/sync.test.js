import { describe, it, expect, beforeEach } from 'vitest';
import { syncEngine } from '../services/syncEngine';
import { generateUUID, SYNC_STATUS } from '../services/db';

describe('MediTrack Sync Engine & Offline Logic', () => {
  beforeEach(() => {
    syncEngine.setSimulatedOffline(false);
  });

  it('generates distinct valid UUIDs', () => {
    const id1 = generateUUID();
    const id2 = generateUUID();
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
    expect(id1.length).toBeGreaterThan(10);
  });

  it('calculates bounded exponential backoff with jitter', () => {
    // Attempt 0: 1500ms + jitter
    const delay0 = syncEngine.calculateBackoffDelay(0);
    expect(delay0).toBeGreaterThanOrEqual(1500);
    expect(delay0).toBeLessThanOrEqual(2500);

    // Attempt 1: 3000ms + jitter
    const delay1 = syncEngine.calculateBackoffDelay(1);
    expect(delay1).toBeGreaterThanOrEqual(3000);
    expect(delay1).toBeLessThanOrEqual(4000);

    // Attempt 2: 6000ms + jitter
    const delay2 = syncEngine.calculateBackoffDelay(2);
    expect(delay2).toBeGreaterThanOrEqual(6000);
    expect(delay2).toBeLessThanOrEqual(7000);

    // Attempt 10: bounded maximum of 30000ms
    const delay10 = syncEngine.calculateBackoffDelay(10);
    expect(delay10).toBeLessThanOrEqual(30000);
  });

  it('properly toggles simulated offline mode', () => {
    expect(syncEngine.isSimulatedOffline).toBe(false);
    
    syncEngine.setSimulatedOffline(true);
    expect(syncEngine.isSimulatedOffline).toBe(true);
    expect(syncEngine.effectiveOnlineStatus()).toBe(false);

    syncEngine.setSimulatedOffline(false);
    expect(syncEngine.isSimulatedOffline).toBe(false);
  });

  it('notifies subscribers on status change', () => {
    let captured = null;
    const unsubscribe = syncEngine.subscribe((event) => {
      captured = event;
    });

    syncEngine.setSimulatedOffline(true);
    expect(captured).not.toBeNull();
    expect(captured.event).toBe('simulated_offline_change');
    expect(captured.simulated).toBe(true);

    unsubscribe();
  });

  it('defines the required healthcare synchronization statuses', () => {
    expect(SYNC_STATUS.SAVED_LOCALLY).toBe('Saved locally');
    expect(SYNC_STATUS.PENDING_SYNC).toBe('Pending sync');
    expect(SYNC_STATUS.SYNCING).toBe('Syncing');
    expect(SYNC_STATUS.SYNCED).toBe('Synced');
    expect(SYNC_STATUS.SYNC_FAILED).toBe('Sync failed');
  });
});
