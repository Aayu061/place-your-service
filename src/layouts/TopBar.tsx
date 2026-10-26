import React, { useState, useEffect } from 'react';
import {
  Menu,
  Search,
  Bell,
  Shield,
  LogOut,
  Plus,
  AlertCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { UserRole } from '@/domain/types';
import { Dropdown, DropdownItem, DropdownDivider, DropdownHeader } from '@/components/ui/Dropdown';
import { Badge } from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';

interface TopBarProps {
  currentRole: UserRole;
  onRoleChange?: (role: UserRole) => void;
  activeItemTitle: string;
  activeItem?: string;
  activeSubTab?: 'overview' | 'activity' | 'alerts';
  onSubTabChange?: (tab: 'overview' | 'activity' | 'alerts') => void;
  onOpenMobileSidebar: () => void;
  onSearchClick?: () => void;
  onNewServiceClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentRole,
  activeItemTitle,
  activeItem = 'dashboard',
  activeSubTab = 'overview',
  onSubTabChange,
  onOpenMobileSidebar,
  onSearchClick,
  onNewServiceClick,
}) => {
  const { user, logout } = useAuth();

  const displayName = user?.fullName || (currentRole === 'ADMIN' ? 'Admin User' : 'Staff Member');
  const displayEmail = user?.email || 'authenticated-session@pys.internal';
  const operatorInitial = displayName.charAt(0).toUpperCase();

  // Real-time live digital clock in Island TopBar
  const [timeString, setTimeString] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).replace(/,/g, ' ·')
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <>
      {/* --------------------------------------------------
       * 1. Mobile TopBar (Shown on screens <= 900px)
       * -------------------------------------------------- */}
      <header className="top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            aria-label="Open sidebar navigation"
            className="mobile-menu-trigger"
            style={{
              padding: 'var(--space-2)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <Menu size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h1
              style={{
                fontSize: 'var(--text-base)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {activeItemTitle}
            </h1>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Badge variant={currentRole === 'ADMIN' ? 'brand' : 'neutral'}>
            <Shield size={12} />
            <span>{currentRole}</span>
          </Badge>

          <Dropdown
            align="right"
            trigger={
              <button
                type="button"
                aria-label="User Profile"
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #a8481c 0%, #7c2d12 100%)',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '12px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {operatorInitial}
              </button>
            }
          >
            <DropdownHeader>Active Session</DropdownHeader>
            <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{displayName}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                {displayEmail}
              </div>
            </div>
            <DropdownDivider />
            <DropdownItem icon={<LogOut size={14} />} onClick={() => logout()}>
              Sign Out
            </DropdownItem>
          </Dropdown>
        </div>
      </header>

      {/* --------------------------------------------------
       * 2. Desktop Floating Island TopBar (Vessa-inspired elevation)
       * -------------------------------------------------- */}
      <div className="pys-topbar-island pys-topbar-desktop-only">
        {/* Row 1: Brand, Live Clock, Global Search, and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          {/* Brand lockup */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #a8481c 0%, #7c2d12 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '14px',
                letterSpacing: '-0.02em',
                boxShadow: '0 4px 12px rgba(168, 72, 28, 0.35)',
                flexShrink: 0,
              }}
            >
              PYS
            </div>
            <div>
              <div
                style={{
                  fontSize: '1.05rem',
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span>Place Your Service</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 7px',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(168, 72, 28, 0.1)',
                    color: '#a8481c',
                    fontWeight: 700,
                  }}
                >
                  AC Ops
                </span>
              </div>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                {activeItemTitle} • Facility Maintenance Platform
              </div>
            </div>
          </div>

          {/* Center: Live Digital Clock & Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '520px', margin: '0 auto' }}>
            {/* Live Clock Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '9999px',
                backgroundColor: 'rgba(20, 36, 28, 0.04)',
                border: '1px solid var(--border-card-hairline)',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
                whiteSpace: 'nowrap',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
                  animation: 'pulse 2s infinite',
                }}
              />
              <Clock size={13} style={{ color: 'var(--text-muted)' }} />
              <span>{timeString || 'Live Telemetry'}</span>
            </div>

            {/* Global Search Pill */}
            <button
              type="button"
              onClick={onSearchClick}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 14px',
                backgroundColor: 'rgba(20, 36, 28, 0.04)',
                border: '1px solid var(--border-card-hairline)',
                borderRadius: '9999px',
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Search size={14} />
                <span>Search customers, assets, tickets...</span>
              </div>
              <kbd
                style={{
                  padding: '1px 6px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-card-hairline)',
                  fontSize: '10px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                ⌘K
              </kbd>
            </button>
          </div>

          {/* Right Action Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Badge variant={currentRole === 'ADMIN' ? 'brand' : 'neutral'}>
              <Shield size={12} />
              <span>{currentRole} Role</span>
            </Badge>

            {/* Notifications Dropdown */}
            <Dropdown
              align="right"
              trigger={
                <button
                  type="button"
                  aria-label="View notifications"
                  className="pys-icon-circle-btn"
                  style={{ position: 'relative' }}
                >
                  <Bell size={17} />
                  <span
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: '#ef4444',
                    }}
                  />
                </button>
              }
            >
              <DropdownHeader>Operational Notifications (3)</DropdownHeader>
              <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem' }}>
                  <AlertCircle size={15} style={{ color: '#ef4444', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Emergency Breakdown Logged</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Tech Park Tower B - Server Room AC trip</div>
                  </div>
                </div>
                <DropdownDivider />
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem' }}>
                  <Sparkles size={15} style={{ color: '#d97706', marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>3 PM Visits Due Tomorrow</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Auto-assigned to South Zone field engineers</div>
                  </div>
                </div>
              </div>
              <DropdownDivider />
              <div style={{ padding: '6px 12px', textAlign: 'center' }}>
                <span style={{ fontSize: '0.76rem', color: '#a8481c', fontWeight: 600, cursor: 'pointer' }}>
                  View All Operational Logs →
                </span>
              </div>
            </Dropdown>

            {/* CTA + New Service */}
            <button
              type="button"
              onClick={onNewServiceClick}
              className="pys-btn-primary"
              style={{ padding: '7px 16px', fontSize: '0.82rem' }}
            >
              <Plus size={15} />
              <span>+ New Service</span>
            </button>

            {/* Profile Avatar Dropdown */}
            <Dropdown
              align="right"
              trigger={
                <button
                  type="button"
                  aria-label="User Profile Menu"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '4px 10px 4px 4px',
                    borderRadius: '9999px',
                    border: '1px solid var(--border-card-hairline)',
                    backgroundColor: 'rgba(20, 36, 28, 0.04)',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #a8481c 0%, #7c2d12 100%)',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '12px',
                    }}
                  >
                    {operatorInitial}
                  </div>
                  <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {displayName}
                    </div>
                  </div>
                </button>
              }
            >
              <DropdownHeader>Active Session</DropdownHeader>
              <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>{displayName}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
                  {displayEmail}
                </div>
              </div>
              <DropdownDivider />
              <DropdownItem icon={<LogOut size={14} />} onClick={() => logout()}>
                Sign Out
              </DropdownItem>
            </Dropdown>
          </div>
        </div>

        {/* Row 2: Segmented Pill Tabs (When activeItem is dashboard) */}
        {activeItem === 'dashboard' && (
          <div className="pys-pill-tabs-track" role="tablist" aria-label="Dashboard View Modes">
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'overview'}
              className={`pys-pill-tab ${activeSubTab === 'overview' ? 'active' : ''}`}
              onClick={() => onSubTabChange?.('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'activity'}
              className={`pys-pill-tab ${activeSubTab === 'activity' ? 'active' : ''}`}
              onClick={() => onSubTabChange?.('activity')}
            >
              Service Activity
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeSubTab === 'alerts'}
              className={`pys-pill-tab ${activeSubTab === 'alerts' ? 'active' : ''}`}
              onClick={() => onSubTabChange?.('alerts')}
            >
              Operational Alerts
            </button>
          </div>
        )}
      </div>
    </>
  );
};


