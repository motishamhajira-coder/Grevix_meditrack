import React, { useState } from 'react';
import { AlertTriangle, Check, X, ArrowRight, ShieldAlert } from 'lucide-react';

export function EditScheduleModal({
  schedule,
  isOpen,
  onClose,
  onSave
}) {
  if (!isOpen || !schedule) return null;

  const [name, setName] = useState(schedule.medication_name);
  const [dosage, setDosage] = useState(schedule.dosage);
  const [frequency, setFrequency] = useState(schedule.frequency);
  const [instructions, setInstructions] = useState(schedule.instructions || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...schedule,
      medication_name: name,
      dosage: dosage,
      frequency: frequency,
      instructions: instructions
    });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-card">
        <div className="modal-header">
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1e293b' }}>Edit Medication Regimen</h3>
          <button type="button" onClick={onClose} className="modal-close-btn">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modern-form" style={{ gap: 14 }}>
          <div className="form-group">
            <label className="form-label">Medication Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="modern-input" />
          </div>

          <div className="form-group">
            <label className="form-label">Dosage</label>
            <input type="text" value={dosage} onChange={(e) => setDosage(e.target.value)} required className="modern-input" />
          </div>

          <div className="form-group">
            <label className="form-label">Frequency</label>
            <input type="text" value={frequency} onChange={(e) => setFrequency(e.target.value)} required className="modern-input" />
          </div>

          <div className="form-group">
            <label className="form-label">Clinical Instructions</label>
            <textarea
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="modern-textarea"
            />
          </div>

          <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
            Current Version: <strong>v{schedule.version}</strong> • Updates require version matching to prevent silent overwrite.
          </div>

          <div className="modal-actions-row">
            <button type="button" className="btn-secondary-outlined" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary-teal" id="btn-save-schedule">
              Save Regimen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ConflictResolutionModal({
  conflict,
  isOpen,
  onResolveServer,
  onResolveOverwrite,
  onClose
}) {
  if (!isOpen || !conflict) return null;

  const { client_version, server_version, server_data, message } = conflict;

  return (
    <div className="modal-overlay">
      <div className="modal-card" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="stat-icon-badge stat-badge-amber">
              <ShieldAlert size={18} color="#d97706" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#1e293b' }}>
                Concurrency Conflict Detected
              </h3>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                Domain Rule: Healthcare regimens cannot be silently overwritten
              </div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="modal-close-btn">
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.84rem', color: '#475569', margin: '12px 0' }}>
          {message || 'The server version of this regimen is newer than your offline edit. A simplistic last-write-wins rule was rejected to protect patient safety.'}
        </p>

        {/* Side-by-side comparison */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div style={{
            background: '#fff1f2',
            border: '1px solid #fecdd3',
            borderRadius: 12,
            padding: 14,
            fontSize: '0.78rem'
          }}>
            <div style={{ fontWeight: 700, color: '#e11d48', marginBottom: 6 }}>
              Your Offline Version (v{client_version})
            </div>
            <div style={{ color: '#475569' }}>Stale baseline cached before edit.</div>
          </div>

          <div style={{
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            borderRadius: 12,
            padding: 14,
            fontSize: '0.78rem'
          }}>
            <div style={{ fontWeight: 700, color: '#059669', marginBottom: 6 }}>
              Current Server Version (v{server_version})
            </div>
            {server_data && (
              <div style={{ color: '#1e293b' }}>
                <div><strong>{server_data.medication_name}</strong> ({server_data.dosage})</div>
                <div>{server_data.frequency}</div>
                <div style={{ color: '#64748b', fontSize: '0.72rem', marginTop: 4 }}>
                  Updated: {new Date(server_data.updated_at).toLocaleTimeString()}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions-row" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="btn-secondary-outlined"
            onClick={onClose}
          >
            Review Later
          </button>
          <button
            type="button"
            className="btn-primary-teal"
            onClick={onResolveServer}
            style={{ background: '#059669' }}
          >
            Accept Server Version (Recommended)
          </button>
          <button
            type="button"
            className="btn-secondary-outlined"
            onClick={onResolveOverwrite}
            style={{ borderColor: '#f59e0b', color: '#d97706' }}
          >
            Force Overwrite to v{server_version + 1}
          </button>
        </div>
      </div>
    </div>
  );
}
