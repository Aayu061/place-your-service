import React from 'react';
import { Bell, ShieldAlert, CheckCircle2, UserCircle2 } from 'lucide-react';
import { UserRole } from '@/domain/types';
import { config } from '@/config/env';

interface TopBarProps {
  currentRole: UserRole;
}

export const TopBar: React.FC<TopBarProps> = ({ currentRole }) => {
  return (
    <header className="top-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <h1 style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
          Service Management Overview
        </h1>
        <span
          className="badge badge-info"
          style={{ fontSize: '11px', padding: '2px 8px' }}
        >
          Phase 0 Initialized
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        {/* Environment & Backend Indicator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-surface-subtle)',
            padding: '4px 10px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {config.supabase.isConfigured ? (
            <>
              <CheckCircle2 size={13} style={{ color: 'var(--color-success-solid)' }} />
              <span>Supabase Connected</span>
            </>
          ) : (
            <>
              <ShieldAlert size={13} style={{ color: 'var(--color-warning-solid)' }} />
              <span>Dev Foundation (Local)</span>
            </>
          )}
        </div>

        {/* Notifications Mock Icon (Prepared for Phase 1/13) */}
        <button
          type="button"
          aria-label="Notifications"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            backgroundColor: 'var(--bg-surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <Bell size={16} />
        </button>

        {/* User Role Badge & Profile */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '4px 8px',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--bg-surface)',
          }}
        >
          <UserCircle2 size={20} style={{ color: 'var(--color-primary-600)' }} />
          <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              {currentRole === 'ADMIN' ? 'Admin (Singleton)' : 'Staff Member'}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {currentRole === 'ADMIN' ? 'Full System Control' : 'Operations Management'}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
