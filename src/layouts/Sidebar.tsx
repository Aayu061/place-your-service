import React from 'react';
import {
  LayoutDashboard,
  Users,
  AirVent,
  Wrench,
  CalendarDays,
  FileCheck2,
  HardHat,
  Package,
  Receipt,
  BarChart3,
  History,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import { UserRole } from '@/domain/types';

interface SidebarProps {
  currentRole: UserRole;
  onRoleChange: (role: UserRole) => void;
  activeItem?: string;
  onItemSelect?: (item: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  onRoleChange,
  activeItem = 'dashboard',
  onItemSelect,
}) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Customers', icon: Users },
    { id: 'ac-assets', label: 'AC Assets', icon: AirVent },
    { id: 'service-requests', label: 'Service Requests', icon: Wrench },
    { id: 'service-schedule', label: 'Service Schedule', icon: CalendarDays },
    { id: 'amc', label: 'AMC Contracts', icon: FileCheck2 },
    { id: 'technicians', label: 'Technicians', icon: HardHat },
    { id: 'inventory', label: 'Parts & Inventory', icon: Package },
    { id: 'payments', label: 'Payments', icon: Receipt },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'activity-logs', label: 'Activity Logs', icon: History },
  ];

  const adminOnlyItems = [
    { id: 'staff-management', label: 'Staff Management', icon: ShieldCheck },
  ];

  return (
    <aside className="sidebar">
      {/* Brand header */}
      <div
        style={{
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
        }}
      >
        <div
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-primary-600)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
          }}
        >
          PYS
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: '#fff', letterSpacing: '-0.01em' }}>
            Place Your Service
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-neutral-400)' }}>
            AC Management Portal
          </div>
        </div>
      </div>

      {/* Role Indicator / Switcher for Development Testing */}
      <div
        style={{
          padding: 'var(--space-3) var(--space-6)',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--space-2)',
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Current Role
          </span>
          <span
            className={`badge ${currentRole === 'ADMIN' ? 'badge-primary' : 'badge-neutral'}`}
            style={{
              fontSize: '10px',
              backgroundColor: currentRole === 'ADMIN' ? 'var(--color-primary-800)' : 'var(--color-neutral-700)',
              color: '#fff',
              border: 'none',
              padding: '2px 8px',
            }}
          >
            {currentRole}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <button
            type="button"
            onClick={() => onRoleChange('ADMIN')}
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: '11px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: currentRole === 'ADMIN' ? 'var(--color-primary-600)' : 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              cursor: 'pointer',
              border: 'none',
              transition: 'background-color 150ms ease',
            }}
          >
            Admin View
          </button>
          <button
            type="button"
            onClick={() => onRoleChange('STAFF')}
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: '11px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: currentRole === 'STAFF' ? 'var(--color-primary-600)' : 'rgba(255, 255, 255, 0.08)',
              color: '#fff',
              cursor: 'pointer',
              border: 'none',
              transition: 'background-color 150ms ease',
            }}
          >
            Staff View
          </button>
        </div>
      </div>

      {/* Navigation Links */}
      <nav
        style={{
          padding: 'var(--space-4) var(--space-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-1)',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--color-neutral-500)',
            padding: 'var(--space-2) var(--space-3)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          Operations
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onItemSelect?.(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: isActive ? 'var(--color-primary-600)' : 'transparent',
                color: isActive ? '#fff' : 'var(--color-neutral-300)',
                fontSize: 'var(--text-sm)',
                fontWeight: isActive ? 600 : 400,
                textAlign: 'left',
                width: '100%',
                transition: 'all 150ms ease',
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Icon size={18} style={{ color: isActive ? '#fff' : 'var(--color-neutral-400)' }} />
              <span>{item.label}</span>
            </button>
          );
        })}

        {currentRole === 'ADMIN' && (
          <>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--color-neutral-500)',
                padding: 'var(--space-4) var(--space-3) var(--space-2)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Administration
            </div>
            {adminOnlyItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onItemSelect?.(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-3)',
                    padding: 'var(--space-2) var(--space-3)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: isActive ? 'var(--color-primary-600)' : 'transparent',
                    color: isActive ? '#fff' : 'var(--color-neutral-300)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: isActive ? 600 : 400,
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-sidebar-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <Icon size={18} style={{ color: isActive ? '#fff' : 'var(--color-neutral-400)' }} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </>
        )}
      </nav>

      {/* Footer info */}
      <div
        style={{
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.15)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
          <Settings size={14} style={{ color: 'var(--color-neutral-400)' }} />
          <span style={{ fontSize: '11px', color: 'var(--color-neutral-400)' }}>Phase 0 — Foundation</span>
        </div>
        <div style={{ fontSize: '10px', color: 'var(--color-neutral-500)' }}>
          Scope: Admin & Staff Portal
        </div>
      </div>
    </aside>
  );
};
