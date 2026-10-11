import React from 'react';
import { 
  Search, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Database, 
  Bell, 
  AlertTriangle,
  User,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

export function Header({
  isOnline,
  isSimulatedOffline,
  onToggleSimulateOffline,
  pendingCount,
  isSyncing,
  onManualSync,
  serverHealthy,
  searchQuery = '',
  onSearchChange
}) {
  return (
    <header className="top-navbar">
      {/* Search Input Bar matching reference */}
      <div className="search-bar-wrapper">
        <Search size={16} className="search-icon" />
        <input
          type="text"
          placeholder="Search symptoms, medications, health timeline..."
          value={searchQuery}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          className="search-input"
          id="global-search-input"
        />
      </div>

      {/* Action Controls & Sync Indicators */}
      <div className="navbar-actions">
        {/* Simulate Offline Switch */}
        <div className={`simulate-offline-capsule ${isSimulatedOffline ? 'active' : ''}`} title="Sever internet connectivity to simulate offline mode">
          <span className="capsule-label">
            {isSimulatedOffline ? <WifiOff size={15} color="#d97706" /> : <Wifi size={15} color="#059669" />}
            <span>Simulate Offline</span>
          </span>
          <label className="switch">
            <input 
              type="checkbox" 
              checked={isSimulatedOffline} 
              onChange={(e) => onToggleSimulateOffline(e.target.checked)} 
              id="simulate-offline-toggle"
            />
            <span className="slider"></span>
          </label>
        </div>

        {/* Network Status Badge */}
        {isSimulatedOffline ? (
          <span className="badge badge-simulated" title="Simulated Offline mode active">
            <AlertTriangle size={13} />
            Simulated Offline
          </span>
        ) : isOnline ? (
          <span className="badge badge-online" title="Real browser connectivity active">
            <span className="live-dot" />
            Online
          </span>
        ) : (
          <span className="badge badge-offline" title="Network disconnected">
            <WifiOff size={13} />
            Offline
          </span>
        )}

        {/* Pending Sync Queue Badge */}
        <span 
          className={`badge ${pendingCount > 0 ? 'badge-pending' : 'badge-synced'}`}
          title="Number of records safely saved in IndexedDB waiting for server confirmation"
        >
          <Database size={13} />
          {pendingCount} {pendingCount === 1 ? 'Pending' : 'Pending'}
        </span>

        {/* Manual Sync Button */}
        <button 
          className="btn-primary" 
          onClick={onManualSync} 
          disabled={isSyncing || (!isOnline || isSimulatedOffline)}
          id="btn-manual-sync"
          title={(!isOnline || isSimulatedOffline) ? 'Cannot sync while disconnected' : 'Flush pending queue now'}
        >
          <RefreshCw size={14} className={isSyncing ? 'spin-animation' : ''} />
          <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
        </button>

        {/* Notification Bell */}
        <button type="button" className="icon-btn-round" title="Healthcare notifications">
          <Bell size={16} />
          {pendingCount > 0 && <span className="notification-dot" />}
        </button>

        {/* User Profile Pill matching reference */}
        <div className="user-profile-pill">
          <div className="avatar-circle">
            <span>SJ</span>
            <span className={`avatar-status ${(!isOnline || isSimulatedOffline) ? 'offline' : 'online'}`} />
          </div>
          <div className="user-info-text">
            <div className="user-name">Sarah Jenkins</div>
            <div className="user-status-text">
              {(!isOnline || isSimulatedOffline) ? 'Offline Mode' : 'Connected'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
