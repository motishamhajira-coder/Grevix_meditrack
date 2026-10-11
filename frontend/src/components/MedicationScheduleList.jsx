import React, { useState } from 'react';
import { Pill, Clock, Check, Bell, Edit3, ShieldAlert, Sparkles, CheckCircle2 } from 'lucide-react';
import { saveMedicationEventLocally } from '../services/db';

export function MedicationScheduleList({
  schedules = [],
  onMedicationEventLogged,
  onEditScheduleRequest
}) {
  const [notificationStatus, setNotificationStatus] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );
  const [takingId, setTakingId] = useState(null);

  const handleTakeDose = async (schedule, scheduledTime) => {
    setTakingId(`${schedule.id}-${scheduledTime || 'now'}`);
    try {
      const eventRecord = await saveMedicationEventLocally({
        medication_name: schedule.medication_name,
        dosage: schedule.dosage,
        scheduled_time: scheduledTime || null,
        taken_at: new Date().toISOString(),
        status: 'taken',
        notes: `Taken on schedule (${schedule.frequency})`
      });

      if (onMedicationEventLogged) {
        onMedicationEventLogged(eventRecord);
      }
    } catch (err) {
      console.error('Failed to log dose locally:', err);
    } finally {
      setTimeout(() => setTakingId(null), 600);
    }
  };

  const handleRequestNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Browser notifications are not supported in this browser.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      setNotificationStatus(permission);
      if (permission === 'granted') {
        new Notification('MediTrack Reminders Active', {
          body: 'Local medication schedule cached. Reminders will notify you while the app is open.',
          icon: '/favicon.svg'
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="panel-card med-panel-card">
      <div className="panel-header">
        <div className="panel-title-area">
          <div className="stat-icon-badge stat-badge-teal">
            <Pill size={18} color="#0284c7" />
          </div>
          <div>
            <h3 className="panel-title">Medication Regimens</h3>
            <div className="panel-description">Cached locally in IndexedDB • Accessible fully offline</div>
          </div>
        </div>

        {/* Browser Reminders Trigger */}
        <button
          type="button"
          onClick={handleRequestNotifications}
          className="btn-reminders-pill"
          title="Enable offline browser reminder alerts"
        >
          <Bell size={13} color={notificationStatus === 'granted' ? '#059669' : '#64748b'} />
          <span>{notificationStatus === 'granted' ? 'Reminders Active' : 'Enable Reminders'}</span>
        </button>
      </div>

      {/* Safety Notice matching reference style */}
      <div className="clinical-notice-pill">
        <Clock size={15} color="#0284c7" />
        <span>
          <strong>Clinical Protocol:</strong> Schedules remain cached locally. A reminder is assistive and does not constitute proof that medication was taken. Log your dose upon ingestion.
        </span>
      </div>

      <div className="med-list-container">
        {schedules.map((med) => (
          <div key={med.id} className="med-regimen-card" id={`med-card-${med.id}`}>
            <div className="med-card-info">
              <div className="med-name-row">
                <span className="med-title-text">{med.medication_name}</span>
                <span className="med-dosage-tag">{med.dosage}</span>
                <span className="med-version-pill">v{med.version}</span>
              </div>

              <div className="med-frequency-row">
                <Clock size={13} color="#0284c7" />
                <span>{med.frequency}</span>
                <span className="dot-separator">•</span>
                <div className="med-time-chips">
                  {med.times && med.times.map((t, idx) => (
                    <span key={idx} className="time-chip">
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {med.instructions && (
                <div className="med-instructions-text">
                  {med.instructions}
                </div>
              )}
            </div>

            <div className="med-card-actions">
              {/* Quick Dose Log Button */}
              <button
                type="button"
                className="btn-take-dose"
                onClick={() => handleTakeDose(med, med.times?.[0])}
                disabled={takingId === `${med.id}-${med.times?.[0] || 'now'}`}
                title="Record medication taken locally in IndexedDB"
                id={`btn-take-${med.id}`}
              >
                <Check size={14} />
                <span>{takingId === `${med.id}-${med.times?.[0] || 'now'}` ? 'Logging...' : 'Log Dose'}</span>
              </button>

              {/* Edit Schedule Button */}
              <button
                type="button"
                className="btn-edit-regimen"
                onClick={() => onEditScheduleRequest(med)}
                title="Edit schedule details (demonstrates version conflict handling)"
                id={`btn-edit-${med.id}`}
              >
                <Edit3 size={13} />
                <span>Edit</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
