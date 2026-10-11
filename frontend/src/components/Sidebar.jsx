import React from 'react';
import { 
  Activity, 
  LayoutDashboard, 
  Pill, 
  History, 
  RefreshCw, 
  Sparkles, 
  ShieldCheck, 
  Heart, 
  Calendar,
  FileText,
  Settings,
  UserCheck,
  CheckCircle2
} from 'lucide-react';

export function Sidebar({ activeTab, onSelectTab, pendingCount, isOnline, isSimulatedOffline }) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'OVERVIEW' },
    { id: 'timeline', label: 'Health Timeline', icon: History, section: 'OVERVIEW' },
    { id: 'symptoms', label: 'Log Symptom', icon: Activity, section: 'TRACKING' },
    { id: 'medications', label: 'Medication Regimen', icon: Pill, section: 'TRACKING' },
    { id: 'demo', label: 'Hackathon Demo', icon: Sparkles, section: 'SYSTEM' },
    { id: 'sync', label: 'Sync Status', icon: RefreshCw, section: 'SYSTEM', badge: pendingCount > 0 ? pendingCount : null }
  ];

  return (
    <aside className="sidebar">
      {/* Brand Header */}
      <div className="sidebar-brand">
        <div className="brand-logo-badge">
          <Heart size={22} color="#ffffff" fill="#ffffff" />
        </div>
        <div className="brand-text">
          <span className="brand-title">MediTrack</span>
          <span className="brand-subtitle">Offline Health OS</span>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="sidebar-nav">
        <div className="nav-section-title">OVERVIEW</div>
        {navItems.filter(item => item.section === 'OVERVIEW').map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={18} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}

        <div className="nav-section-title" style={{ marginTop: '16px' }}>TRACKING</div>
        {navItems.filter(item => item.section === 'TRACKING').map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={18} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
            </button>
          );
        })}

        <div className="nav-section-title" style={{ marginTop: '16px' }}>SYSTEM</div>
        {navItems.filter(item => item.section === 'SYSTEM').map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelectTab(item.id)}
            >
              <Icon size={18} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
              {item.badge && (
                <span className="nav-badge-pill">{item.badge}</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User / Patient Profile Card at Bottom */}
      <div className="sidebar-footer">
        <div className="patient-profile-card">
          <div className="avatar-wrapper">
            <div className="avatar-placeholder">SJ</div>
            <span className={`status-indicator-dot ${(!isOnline || isSimulatedOffline) ? 'offline' : 'online'}`} />
          </div>
          <div className="profile-details">
            <span className="profile-name">Sarah Jenkins</span>
            <span className="profile-role">Patient #MT-84920</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
