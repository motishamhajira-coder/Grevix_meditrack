import React from 'react';
import { Pill, Activity, CheckCircle2, Database, MoreHorizontal, ArrowUpRight, ShieldCheck } from 'lucide-react';

export function OverviewStats({
  schedulesCount,
  symptomsCount,
  medEventsCount,
  pendingCount
}) {
  return (
    <div className="stats-row">
      {/* Stat 1: Active Regimens */}
      <div className="stat-card">
        <div className="stat-card-top">
          <div className="stat-icon-badge stat-badge-teal">
            <Pill size={18} color="#0284c7" />
          </div>
          <span className="stat-label-text">Active Regimens</span>
          <button type="button" className="stat-more-btn"><MoreHorizontal size={16} /></button>
        </div>
        <div className="stat-card-middle">
          <div className="stat-main-number">{schedulesCount}</div>
          <div className="stat-trend-pill trend-teal">
            <ArrowUpRight size={13} />
            <span>Cached</span>
          </div>
        </div>
        <div className="stat-card-bottom">
          All schedules stored in IndexedDB for immediate offline reference.
        </div>
      </div>

      {/* Stat 2: Symptoms Logged (Highlighted Card with soft blue-teal background like reference) */}
      <div className="stat-card highlighted-stat-card">
        <div className="stat-card-top">
          <div className="stat-icon-badge stat-badge-teal-solid">
            <Activity size={18} color="#0284c7" />
          </div>
          <span className="stat-label-text" style={{ color: '#0369a1' }}>Logged Symptoms</span>
          <button type="button" className="stat-more-btn"><MoreHorizontal size={16} /></button>
        </div>
        <div className="stat-card-middle">
          <div className="stat-main-number" style={{ color: '#0c4a6e' }}>{symptomsCount}</div>
          <div className="stat-trend-pill trend-cyan">
            <ShieldCheck size={13} />
            <span>Zero Loss</span>
          </div>
        </div>
        <div className="stat-card-bottom" style={{ color: '#0369a1' }}>
          Real-time local event capture with deterministic clinical severity scores.
        </div>
      </div>

      {/* Stat 3: Doses Recorded */}
      <div className="stat-card">
        <div className="stat-card-top">
          <div className="stat-icon-badge stat-badge-lavender">
            <CheckCircle2 size={18} color="#8b5cf6" />
          </div>
          <span className="stat-label-text">Doses Recorded</span>
          <button type="button" className="stat-more-btn"><MoreHorizontal size={16} /></button>
        </div>
        <div className="stat-card-middle">
          <div className="stat-main-number">{medEventsCount}</div>
          <div className="stat-trend-pill trend-lavender">
            <ArrowUpRight size={13} />
            <span>Idempotent</span>
          </div>
        </div>
        <div className="stat-card-bottom">
          Append-only dose logging with unique operation IDs to prevent duplicate ingestions.
        </div>
      </div>

      {/* Stat 4: Sync Queue */}
      <div className="stat-card">
        <div className="stat-card-top">
          <div className="stat-icon-badge stat-badge-amber">
            <Database size={18} color="#d97706" />
          </div>
          <span className="stat-label-text">Sync Queue</span>
          <button type="button" className="stat-more-btn"><MoreHorizontal size={16} /></button>
        </div>
        <div className="stat-card-middle">
          <div className="stat-main-number">{pendingCount}</div>
          <div className={`stat-trend-pill ${pendingCount === 0 ? 'trend-green' : 'trend-amber'}`}>
            <span>{pendingCount === 0 ? 'Synchronized' : 'Queued'}</span>
          </div>
        </div>
        <div className="stat-split-footer">
          <div><strong style={{ color: '#0f172a' }}>{pendingCount}</strong> ops pending</div>
          <div style={{ color: '#cbd5e1' }}>•</div>
          <div><strong style={{ color: '#059669' }}>WAL</strong> SQLite ready</div>
        </div>
      </div>
    </div>
  );
}
