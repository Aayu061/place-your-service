import React, { useEffect } from 'react';
import {
  ChevronLeft,
  X,
} from 'lucide-react';
import { UserRole } from '@/domain/types';
import { Tooltip } from '@/components/ui/Tooltip';
import { useAuth } from '@/hooks/useAuth';
import { NAV_STRUCTURE } from './navStructure';

interface SidebarProps {
  currentRole: UserRole;
  activeItem: string;
  onItemSelect: (item: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentRole,
  activeItem,
  onItemSelect,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const { user } = useAuth();

  // Keyboard shortcut listener: Toggle sidebar with Ctrl+B or Cmd+B
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        onToggleCollapse();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToggleCollapse]);

  const operatorInitial = user?.fullName
    ? user.fullName.charAt(0).toUpperCase()
    : currentRole === 'ADMIN'
      ? 'A'
      : 'S';

  const operatorName = user?.fullName || (currentRole === 'ADMIN' ? 'Admin Console' : 'Operations Staff');

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={`sidebar-overlay ${isMobileOpen ? 'visible' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}
        aria-label="Main Navigation"
      >
        {/* Branding & Top Controls Area (Top Side) */}
        <div
          style={{
            height: 'var(--header-height)',
            padding: isCollapsed ? '0 var(--space-2)' : '0 var(--space-4)',
            borderBottom: '1px solid var(--bg-sidebar-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isCollapsed ? 'center' : 'space-between',
            gap: 'var(--space-2)',
            flexShrink: 0,
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {isCollapsed ? (
            <Tooltip content={`Place Your Service • Click to expand (Ctrl+B)`} position="right">
              <button
                type="button"
                onClick={onToggleCollapse}
                aria-label="Expand sidebar"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%)',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '13px',
                  letterSpacing: '-0.02em',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.06)';
                  e.currentTarget.style.boxShadow =
                    '0 6px 16px rgba(37, 99, 235, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow =
                    '0 4px 12px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)';
                }}
              >
                PYS
              </button>
            </Tooltip>
          ) : (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  overflow: 'hidden',
                  minWidth: 0,
                  cursor: 'pointer',
                }}
                onClick={() => onItemSelect('dashboard')}
                title="Go to Operations Dashboard"
              >
                {/* 3D Glowing Brand Badge */}
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #0284c7 0%, #2563eb 50%, #4f46e5 100%)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '13px',
                    flexShrink: 0,
                    letterSpacing: '-0.02em',
                    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                  }}
                >
                  PYS
                </div>

                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: '13.5px',
                      color: '#ffffff',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      letterSpacing: '-0.01em',
                      lineHeight: 1.2,
                    }}
                  >
                    Place Your Service
                  </div>
                  <div
                    style={{
                      fontSize: '10.5px',
                      color: 'var(--color-neutral-400)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      marginTop: '2px',
                    }}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ color: 'var(--color-neutral-300)', fontWeight: 500 }}>
                      Role: {currentRole}
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                {/* Desktop Collapse Toggle on Top Side */}
                <Tooltip content="Collapse sidebar (Ctrl+B)" position="bottom">
                  <button
                    type="button"
                    onClick={onToggleCollapse}
                    aria-label="Collapse sidebar"
                    className="sidebar-collapse-btn-desktop"
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--color-neutral-400)',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                      e.currentTarget.style.color = '#ffffff';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.color = 'var(--color-neutral-400)';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.06)';
                    }}
                  >
                    <ChevronLeft size={15} />
                  </button>
                </Tooltip>

                {/* Mobile Close Button */}
                {isMobileOpen && (
                  <button
                    type="button"
                    onClick={onCloseMobile}
                    style={{
                      color: 'var(--color-neutral-400)',
                      padding: '6px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    aria-label="Close sidebar"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Navigation Groups with Sleek Custom Scrollbar */}
        <nav className="sidebar-nav">
          {NAV_STRUCTURE.map((group) => {
            if (group.adminOnly && currentRole !== 'ADMIN') return null;

            return (
              <div
                key={group.group}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                  marginBottom: isCollapsed ? 'var(--space-1)' : 'var(--space-2)',
                }}
              >
                {!isCollapsed ? (
                  <div
                    style={{
                      fontSize: '9.5px',
                      fontWeight: 700,
                      color: 'var(--color-neutral-400)',
                      padding: 'var(--space-1) var(--space-3)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      opacity: 0.75,
                    }}
                  >
                    {group.group}
                  </div>
                ) : (
                  <div
                    style={{
                      height: '1px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      margin: '4px 8px',
                    }}
                  />
                )}

                {group.items.map((item) => {
                  if (item.adminOnly && currentRole !== 'ADMIN') return null;
                  const Icon = item.icon;
                  const isActive = activeItem === item.id;

                  const navButton = (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onItemSelect(item.id);
                        if (isMobileOpen) onCloseMobile();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        gap: 'var(--space-3)',
                        padding: isCollapsed ? '9px 0' : '8px 12px',
                        borderRadius: 'var(--radius-md)',
                        background: isActive
                          ? 'linear-gradient(90deg, rgba(14, 165, 233, 0.16) 0%, rgba(37, 99, 235, 0.08) 100%)'
                          : 'transparent',
                        borderLeft: isActive
                          ? '3px solid var(--color-brand)'
                          : '3px solid transparent',
                        color: isActive ? '#ffffff' : 'var(--color-neutral-300)',
                        fontSize: 'var(--text-sm)',
                        fontWeight: isActive ? 600 : 400,
                        width: '100%',
                        textAlign: 'left',
                        transition: 'all 0.15s ease',
                        borderTop: 'none',
                        borderRight: 'none',
                        borderBottom: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        boxSizing: 'border-box',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                          e.currentTarget.style.color = '#ffffff';
                          if (!isCollapsed) {
                            e.currentTarget.style.transform = 'translateX(2px)';
                          }
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = 'var(--color-neutral-300)';
                          if (!isCollapsed) {
                            e.currentTarget.style.transform = 'translateX(0)';
                          }
                        }
                      }}
                    >
                      <Icon
                        size={18}
                        style={{
                          color: isActive ? '#38bdf8' : 'var(--color-neutral-400)',
                          filter: isActive ? 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.45))' : 'none',
                          flexShrink: 0,
                          transition: 'color 0.15s ease',
                        }}
                      />
                      {!isCollapsed && (
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.01em',
                          }}
                        >
                          {item.label}
                        </span>
                      )}
                    </button>
                  );

                  return isCollapsed ? (
                    <Tooltip
                      key={item.id}
                      content={`${item.label} • ${group.group}`}
                      position="right"
                    >
                      {navButton}
                    </Tooltip>
                  ) : (
                    navButton
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Enterprise Bottom Operator / Workspace Card */}
        <div
          style={{
            padding: isCollapsed ? 'var(--space-3) var(--space-2)' : 'var(--space-3) var(--space-3)',
            borderTop: '1px solid var(--bg-sidebar-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            flexShrink: 0,
            overflow: 'hidden',
            boxSizing: 'border-box',
          }}
        >
          {isCollapsed ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Tooltip content={`${operatorName} (${currentRole}) • Click to expand (Ctrl+B)`} position="right">
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Expand sidebar"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#93c5fd',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '12px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-brand)';
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.transform = 'scale(1.06)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                    e.currentTarget.style.color = '#93c5fd';
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {operatorInitial}
                </button>
              </Tooltip>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 'var(--space-2)',
                padding: '6px 8px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                <div
                  style={{
                    width: '30px',
                    height: '30px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#93c5fd',
                    fontWeight: 700,
                    fontSize: '11px',
                    flexShrink: 0,
                  }}
                >
                  {operatorInitial}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--color-neutral-200)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {operatorName}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--color-neutral-400)', whiteSpace: 'nowrap' }}>
                    {currentRole} Session • Online
                  </div>
                </div>
              </div>

              <Tooltip content="Collapse (Ctrl+B)" position="top">
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  aria-label="Collapse sidebar"
                  style={{
                    padding: '5px',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-neutral-400)',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = '#ffffff';
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-neutral-400)';
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
