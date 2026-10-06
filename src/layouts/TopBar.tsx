import React from 'react';
import {
  Menu,
  Search,
  Bell,
  UserCircle2,
  CheckCircle2,
  Shield,
  LogOut,
  SlidersHorizontal,
} from 'lucide-react';
import { UserRole } from '@/domain/types';
import { Dropdown, DropdownItem, DropdownDivider, DropdownHeader } from '@/components/ui/Dropdown';
import { Badge } from '@/components/ui/Badge';

interface TopBarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeItemTitle: string;
  onOpenMobileSidebar: () => void;
  onSearchClick?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  currentRole,
  onRoleChange,
  activeItemTitle,
  onOpenMobileSidebar,
  onSearchClick,
}) => {
  return (
    <header className="top-bar">
      {/* Left: Mobile Menu Trigger & Breadcrumbs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          aria-label="Open sidebar navigation"
          style={{
            padding: 'var(--space-2)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Menu size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
            Place Your Service
          </span>
          <span style={{ color: 'var(--border-strong)', fontSize: 'var(--text-xs)' }}>/</span>
          <h1 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-primary)' }}>
            {activeItemTitle}
          </h1>
        </div>
      </div>

      {/* Center: Global Search Bar Placeholder */}
      <div
        style={{
          flex: 1,
          maxWidth: '420px',
          margin: '0 var(--space-4)',
          display: 'none',
        }}
        className="search-container-desktop"
      >
        <button
          type="button"
          onClick={onSearchClick}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.45rem 0.85rem',
            backgroundColor: 'var(--bg-surface-subtle)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-muted)',
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Search size={14} />
            <span>Search customers, services, assets...</span>
          </div>
          <kbd
            style={{
              padding: '1px 5px',
              borderRadius: 'var(--radius-xs)',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              fontSize: '10px',
              fontFamily: 'var(--font-mono)',
            }}
          >
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Right Controls: Role indicator, Notifications, Profile Menu */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        {/* Role Badge Indicator */}
        <Badge variant={currentRole === 'ADMIN' ? 'brand' : 'neutral'}>
          <Shield size={12} />
          <span>{currentRole} Role</span>
        </Badge>

        {/* Notifications Dropdown Placeholder */}
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              aria-label="View notifications"
              className="btn btn-ghost btn-icon"
              style={{ position: 'relative' }}
            >
              <Bell size={18} />
            </button>
          }
        >
          <DropdownHeader>Notifications (Shell Preview)</DropdownHeader>
          <div style={{ padding: 'var(--space-3) var(--space-4)', maxWidth: '260px' }}>
            <p className="text-caption" style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Live operational notification streaming will connect in Phase 13.
            </p>
          </div>
          <DropdownDivider />
          <div style={{ padding: 'var(--space-2) var(--space-4)', textAlign: 'center' }}>
            <span className="text-caption" style={{ color: 'var(--color-brand)', fontWeight: 500 }}>
              No Unread Alerts
            </span>
          </div>
        </Dropdown>

        {/* User Profile Menu */}
        <Dropdown
          align="right"
          trigger={
            <button
              type="button"
              aria-label="User Profile Menu"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                padding: '4px 8px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-default)',
                backgroundColor: 'var(--bg-surface)',
                cursor: 'pointer',
              }}
            >
              <UserCircle2 size={20} style={{ color: 'var(--color-brand)' }} />
              <div style={{ textAlign: 'left', lineHeight: 1.1, display: 'none' }} className="user-name-desktop">
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                  {currentRole === 'ADMIN' ? 'Admin User' : 'Staff Member'}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                  {currentRole === 'ADMIN' ? 'Singleton Account' : 'Operations'}
                </div>
              </div>
            </button>
          }
        >
          <DropdownHeader>Active Session</DropdownHeader>
          <div style={{ padding: 'var(--space-2) var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
              {currentRole === 'ADMIN' ? 'Admin (Administrator)' : 'Operational Staff'}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              auth-session@placeyourservice.internal
            </div>
          </div>
          <DropdownDivider />

          <DropdownHeader>Role Simulation</DropdownHeader>
          <DropdownItem
            icon={<SlidersHorizontal size={14} />}
            onClick={() => onRoleChange('ADMIN')}
          >
            <span>Switch to Admin View</span>
            {currentRole === 'ADMIN' && <CheckCircle2 size={13} style={{ marginLeft: 'auto', color: 'var(--color-brand)' }} />}
          </DropdownItem>
          <DropdownItem
            icon={<SlidersHorizontal size={14} />}
            onClick={() => onRoleChange('STAFF')}
          >
            <span>Switch to Staff View</span>
            {currentRole === 'STAFF' && <CheckCircle2 size={13} style={{ marginLeft: 'auto', color: 'var(--color-brand)' }} />}
          </DropdownItem>

          <DropdownDivider />
          <DropdownItem
            icon={<LogOut size={14} />}
            onClick={() => alert('Authentication system connects in subsequent backend phase.')}
          >
            Sign Out (Shell)
          </DropdownItem>
        </Dropdown>
      </div>
    </header>
  );
};
