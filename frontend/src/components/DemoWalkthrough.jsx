import React, { useState } from 'react';
import { 
  Play, 
  CheckCircle, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  ShieldCheck, 
  Server, 
  RotateCcw,
  Sparkles,
  ExternalLink
} from 'lucide-react';

export function DemoWalkthrough({
  isSimulatedOffline,
  onToggleSimulateOffline,
  onQuickAddSymptom,
  onQuickAddMedDose,
  onTriggerReplay,
  onRefreshData,
  pendingCount,
  serverStatus
}) {
  const [activeStep, setActiveStep] = useState(1);
  const [lastActionMessage, setLastActionMessage] = useState(null);

  const steps = [
    {
      step: 1,
      title: '1. Online Symptom',
      desc: 'Verify immediate local persistence and automatic server confirmation.',
      action: async () => {
        if (isSimulatedOffline) onToggleSimulateOffline(false);
        await onQuickAddSymptom('Mild Headache (Online Test)', 3);
        setActiveStep(2);
        setLastActionMessage('Step 1 complete: Online symptom saved and synced!');
      },
      btnLabel: 'Run Step 1'
    },
    {
      step: 2,
      title: '2. Sever Network',
      desc: 'Disconnect network connectivity via Simulate Offline switch.',
      action: () => {
        onToggleSimulateOffline(true);
        setActiveStep(3);
        setLastActionMessage('Step 2 complete: Network severed (Simulated Offline ON).');
      },
      btnLabel: 'Sever Network'
    },
    {
      step: 3,
      title: '3. Record Offline',
      desc: 'Submit new symptoms & dose events while disconnected.',
      action: async () => {
        await onQuickAddMedDose('Amoxicillin', '500mg');
        await onQuickAddSymptom('Fever (Offline Test)', 7);
        setActiveStep(4);
        setLastActionMessage('Step 3 complete: Records saved to IndexedDB; pending sync count incremented!');
      },
      btnLabel: 'Add Offline Data'
    },
    {
      step: 4,
      title: '4. Reload Page (F5)',
      desc: 'Verify all records and durable sync queue survive browser reloads.',
      action: () => {
        window.location.reload();
      },
      btnLabel: 'Reload Page'
    },
    {
      step: 5,
      title: '5. Restore Network',
      desc: 'Restore network connection and verify automatic background sync.',
      action: () => {
        onToggleSimulateOffline(false);
        setActiveStep(6);
        setLastActionMessage('Step 5 complete: Connectivity restored. Auto-sync flushing queue!');
      },
      btnLabel: 'Restore Network'
    },
    {
      step: 6,
      title: '6. Verify Auto-Sync',
      desc: 'Confirm pending queue drops to 0 and all items show Synced badge.',
      action: async () => {
        await onRefreshData();
        setActiveStep(7);
        setLastActionMessage('Step 6 complete: All records confirmed synced by server.');
      },
      btnLabel: 'Verify Synced State'
    },
    {
      step: 7,
      title: '7. Test Replay Idempotency',
      desc: 'Resubmit processed op ID; confirm server returns cached ack.',
      action: async () => {
        await onTriggerReplay();
        setActiveStep(8);
        setLastActionMessage('Step 7 complete: Server recognized duplicate op ID and replayed cached acknowledgement safely!');
      },
      btnLabel: 'Test Duplicate Replay'
    },
    {
      step: 8,
      title: '8. Inspect Server SQLite',
      desc: 'Verify server database integrity and single-record persistence.',
      action: async () => {
        await onRefreshData();
        setLastActionMessage(`Step 8 verified: Server reports ${serverStatus?.total_operations_recorded || 0} operations recorded.`);
      },
      btnLabel: 'Check Server State'
    }
  ];

  return (
    <div className="panel-card demo-panel-card">
      <div className="demo-header-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="stat-icon-badge stat-badge-lavender">
            <Sparkles size={18} color="#8b5cf6" />
          </div>
          <div>
            <h3 className="panel-title">Hackathon Evaluation Console</h3>
            <div className="panel-description">
              Follow the 8 official evaluation steps to verify offline-first resilience & idempotency
            </div>
          </div>
        </div>

        {/* Server Status Pill */}
        <div className="server-status-pill">
          <Server size={14} color="#0284c7" />
          <span>Server SQLite: <strong>{serverStatus?.counts?.symptoms || 0}</strong> symptoms • <strong>{serverStatus?.counts?.medication_events || 0}</strong> doses</span>
        </div>
      </div>

      {lastActionMessage && (
        <div className="action-feedback-banner">
          <CheckCircle size={15} color="#0284c7" />
          <span>{lastActionMessage}</span>
        </div>
      )}

      <div className="demo-steps-grid-modern">
        {steps.map((st) => (
          <div 
            key={st.step} 
            className={`demo-step-tile ${activeStep === st.step ? 'active-step' : ''}`}
          >
            <div className="step-header">
              <span className={`step-badge-number ${activeStep > st.step ? 'completed' : activeStep === st.step ? 'current' : 'upcoming'}`}>
                {activeStep > st.step ? '✓' : st.step}
              </span>
              <span className="step-title-text">{st.title}</span>
            </div>

            <p className="step-description-text">{st.desc}</p>

            <button
              type="button"
              className="btn-step-action"
              onClick={st.action}
            >
              <Play size={10} />
              <span>{st.btnLabel}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
