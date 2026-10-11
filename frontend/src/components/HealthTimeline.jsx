import React, { useState } from 'react';
import { 
  History, 
  Activity, 
  Pill, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  RefreshCw, 
  Database,
  Filter,
  ShieldCheck,
  Search,
  ExternalLink
} from 'lucide-react';
import { SYNC_STATUS } from '../services/db';

export function HealthTimeline({
  symptoms = [],
  medEvents = [],
  onTestReplay,
  searchQuery = ''
}) {
  const [filterType, setFilterType] = useState('all'); // all, symptoms, meds
  const [replayingOpId, setReplayingOpId] = useState(null);

  // Combine and sort chronologically descending
  const combinedItems = [
    ...symptoms.map(s => ({
      ...s,
      itemType: 'symptom',
      displayTitle: s.symptom_name,
      displayTime: s.logged_at,
      badgeText: `Severity ${s.severity}/10`,
      subtitle: `Onset: ${new Date(s.onset_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    })),
    ...medEvents.map(m => ({
      ...m,
      itemType: 'medication_event',
      displayTitle: `${m.medication_name} (${m.dosage})`,
      displayTime: m.taken_at,
      badgeText: `Status: ${m.status.toUpperCase()}`,
      subtitle: m.scheduled_time ? `Scheduled: ${m.scheduled_time}` : 'Logged As Needed'
    }))
  ].sort((a, b) => new Date(b.displayTime) - new Date(a.displayTime));

  const filteredItems = combinedItems.filter(item => {
    // Type filter
    if (filterType === 'symptoms' && item.itemType !== 'symptom') return false;
    if (filterType === 'meds' && item.itemType !== 'medication_event') return false;

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.displayTitle.toLowerCase().includes(q);
      const matchNotes = item.notes && item.notes.toLowerCase().includes(q);
      const matchOp = item.operation_id && item.operation_id.toLowerCase().includes(q);
      if (!matchTitle && !matchNotes && !matchOp) return false;
    }

    return true;
  });

  const renderStatusBadge = (status) => {
    switch (status) {
      case SYNC_STATUS.SYNCED:
        return (
          <span className="badge badge-synced" title="Verified by FastAPI SQLite database acknowledgement">
            <span className="badge-dot-green" />
            {SYNC_STATUS.SYNCED}
          </span>
        );
      case SYNC_STATUS.SYNCING:
        return (
          <span className="badge badge-syncing" title="Request actively in-flight to backend server">
            <RefreshCw size={11} className="spin-animation" />
            {SYNC_STATUS.SYNCING}
          </span>
        );
      case SYNC_STATUS.SYNC_FAILED:
        return (
          <span className="badge badge-failed" title="Synchronization failed">
            <AlertCircle size={11} />
            {SYNC_STATUS.SYNC_FAILED}
          </span>
        );
      case SYNC_STATUS.PENDING_SYNC:
      default:
        return (
          <span className="badge badge-pending" title="Saved locally in IndexedDB; queued for synchronization">
            <Clock size={11} />
            {SYNC_STATUS.PENDING_SYNC}
          </span>
        );
    }
  };

  const handleReplayClick = async (item) => {
    setReplayingOpId(item.operation_id);
    try {
      if (onTestReplay) {
        await onTestReplay(item);
      }
    } finally {
      setTimeout(() => setReplayingOpId(null), 1000);
    }
  };

  return (
    <div className="panel-card history-table-card">
      {/* Table Header Section matching reference */}
      <div className="table-header-row">
        <div>
          <h3 className="panel-title">Health History & Sync Ledger</h3>
          <div className="panel-description">
            Complete event-sourced record log with local IndexedDB persistence and server acknowledgements
          </div>
        </div>

        {/* Filter Pills matching reference "Today, Weekly, Monthly, Yearly" style */}
        <div className="time-filter-tabs">
          <button
            type="button"
            className={`time-tab-btn ${filterType === 'all' ? 'active' : ''}`}
            onClick={() => setFilterType('all')}
          >
            All Events ({combinedItems.length})
          </button>
          <button
            type="button"
            className={`time-tab-btn ${filterType === 'symptoms' ? 'active' : ''}`}
            onClick={() => setFilterType('symptoms')}
          >
            Symptoms ({symptoms.length})
          </button>
          <button
            type="button"
            className={`time-tab-btn ${filterType === 'meds' ? 'active' : ''}`}
            onClick={() => setFilterType('meds')}
          >
            Medication Doses ({medEvents.length})
          </button>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="empty-table-state">
          <Database size={32} color="#94a3b8" />
          <p style={{ fontWeight: 600, color: '#475569', marginTop: 10 }}>No health records match your view.</p>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            Log a symptom or medication dose above to begin tracking.
          </span>
        </div>
      ) : (
        <div className="table-responsive-wrapper">
          <table className="modern-health-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>#</th>
                <th>Event / Record</th>
                <th>Clinical Details</th>
                <th>Logged Timestamp</th>
                <th>Sync Status</th>
                <th>Operation ID</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item, index) => (
                <tr key={item.id} className="table-row-item" id={`timeline-item-${item.id}`}>
                  {/* Row Index */}
                  <td style={{ color: '#94a3b8', fontSize: '0.8rem', fontWeight: 600 }}>
                    {String(index + 1).padStart(2, '0')}
                  </td>

                  {/* Title & Icon */}
                  <td>
                    <div className="table-event-cell">
                      <div className={`table-icon-circle ${item.itemType === 'symptom' ? 'icon-circle-lavender' : 'icon-circle-teal'}`}>
                        {item.itemType === 'symptom' ? <Activity size={15} /> : <Pill size={15} />}
                      </div>
                      <div>
                        <div className="table-record-title">{item.displayTitle}</div>
                        <div className="table-record-meta">{item.subtitle}</div>
                      </div>
                    </div>
                  </td>

                  {/* Details / Notes */}
                  <td>
                    <div style={{ maxWidth: 220 }}>
                      <span className={`table-badge-small ${item.itemType === 'symptom' ? 'badge-lavender-tag' : 'badge-teal-tag'}`}>
                        {item.badgeText}
                      </span>
                      {item.notes && (
                        <div className="table-notes-preview" title={item.notes}>
                          {item.notes}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Timestamp */}
                  <td>
                    <div style={{ fontSize: '0.82rem', color: '#1e293b', fontWeight: 600 }}>
                      {new Date(item.displayTime).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {new Date(item.displayTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </div>
                  </td>

                  {/* Sync Status Badge */}
                  <td>
                    {renderStatusBadge(item.sync_status)}
                  </td>

                  {/* Operation ID */}
                  <td>
                    <code className="table-op-id" title={item.operation_id}>
                      {item.operation_id ? item.operation_id.slice(0, 8) + '...' : 'local'}
                    </code>
                  </td>

                  {/* Action: Test Replay */}
                  <td style={{ textAlign: 'right' }}>
                    {item.sync_status === SYNC_STATUS.SYNCED ? (
                      <button
                        type="button"
                        className="btn-replay-pill"
                        onClick={() => handleReplayClick(item)}
                        disabled={replayingOpId === item.operation_id}
                        title="Re-send this exact operation to verify server idempotency"
                        id={`btn-replay-${item.id}`}
                      >
                        <RefreshCw size={12} className={replayingOpId === item.operation_id ? 'spin-animation' : ''} />
                        <span>{replayingOpId === item.operation_id ? 'Replaying...' : 'Test Replay'}</span>
                      </button>
                    ) : (
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Queued in IDB</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
