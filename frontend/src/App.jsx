import React, { useState, useEffect, useCallback } from 'react';
import { 
  getAllSymptoms, 
  getAllMedicationEvents, 
  getAllSchedules, 
  getPendingQueue, 
  saveSymptomLocally, 
  saveMedicationEventLocally, 
  queueScheduleUpdate, 
  syncServerSchedules,
  generateUUID,
  SYNC_STATUS 
} from './services/db';
import { syncEngine } from './services/syncEngine';

import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { OverviewStats } from './components/OverviewStats';
import { HealthTrendsChart } from './components/HealthTrendsChart';
import { SymptomForm } from './components/SymptomForm';
import { MedicationScheduleList } from './components/MedicationScheduleList';
import { HealthTimeline } from './components/HealthTimeline';
import { DemoWalkthrough } from './components/DemoWalkthrough';
import { EditScheduleModal, ConflictResolutionModal } from './components/ConflictModal';

import { 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  X, 
  ShieldAlert, 
  Database,
  WifiOff
} from 'lucide-react';

export function App() {
  const [symptoms, setSymptoms] = useState([]);
  const [medEvents, setMedEvents] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
  
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(syncEngine.isSimulatedOffline);
  const [isSyncing, setIsSyncing] = useState(syncEngine.isSyncing);
  const [serverStatus, setServerStatus] = useState(null);

  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [toasts, setToasts] = useState([]);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [activeConflict, setActiveConflict] = useState(null);

  // Toast helper
  const addToast = useCallback((message, type = 'info') => {
    const id = generateUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Reload data from IndexedDB
  const reloadLocalData = useCallback(async () => {
    try {
      const [syms, meds, scheds, queue] = await Promise.all([
        getAllSymptoms(),
        getAllMedicationEvents(),
        getAllSchedules(),
        getPendingQueue()
      ]);
      setSymptoms(syms);
      setMedEvents(meds);
      setSchedules(scheds);
      setPendingQueue(queue);
    } catch (e) {
      console.error('Error reloading local IndexedDB data:', e);
    }
  }, []);

  // Fetch server status
  const checkServer = useCallback(async () => {
    if (!syncEngine.effectiveOnlineStatus()) return;
    try {
      const res = await fetch('http://127.0.0.1:8000/api/sync/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (e) {
      setServerStatus(null);
    }
  }, []);

  // Initial load & subscribe to sync engine events
  useEffect(() => {
    reloadLocalData();
    checkServer();

    const unsubscribe = syncEngine.subscribe((eventData) => {
      if (eventData.event === 'network_status_change') {
        setIsOnline(eventData.online);
        addToast(
          eventData.online ? 'Internet connection detected.' : 'Network connection lost.',
          eventData.online ? 'success' : 'warning'
        );
      } else if (eventData.event === 'simulated_offline_change') {
        setIsSimulatedOffline(eventData.simulated);
        addToast(
          eventData.simulated
            ? 'Simulated Offline Mode ACTIVATED. Network requests paused.'
            : 'Simulated Offline Mode DEACTIVATED. Resuming automatic sync.',
          eventData.simulated ? 'warning' : 'success'
        );
      } else if (eventData.event === 'sync_started') {
        setIsSyncing(true);
      } else if (eventData.event === 'sync_completed' || eventData.event === 'sync_idle') {
        setIsSyncing(false);
        reloadLocalData();
        checkServer();
      } else if (eventData.event === 'item_synced') {
        reloadLocalData();
      } else if (eventData.event === 'item_conflict') {
        setActiveConflict(eventData.conflict);
        reloadLocalData();
      } else if (eventData.event === 'sync_failed') {
        setIsSyncing(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [reloadLocalData, checkServer, addToast]);

  // Handle Simulate Offline toggle
  const handleToggleSimulateOffline = (val) => {
    syncEngine.setSimulatedOffline(val);
    setIsSimulatedOffline(val);
    if (!val) {
      reloadLocalData();
      checkServer();
    }
  };

  // Manual sync trigger
  const handleManualSync = async () => {
    addToast('Initiating queue synchronization with backend...', 'info');
    await syncEngine.syncQueue();
    await reloadLocalData();
    await checkServer();
  };

  // New Symptom saved locally
  const handleSymptomSaved = async (savedRecord) => {
    addToast(`Symptom '${savedRecord.symptom_name}' saved to local IndexedDB!`, 'success');
    await reloadLocalData();
    if (syncEngine.effectiveOnlineStatus()) {
      syncEngine.syncQueue();
    }
  };

  // Medication dose logged locally
  const handleMedicationEventLogged = async (eventRecord) => {
    addToast(`Dose for '${eventRecord.medication_name}' saved locally!`, 'success');
    await reloadLocalData();
    if (syncEngine.effectiveOnlineStatus()) {
      syncEngine.syncQueue();
    }
  };

  // Schedule edit save
  const handleSaveSchedule = async (updated) => {
    try {
      await queueScheduleUpdate(updated);
      addToast(`Schedule update queued for ${updated.medication_name}`, 'info');
      await reloadLocalData();
      if (syncEngine.effectiveOnlineStatus()) {
        await syncEngine.syncQueue();
        await reloadLocalData();
        await checkServer();
      }
    } catch (e) {
      addToast(`Error saving schedule: ${e.message}`, 'error');
    }
  };

  // Test idempotency replay
  const handleTestReplay = async (item) => {
    if (!syncEngine.effectiveOnlineStatus()) {
      addToast('Cannot test server replay while disconnected.', 'warning');
      return;
    }

    try {
      let url = '';
      let bodyPayload = {};
      if (item.itemType === 'symptom') {
        url = 'http://127.0.0.1:8000/api/sync/symptom';
        bodyPayload = {
          id: item.id,
          operation_id: item.operation_id,
          symptom_name: item.symptom_name,
          severity: item.severity,
          notes: item.notes,
          onset_time: item.onset_time,
          logged_at: item.logged_at
        };
      } else {
        url = 'http://127.0.0.1:8000/api/sync/medication-event';
        bodyPayload = {
          id: item.id,
          operation_id: item.operation_id,
          medication_name: item.medication_name,
          dosage: item.dosage,
          scheduled_time: item.scheduled_time,
          taken_at: item.taken_at,
          status: item.status,
          notes: item.notes
        };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (data.status === 'idempotent_replay') {
        addToast(
          `Idempotency Success! Server recognized op '${item.operation_id.slice(0, 8)}...' and returned cached ack without duplicating.`,
          'success'
        );
      } else {
        addToast(`Server response: ${data.status}`, 'info');
      }
    } catch (e) {
      addToast(`Replay error: ${e.message}`, 'error');
    }
  };

  // Conflict Resolution: Accept Server Version
  const handleResolveConflictServer = async () => {
    if (!activeConflict) return;
    try {
      const serverSched = activeConflict.server_data;
      if (serverSched) {
        await syncServerSchedules([serverSched]);
      }
      setActiveConflict(null);
      addToast('Accepted authoritative server version.', 'success');
      await reloadLocalData();
    } catch (e) {
      addToast('Error resolving conflict: ' + e.message, 'error');
    }
  };

  // Conflict Resolution: Overwrite
  const handleResolveConflictOverwrite = async () => {
    if (!activeConflict) return;
    try {
      const serverData = activeConflict.server_data;
      const overwriteItem = {
        ...serverData,
        version: activeConflict.server_version
      };
      await queueScheduleUpdate(overwriteItem);
      setActiveConflict(null);
      addToast('Resubmitted update aligned with server version.', 'info');
      if (syncEngine.effectiveOnlineStatus()) {
        syncEngine.syncQueue();
      }
      await reloadLocalData();
    } catch (e) {
      addToast('Error resolving conflict: ' + e.message, 'error');
    }
  };

  // Hackathon quick test triggers
  const handleQuickAddSymptom = async (name, severity) => {
    await saveSymptomLocally({
      symptom_name: name,
      severity: severity,
      notes: 'Quick hackathon demo event',
      onset_time: new Date().toISOString()
    });
    await reloadLocalData();
    if (syncEngine.effectiveOnlineStatus()) {
      await syncEngine.syncQueue();
      await reloadLocalData();
      await checkServer();
    }
  };

  const handleQuickAddMedDose = async (medName, dosage) => {
    await saveMedicationEventLocally({
      medication_name: medName,
      dosage: dosage,
      taken_at: new Date().toISOString(),
      status: 'taken',
      notes: 'Logged during offline demonstration'
    });
    await reloadLocalData();
    if (syncEngine.effectiveOnlineStatus()) {
      await syncEngine.syncQueue();
      await reloadLocalData();
      await checkServer();
    }
  };

  const handleTriggerReplayDemo = async () => {
    if (symptoms.length > 0 && symptoms[0].sync_status === SYNC_STATUS.SYNCED) {
      await handleTestReplay({ ...symptoms[0], itemType: 'symptom' });
    } else if (medEvents.length > 0 && medEvents[0].sync_status === SYNC_STATUS.SYNCED) {
      await handleTestReplay({ ...medEvents[0], itemType: 'medication_event' });
    } else {
      addToast('Please ensure at least one synced record exists to test replay.', 'warning');
    }
  };

  return (
    <div className="app-layout">
      {/* Clean Sidebar matching VitalHealth reference */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        pendingCount={pendingQueue.length}
        isOnline={isOnline}
        isSimulatedOffline={isSimulatedOffline}
      />

      {/* Main Content Body */}
      <div className="main-wrapper">
        {/* Compact Navbar with search and offline toggle */}
        <Header
          isOnline={isOnline}
          isSimulatedOffline={isSimulatedOffline}
          onToggleSimulateOffline={handleToggleSimulateOffline}
          pendingCount={pendingQueue.length}
          isSyncing={isSyncing}
          onManualSync={handleManualSync}
          serverHealthy={Boolean(serverStatus)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="content-body">
          {/* Offline Alert Banner */}
          {(isSimulatedOffline || !isOnline) && (
            <div className="offline-banner-modern">
              <div className="banner-left-section">
                <WifiOff size={20} color="#d97706" />
                <div>
                  <strong style={{ color: '#b45309' }}>
                    {isSimulatedOffline ? 'Simulated Offline Mode Active' : 'Network Connection Severed'}
                  </strong>
                  <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    Healthcare records are safeguarded in browser IndexedDB with zero data loss. Auto-synchronization will resume once connectivity returns.
                  </div>
                </div>
              </div>
              <span className="badge badge-pending">
                {pendingQueue.length} {pendingQueue.length === 1 ? 'operation' : 'operations'} queued
              </span>
            </div>
          )}

          {/* Metric Stats Cards Row */}
          <OverviewStats
            schedulesCount={schedules.length}
            symptomsCount={symptoms.length}
            medEventsCount={medEvents.length}
            pendingCount={pendingQueue.length}
          />

          {/* Health Trends Chart & Mini Calendar Row (matching reference) */}
          <HealthTrendsChart
            symptomsCount={symptoms.length}
            medEventsCount={medEvents.length}
            schedules={schedules}
            symptoms={symptoms}
            medEvents={medEvents}
          />

          {/* Dynamic Tab / Section Display */}
          {(activeTab === 'dashboard' || activeTab === 'symptoms' || activeTab === 'medications') && (
            <div className="two-panel-grid">
              <SymptomForm onSymptomSaved={handleSymptomSaved} />
              <MedicationScheduleList
                schedules={schedules}
                onMedicationEventLogged={handleMedicationEventLogged}
                onEditScheduleRequest={(sched) => setEditingSchedule(sched)}
              />
            </div>
          )}

          {/* Health History Table matching reference */}
          {(activeTab === 'dashboard' || activeTab === 'timeline') && (
            <HealthTimeline
              symptoms={symptoms}
              medEvents={medEvents}
              onTestReplay={handleTestReplay}
              searchQuery={searchQuery}
            />
          )}

          {/* Hackathon Evaluation Console */}
          {(activeTab === 'dashboard' || activeTab === 'demo' || activeTab === 'sync') && (
            <DemoWalkthrough
              isSimulatedOffline={isSimulatedOffline}
              onToggleSimulateOffline={handleToggleSimulateOffline}
              onQuickAddSymptom={handleQuickAddSymptom}
              onQuickAddMedDose={handleQuickAddMedDose}
              onTriggerReplay={handleTriggerReplayDemo}
              onRefreshData={async () => {
                await reloadLocalData();
                await checkServer();
              }}
              pendingCount={pendingQueue.length}
              serverStatus={serverStatus}
            />
          )}

          {/* Prototype Safety Notice */}
          <footer style={{
            textAlign: 'center',
            padding: '24px 16px',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.74rem',
            color: 'var(--text-muted)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <ShieldAlert size={14} color="#d97706" />
              <strong style={{ color: '#475569' }}>Hackathon Architectural Prototype</strong>
            </div>
            MediTrack is an offline-first system built for the <em>“The Unreliable Internet Connection”</em> hackathon challenge.
            Demonstrates IndexedDB persistence, idempotent synchronization, and domain conflict resolution. Not certified for clinical diagnosis.
          </footer>
        </div>
      </div>

      {/* Edit Schedule Modal */}
      <EditScheduleModal
        schedule={editingSchedule}
        isOpen={Boolean(editingSchedule)}
        onClose={() => setEditingSchedule(null)}
        onSave={handleSaveSchedule}
      />

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        conflict={activeConflict}
        isOpen={Boolean(activeConflict)}
        onClose={() => setActiveConflict(null)}
        onResolveServer={handleResolveConflictServer}
        onResolveOverwrite={handleResolveConflictOverwrite}
      />

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'success' && <CheckCircle2 size={16} color="#10b981" />}
            {toast.type === 'warning' && <AlertTriangle size={16} color="#f59e0b" />}
            {toast.type === 'info' && <Info size={16} color="#0284c7" />}
            {toast.type === 'error' && <X size={16} color="#ef4444" />}
            <span style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 500 }}>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
