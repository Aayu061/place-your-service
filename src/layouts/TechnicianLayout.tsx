import React, { useState } from 'react';
import {
  Calendar,
  BarChart2,
  CheckCircle2,
  User,
  LogOut,
  ChevronDown,
} from 'lucide-react';
import { technicianApi, TechUser } from '@/services/technicianApi';
import { COMPANY_BANK_DETAILS } from '@/config/companyPaymentDetails';

export interface TechnicianLayoutProps {
  activeTab: 'jobs' | 'analytics' | 'completed' | 'profile';
  onTabChange: (tab: 'jobs' | 'analytics' | 'completed' | 'profile') => void;
  onLogout: () => void;
  tech: TechUser | null;
  onTechChange?: (tech: TechUser) => void;
  children: React.ReactNode;
}

export function TechnicianLayout({
  activeTab,
  onTabChange,
  onLogout,
  tech,
  onTechChange,
  children,
}: TechnicianLayoutProps) {
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const handleStatusChange = async (newStatus: 'AVAILABLE' | 'BUSY' | 'OFF_DUTY') => {
    setIsStatusMenuOpen(false);
    if (!tech || tech.status === newStatus) return;

    try {
      setIsUpdatingStatus(true);
      await technicianApi.updateStatus(newStatus);
      const updated = { ...tech, status: newStatus };
      if (onTechChange) {
        onTechChange(updated);
      }
    } catch (err) {
      console.error('Failed to update duty status', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'AVAILABLE':
        return { label: 'On Duty · Available', dotColor: '#22c55e', bgColor: 'rgba(34, 197, 94, 0.12)', textColor: '#16a34a' };
      case 'BUSY':
      case 'ON_DUTY':
        return { label: 'On Site · Busy', dotColor: '#f59e0b', bgColor: 'rgba(245, 158, 11, 0.12)', textColor: '#d97706' };
      case 'OFF_DUTY':
      default:
        return { label: 'Off Duty', dotColor: '#94a3b8', bgColor: 'rgba(148, 163, 184, 0.12)', textColor: '#64748b' };
    }
  };

  const statusInfo = getStatusBadge(tech?.status || 'AVAILABLE');

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-canvas)',
        color: 'var(--text-primary)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Mobile Top Navigation Header */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          backgroundColor: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xs)',
          padding: '10px 16px',
        }}
      >
        <div
          style={{
            maxWidth: '640px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Brand & Tech Identifier */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-default)',
                padding: '3px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src={COMPANY_BANK_DETAILS.pysLogoUrl}
                alt="PYS Field Portal"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-primary)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {tech?.name || 'Technician Desk'}
                </span>
                <span
                  style={{
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fontWeight: 700,
                    backgroundColor: 'rgba(168, 72, 28, 0.1)',
                    color: 'var(--color-brand)',
                  }}
                >
                  {tech?.technicianCode || 'TECH'}
                </span>
              </div>
              <p
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  margin: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Extreme Sales &amp; Services · Field Desk
              </p>
            </div>
          </div>

          {/* Right Controls: Duty Status & Logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
            <button
              type="button"
              onClick={() => setIsStatusMenuOpen(!isStatusMenuOpen)}
              disabled={isUpdatingStatus}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: statusInfo.bgColor,
                border: `1px solid ${statusInfo.dotColor}`,
                color: statusInfo.textColor,
                cursor: 'pointer',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: statusInfo.dotColor,
                  flexShrink: 0,
                }}
              />
              <span>{statusInfo.label}</span>
              <ChevronDown size={12} style={{ opacity: 0.7 }} />
            </button>

            {/* Status Dropdown Menu */}
            {isStatusMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '40px',
                  width: '180px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '6px',
                  zIndex: 50,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={() => handleStatusChange('AVAILABLE')}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#22c55e' }} />
                  <span>Available (On Duty)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('BUSY')}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f59e0b' }} />
                  <span>On Site (Busy)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange('OFF_DUTY')}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
                  <span>Off Duty</span>
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={onLogout}
              title="Sign Out"
              style={{
                padding: '6px',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Field Workspace */}
      <main
        style={{
          flex: 1,
          maxWidth: '640px',
          width: '100%',
          margin: '0 auto',
          padding: '16px',
          paddingBottom: '88px',
          boxSizing: 'border-box',
        }}
      >
        {children}
      </main>

      {/* Bottom Thumb Navigation Bar (Mobile / Responsive) */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 30,
          backgroundColor: 'var(--bg-surface)',
          borderTop: '1px solid var(--border-default)',
          padding: '6px 16px',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div
          style={{
            maxWidth: '520px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-around',
          }}
        >
          <button
            type="button"
            onClick={() => onTabChange('jobs')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '10px',
              fontWeight: activeTab === 'jobs' ? 700 : 500,
              color: activeTab === 'jobs' ? 'var(--color-brand)' : 'var(--text-muted)',
              background: activeTab === 'jobs' ? 'rgba(168, 72, 28, 0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              minWidth: '60px',
            }}
          >
            <Calendar size={18} />
            <span>Jobs</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('analytics')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '10px',
              fontWeight: activeTab === 'analytics' ? 700 : 500,
              color: activeTab === 'analytics' ? 'var(--color-brand)' : 'var(--text-muted)',
              background: activeTab === 'analytics' ? 'rgba(168, 72, 28, 0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              minWidth: '60px',
            }}
          >
            <BarChart2 size={18} />
            <span>Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('completed')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '10px',
              fontWeight: activeTab === 'completed' ? 700 : 500,
              color: activeTab === 'completed' ? 'var(--color-brand)' : 'var(--text-muted)',
              background: activeTab === 'completed' ? 'rgba(168, 72, 28, 0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              minWidth: '60px',
            }}
          >
            <CheckCircle2 size={18} />
            <span>History</span>
          </button>

          <button
            type="button"
            onClick={() => onTabChange('profile')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '2px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)',
              fontSize: '10px',
              fontWeight: activeTab === 'profile' ? 700 : 500,
              color: activeTab === 'profile' ? 'var(--color-brand)' : 'var(--text-muted)',
              background: activeTab === 'profile' ? 'rgba(168, 72, 28, 0.08)' : 'none',
              border: 'none',
              cursor: 'pointer',
              minWidth: '60px',
            }}
          >
            <User size={18} />
            <span>Profile</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
