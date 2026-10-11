import React, { useState } from 'react';
import { PlusCircle, Activity, Sparkles, CheckCircle2, ShieldCheck } from 'lucide-react';
import { saveSymptomLocally } from '../services/db';

const COMMON_SYMPTOMS = ['Headache', 'Fever', 'Cough', 'Fatigue', 'Dizziness', 'Nausea'];

export function SymptomForm({ onSymptomSaved }) {
  const [symptomName, setSymptomName] = useState('');
  const [severity, setSeverity] = useState(4);
  const [onsetTime, setOnsetTime] = useState(
    new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  );
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

  const getSeverityLabel = (val) => {
    if (val <= 3) return { label: 'Mild', color: '#059669', bg: '#ecfdf5' };
    if (val <= 6) return { label: 'Moderate', color: '#d97706', bg: '#fffbeb' };
    if (val <= 8) return { label: 'Severe', color: '#ea580c', bg: '#fff7ed' };
    return { label: 'Urgent', color: '#dc2626', bg: '#fef2f2' };
  };

  const currentSeverity = getSeverityLabel(severity);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!symptomName.trim()) return;

    setIsSubmitting(true);
    try {
      // Immediate local write to IndexedDB
      const savedRecord = await saveSymptomLocally({
        symptom_name: symptomName,
        severity: Number(severity),
        onset_time: new Date(onsetTime).toISOString(),
        notes: notes
      });

      setLastSaved({
        name: savedRecord.symptom_name,
        op_id: savedRecord.operation_id
      });

      // Clear fields
      setSymptomName('');
      setNotes('');
      setSeverity(4);

      if (onSymptomSaved) {
        onSymptomSaved(savedRecord);
      }
    } catch (err) {
      console.error('Failed to save symptom locally:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="panel-card form-panel-card">
      <div className="panel-header">
        <div className="panel-title-area">
          <div className="stat-icon-badge stat-badge-lavender">
            <Activity size={18} color="#8b5cf6" />
          </div>
          <div>
            <h3 className="panel-title">Record Symptom</h3>
            <div className="panel-description">Persisted instantly to local IndexedDB before any network call</div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="modern-form">
        {/* Symptom Name input & chips */}
        <div className="form-group">
          <label className="form-label" htmlFor="symptom-name-input">
            <span>Symptom Name *</span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Required</span>
          </label>
          <input
            id="symptom-name-input"
            type="text"
            placeholder="e.g. Migraine, Muscle Spasm, Joint Pain..."
            value={symptomName}
            onChange={(e) => setSymptomName(e.target.value)}
            required
            className="modern-input"
          />
          <div className="chips-container">
            {COMMON_SYMPTOMS.map((sym) => (
              <button
                type="button"
                key={sym}
                onClick={() => setSymptomName(sym)}
                className={`symptom-chip ${symptomName === sym ? 'active-chip' : ''}`}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>

        {/* Severity Slider */}
        <div className="form-group">
          <div className="form-label">
            <span>Clinical Severity (1 - 10)</span>
            <span 
              className="severity-score-badge"
              style={{ color: currentSeverity.color, background: currentSeverity.bg }}
            >
              {severity}/10 ({currentSeverity.label})
            </span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={severity}
            onChange={(e) => setSeverity(Number(e.target.value))}
            className="severity-slider-modern"
            id="severity-slider"
          />
          <div className="severity-ticks-labels">
            <span>1 (Mild)</span>
            <span>5 (Moderate)</span>
            <span>10 (Urgent)</span>
          </div>
        </div>

        {/* Onset Time */}
        <div className="form-group">
          <label className="form-label" htmlFor="onset-time-input">Onset Timestamp</label>
          <input
            id="onset-time-input"
            type="datetime-local"
            value={onsetTime}
            onChange={(e) => setOnsetTime(e.target.value)}
            className="modern-input"
          />
        </div>

        {/* Clinical Notes */}
        <div className="form-group">
          <label className="form-label" htmlFor="symptom-notes-input">Clinical Notes / Triggers</label>
          <textarea
            id="symptom-notes-input"
            rows={2}
            placeholder="Document triggers, accompanying symptoms, or context..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="modern-textarea"
          />
        </div>

        <button 
          type="submit" 
          className="btn-primary-teal" 
          disabled={isSubmitting || !symptomName.trim()}
          id="btn-submit-symptom"
        >
          <PlusCircle size={16} />
          <span>{isSubmitting ? 'Saving to IndexedDB...' : 'Save Symptom (Offline-Safe)'}</span>
        </button>

        {lastSaved && (
          <div className="save-confirmation-pill">
            <CheckCircle2 size={16} color="#059669" />
            <div>
              <strong>{lastSaved.name}</strong> safely written to IndexedDB. Operation:{' '}
              <code>{lastSaved.op_id.slice(0, 8)}...</code>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
